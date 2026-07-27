/**
 * Contrato do repositório de Visitas/Auditorias/Avaliações (Masterplan §6, §7.4).
 *
 * No modelo da UI, a "visita/auditoria" de um ciclo é a própria `Evaluation`
 * (respostas por item, diagnóstico na observação, ciclo em cycleLabel/frequency).
 * As telas consomem via `EvaluationsProvider` — nunca o AppContext como banco.
 *
 * Adapters: `LocalEvaluationsRepository` (REAL LOCAL) e
 * `SupabaseEvaluationsRepository` (REAL REMOTO, pronto para conexão).
 */
import { ActionPlan, AssessmentAnswer, Evaluation, Evidence, Frequency } from '../../types';
import { Result } from '../../domain/errors/result';

export type EvidenceInput = Omit<Evidence, 'id' | 'themeId' | 'createdAt'>;
export type ActionPlanInput = Omit<ActionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export interface EvaluationsRepository {
  getById(id: string): Promise<Result<Evaluation | null>>;
  listByOperation(operationId: string): Promise<Result<Evaluation[]>>;
  /** Rascunho/devolvida em aberto para a operação (idempotência de ciclo). */
  getCurrentDraft(operationId: string): Promise<Result<Evaluation | null>>;
  /** Abre (ou reaproveita) a auditoria do ciclo — não duplica em retry. */
  startEvaluation(operationId: string, frequency: Frequency, evaluatorId: string): Promise<Result<Evaluation>>;
  /** Salva resposta de um item e recalcula a nota projetada (rascunho). */
  saveAnswer(evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>): Promise<Result<Evaluation>>;
  addEvidence(evaluationId: string, themeId: string, input: EvidenceInput): Promise<Result<Evidence>>;
  removeEvidence(evaluationId: string, evidenceId: string): Promise<Result<true>>;
  saveActionPlan(input: ActionPlanInput): Promise<Result<ActionPlan>>;
  listActionPlans(evaluationId: string): Promise<Result<ActionPlan[]>>;
  /** Envia para validação aplicando as travas (completo/evidência/plano vermelho). */
  submit(evaluationId: string): Promise<Result<Evaluation>>;
}
