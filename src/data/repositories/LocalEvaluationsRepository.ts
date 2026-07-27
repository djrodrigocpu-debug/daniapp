/**
 * Implementação REAL LOCAL do EvaluationsRepository sobre o store persistente.
 * Contém a lógica canônica de auditoria (abrir ciclo, responder, evidência, plano,
 * enviar) — extraída do AppContext. Reusa o guard de domínio `canSubmit` (§7.4) e
 * o cálculo de nota `calculateScore` (§6.4). Mesma interface do adapter Supabase.
 */
import { ActionPlan, AssessmentAnswer, Evaluation, Evidence, Frequency } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { canSubmit, SubmissionItem } from '../../domain/scoring/submission';
import { themes } from '../catalog';
import { calculateScore } from '../../utils/scoring';
import { makeId } from '../../utils/ids';
import { LocalStore, localStore } from '../store/localStore';
import { EvidenceRepository, LocalEvidenceRepository } from './EvidenceRepository';
import {
  ActionPlanInput,
  EvaluationsRepository,
  EvidenceInput,
} from './EvaluationsRepository';

const OPEN_STATUSES: Evaluation['status'][] = ['draft', 'returned'];

function blankAnswers(frequency: Frequency): AssessmentAnswer[] {
  return themes
    .filter((theme) => theme.frequency === frequency)
    .map((theme) => ({ themeId: theme.id, status: 'not_evaluated', measuredValue: '', observation: '', evidenceIds: [] }));
}

export class LocalEvaluationsRepository implements EvaluationsRepository {
  constructor(
    private readonly store: LocalStore = localStore,
    private readonly evidence: EvidenceRepository = new LocalEvidenceRepository(store),
  ) {}

  async getById(id: string): Promise<Result<Evaluation | null>> {
    return ok(this.store.getSnapshot().evaluations.find((item) => item.id === id) ?? null);
  }

  async listByOperation(operationId: string): Promise<Result<Evaluation[]>> {
    const list = this.store
      .getSnapshot()
      .evaluations.filter((item) => item.operationId === operationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok(list);
  }

  async getCurrentDraft(operationId: string): Promise<Result<Evaluation | null>> {
    const draft = this.store
      .getSnapshot()
      .evaluations.find((item) => item.operationId === operationId && OPEN_STATUSES.includes(item.status));
    return ok(draft ?? null);
  }

  async startEvaluation(operationId: string, frequency: Frequency, evaluatorId: string): Promise<Result<Evaluation>> {
    // Idempotência de ciclo: reaproveita rascunho/devolvida do mesmo tipo (sem duplicar em retry).
    const existing = this.store
      .getSnapshot()
      .evaluations.find(
        (item) => item.operationId === operationId && OPEN_STATUSES.includes(item.status) && item.frequency === frequency,
      );
    if (existing) return ok(existing);

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + (frequency === 'weekly' ? 6 : 29));
    const evaluation: Evaluation = {
      id: makeId('EV'),
      operationId,
      cycleLabel:
        frequency === 'weekly'
          ? `Semana de ${new Intl.DateTimeFormat('pt-BR').format(now)}`
          : `${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(now)}`,
      periodStart: now.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      frequency,
      evaluatorId,
      status: 'draft',
      score: 0,
      answers: blankAnswers(frequency),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.store.update((previous) => ({ ...previous, evaluations: [evaluation, ...previous.evaluations] }));
    return ok(evaluation);
  }

  async saveAnswer(evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>): Promise<Result<Evaluation>> {
    let updated: Evaluation | null = null;
    this.store.update((previous) => ({
      ...previous,
      evaluations: previous.evaluations.map((evaluation) => {
        if (evaluation.id !== evaluationId) return evaluation;
        const answers = evaluation.answers.map((answer) =>
          answer.themeId === themeId ? { ...answer, ...patch } : answer,
        );
        updated = { ...evaluation, answers, score: calculateScore(answers), updatedAt: new Date().toISOString() };
        return updated;
      }),
    }));
    if (!updated) return err('validation/invalid-input', 'Avaliação não encontrada.');
    return ok(updated);
  }

  async addEvidence(evaluationId: string, themeId: string, input: EvidenceInput): Promise<Result<Evidence>> {
    // Armazenamento delegado ao EvidenceRepository (Local: URI + status 'local';
    // Supabase: upload ao bucket). Aqui só vinculamos ao item da auditoria.
    const stored = await this.evidence.store({
      themeId, name: input.name, uri: input.uri, mimeType: input.mimeType, type: input.type, sizeBytes: input.sizeBytes,
    });
    if (!stored.ok) return stored;
    const evidence = stored.value;
    this.store.update((previous) => ({
      ...previous,
      evaluations: previous.evaluations.map((evaluation) => {
        if (evaluation.id !== evaluationId) return evaluation;
        return {
          ...evaluation,
          answers: evaluation.answers.map((answer) =>
            answer.themeId === themeId ? { ...answer, evidenceIds: [...answer.evidenceIds, evidence.id] } : answer,
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
    return ok(evidence);
  }

  async removeEvidence(evaluationId: string, evidenceId: string): Promise<Result<true>> {
    await this.evidence.remove(evidenceId); // remove o arquivo/registro no storage
    this.store.update((previous) => ({
      ...previous,
      evaluations: previous.evaluations.map((evaluation) =>
        evaluation.id !== evaluationId
          ? evaluation
          : {
              ...evaluation,
              answers: evaluation.answers.map((answer) => ({
                ...answer,
                evidenceIds: answer.evidenceIds.filter((id) => id !== evidenceId),
              })),
              updatedAt: new Date().toISOString(),
            },
      ),
    }));
    return ok(true);
  }

  async saveActionPlan(input: ActionPlanInput): Promise<Result<ActionPlan>> {
    const now = new Date().toISOString();
    let saved: ActionPlan | null = null;
    this.store.update((previous) => {
      if (input.id) {
        const plans = previous.actionPlans.map((plan) => {
          if (plan.id !== input.id) return plan;
          saved = { ...plan, ...input, id: plan.id, updatedAt: now };
          return saved;
        });
        return { ...previous, actionPlans: plans };
      }
      saved = { ...input, id: makeId('ACT'), createdAt: now, updatedAt: now } as ActionPlan;
      return { ...previous, actionPlans: [saved, ...previous.actionPlans] };
    });
    if (!saved) return err('validation/invalid-input', 'Plano de ação não pôde ser salvo.');
    return ok(saved);
  }

  async listActionPlans(evaluationId: string): Promise<Result<ActionPlan[]>> {
    return ok(this.store.getSnapshot().actionPlans.filter((plan) => plan.evaluationId === evaluationId));
  }

  async submit(evaluationId: string): Promise<Result<Evaluation>> {
    const data = this.store.getSnapshot();
    const evaluation = data.evaluations.find((item) => item.id === evaluationId);
    if (!evaluation) return err('validation/invalid-input', 'Avaliação não encontrada.');

    // Trava de envio (§7.4) via guard de domínio testado — completo/evidência/plano vermelho.
    const items: SubmissionItem[] = evaluation.answers.map((answer) => {
      const theme = themes.find((item) => item.id === answer.themeId);
      const hasPlan = data.actionPlans.some(
        (plan) => plan.evaluationId === evaluationId && plan.themeId === answer.themeId,
      );
      return {
        itemId: answer.themeId,
        title: theme?.title ?? answer.themeId,
        required: true,
        evidenceRequired: theme?.evidenceRequired ?? false,
        status: answer.status,
        evidenceCount: answer.evidenceIds.length,
        hasActionPlan: hasPlan,
      };
    });
    const gate = canSubmit(items);
    if (!gate.ok) return gate;

    const now = new Date().toISOString();
    let submitted: Evaluation | null = null;
    this.store.update((previous) => ({
      ...previous,
      evaluations: previous.evaluations.map((item) => {
        if (item.id !== evaluationId) return item;
        submitted = { ...item, status: 'submitted', submittedAt: now, updatedAt: now };
        return submitted;
      }),
    }));
    return submitted ? ok(submitted) : err('validation/invalid-input', 'Falha ao enviar.');
  }
}
