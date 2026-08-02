/**
 * Adapters da AUDITORIA MENSAL por competência (migrations 0042–0044).
 *
 * Dois, e nenhum deles finge ser o outro:
 *
 *   `SupabaseMonthlyAuditRepository`    — REAL REMOTO. Tudo por RPC.
 *   `UnavailableMonthlyAuditRepository` — modo demonstração. Recusa TUDO.
 *
 * POR QUE O SEGUNDO RECUSA EM VEZ DE SIMULAR. A auditoria mensal é unicidade de
 * competência por constraint, materialização congelada de critérios,
 * imutabilidade após envio, evidência com trava de armazenamento e snapshot
 * oficial imutável. Uma versão local em AsyncStorage aceitaria duas auditorias
 * da mesma competência, deixaria o catálogo reescrever auditoria criada e
 * chamaria de "evidência" um arquivo que nunca chegou a lugar nenhum.
 *
 * REAPROVEITAMENTO REAL DA EVIDÊNCIA. `attachEvidence` delega ao
 * `SupabaseEvidenceRepository`, que já faz reserva → upload → confirmação. O
 * servidor é que passou a despachar pelo modelo da avaliação (0044): o mesmo
 * `themeId` que é código de item no legado é código de CRITÉRIO aqui. Nenhuma
 * linha do caminho físico foi duplicada.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import {
  MonthlyAuditRepository,
  MonthlyEvidenceUpload,
} from '../../domain/repositories/monthlyAudit';
import {
  CriterionAnswerPatch,
  MaterializedCriterion,
  MonthlyAudit,
  MonthlyAuditSnapshot,
  MonthlyAuditSummary,
  MonthlyPlanInput,
} from '../../domain/monthlyAudit/types';
import { SupabaseEvidenceRepository } from './EvidenceRepository';

// ---------------------------------------------------------------------------
// Formas cruas devolvidas pelas RPCs
// ---------------------------------------------------------------------------

interface RawAnswer {
  id: string;
  status: MaterializedCriterion['answer']['status'];
  justification: string | null;
  observation: string | null;
  diagnosis: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  evidences: Array<{
    id: string; name: string; mimeType: string;
    sizeBytes: number | string; createdAt: string;
  }> | null;
  plans: Array<{
    id: string; action: string | null; owner: string | null;
    dueDate: string | null; priority: string | null; status: string;
  }> | null;
}

interface RawCriterion {
  id: string;
  evaluationId: string;
  regionalConfigId: string;
  regionalConfigVersionId: string;
  indicatorDefinitionId: string;
  indicatorVersionId: string;
  themeId: string;
  themeVersionId: string;
  criterionId: string;
  criterionVersionId: string;
  criterionCode: string;
  indicatorCode: string;
  indicatorName: string;
  themeCode: string;
  themeName: string;
  question: string;
  description: string | null;
  guidance: string | null;
  sortOrder: number;
  required: boolean;
  evidenceRequired: boolean;
  allowsNa: boolean;
  requiresJustification: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  answer: RawAnswer | null;
}

interface RawAudit {
  id: string;
  operationId: string;
  partnerName: string;
  evaluationModel: MonthlyAudit['evaluationModel'];
  competence: string;
  periodStart: string;
  periodEnd: string;
  cycleLabel: string | null;
  status: MonthlyAudit['status'];
  score: number | string;
  authorUserId: string;
  authorName: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  validatorId: string | null;
  validatorName: string | null;
  validatorNote: string | null;
  approvedAt: string | null;
  criteria: RawCriterion[] | null;
}

const num = (v: number | string | null | undefined, fallback = 0): number =>
  v === null || v === undefined ? fallback : Number(v);

/**
 * Resposta ausente NÃO vira objeto vazio: `nao_avaliado` com listas vazias é o
 * estado real de um critério recém-materializado, e é o que o servidor grava.
 * Inventar `null` aqui obrigaria toda a tela a tratar dois casos onde há um.
 */
function toAnswer(raw: RawAnswer | null): MaterializedCriterion['answer'] {
  return {
    id: raw?.id ?? '',
    status: raw?.status ?? 'nao_avaliado',
    justification: raw?.justification ?? '',
    observation: raw?.observation ?? '',
    diagnosis: raw?.diagnosis ?? '',
    answeredBy: raw?.answeredBy ?? null,
    answeredAt: raw?.answeredAt ?? null,
    evidences: (raw?.evidences ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      mimeType: e.mimeType,
      sizeBytes: num(e.sizeBytes),
      createdAt: e.createdAt,
    })),
    plans: (raw?.plans ?? []).map((p) => ({
      id: p.id,
      action: p.action ?? '',
      owner: p.owner ?? '',
      dueDate: p.dueDate ?? '',
      priority: p.priority ?? 'medium',
      status: p.status,
    })),
  };
}

function toCriterion(raw: RawCriterion): MaterializedCriterion {
  return {
    id: raw.id,
    evaluationId: raw.evaluationId,
    provenance: {
      regionalConfigId: raw.regionalConfigId,
      regionalConfigVersionId: raw.regionalConfigVersionId,
      indicatorDefinitionId: raw.indicatorDefinitionId,
      indicatorVersionId: raw.indicatorVersionId,
      themeId: raw.themeId,
      themeVersionId: raw.themeVersionId,
      criterionId: raw.criterionId,
      criterionVersionId: raw.criterionVersionId,
    },
    criterionCode: raw.criterionCode,
    indicatorCode: raw.indicatorCode,
    indicatorName: raw.indicatorName,
    themeCode: raw.themeCode,
    themeName: raw.themeName,
    question: raw.question,
    description: raw.description ?? '',
    guidance: raw.guidance ?? '',
    sortOrder: raw.sortOrder ?? 0,
    required: raw.required,
    evidenceRequired: raw.evidenceRequired,
    allowsNa: raw.allowsNa,
    requiresJustification: raw.requiresJustification,
    effectiveFrom: raw.effectiveFrom,
    effectiveTo: raw.effectiveTo,
    answer: toAnswer(raw.answer),
  };
}

function toAudit(raw: RawAudit): MonthlyAudit {
  return {
    id: raw.id,
    operationId: raw.operationId,
    partnerName: raw.partnerName,
    evaluationModel: raw.evaluationModel,
    competence: raw.competence,
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    cycleLabel: raw.cycleLabel ?? '',
    status: raw.status,
    score: num(raw.score),
    authorUserId: raw.authorUserId,
    authorName: raw.authorName ?? '',
    submittedAt: raw.submittedAt,
    validatedAt: raw.validatedAt,
    validatorId: raw.validatorId,
    validatorName: raw.validatorName,
    validatorNote: raw.validatorNote ?? '',
    approvedAt: raw.approvedAt,
    criteria: (raw.criteria ?? []).map(toCriterion),
  };
}

/**
 * A mensagem do servidor é repassada CRUA quando existe.
 *
 * As recusas desta superfície são nominais e escritas para o operador ("envio
 * bloqueado: CRIT-03 em nao conformidade sem plano de acao"). Substituí-las por
 * "Falha ao enviar" esconderia exatamente o que resolve o problema.
 */
const fail = (fallback: string, cause: { message?: string } | null): AppError =>
  new AppError('network/unavailable', cause?.message || fallback, { cause, severity: 'medium' });

// ---------------------------------------------------------------------------
// Adapter corporativo
// ---------------------------------------------------------------------------

export class SupabaseMonthlyAuditRepository implements MonthlyAuditRepository {
  constructor(
    private readonly client: SupabaseClient,
    /** A MESMA instância do provider: é ela que sobe o binário ao bucket. */
    private readonly evidence: SupabaseEvidenceRepository,
  ) {}

  async startAudit(operationId: string, competence: string): Promise<Result<MonthlyAudit>> {
    const { data, error } = await this.client.rpc('start_monthly_audit', {
      p_operation_id: operationId,
      p_competence: competence,
    });
    if (error) return err(fail('Falha ao iniciar a auditoria da competência.', error));
    return ok(toAudit(data as RawAudit));
  }

  async getAudit(operationId: string, competence: string): Promise<Result<MonthlyAudit | null>> {
    const { data, error } = await this.client.rpc('get_monthly_audit', {
      p_operation_id: operationId,
      p_competence: competence,
    });
    if (error) return err(fail('Falha ao carregar a auditoria da competência.', error));
    // Competência ainda não iniciada devolve nulo — é estado, não erro.
    return ok(data ? toAudit(data as RawAudit) : null);
  }

  async listAudits(operationId: string, limit = 24): Promise<Result<MonthlyAuditSummary[]>> {
    const { data, error } = await this.client.rpc('list_monthly_audits', {
      p_operation_id: operationId,
      p_limit: limit,
    });
    if (error) return err(fail('Falha ao carregar o histórico de competências.', error));
    return ok(((data ?? []) as Array<MonthlyAuditSummary & { score: number | string }>)
      .map((s) => ({ ...s, score: num(s.score) })));
  }

  async saveAnswer(
    answerId: string, patch: CriterionAnswerPatch,
  ): Promise<Result<MaterializedCriterion>> {
    const { data, error } = await this.client.rpc('save_criterion_answer', {
      p_answer_id: answerId,
      p_patch: patch,
    });
    if (error) return err(fail('Falha ao salvar a resposta do critério.', error));
    return ok(toCriterion(data as RawCriterion));
  }

  async attachEvidence(
    evaluationId: string, criterionCode: string, file: MonthlyEvidenceUpload,
  ): Promise<Result<void>> {
    // `themeId` é o código do CRITÉRIO aqui — o servidor despacha pelo modelo da
    // avaliação (0044). Nenhuma cópia do caminho físico.
    const res = await this.evidence.attach(evaluationId, criterionCode, {
      themeId: criterionCode,
      name: file.name,
      uri: file.uri,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      type: file.mimeType.startsWith('image/') ? 'photo' : 'document',
    });
    return res.ok ? ok(undefined) : err(res.error);
  }

  async removeEvidence(evaluationId: string, evidenceId: string): Promise<Result<void>> {
    const { error } = await this.client.rpc('remove_evidence', {
      p_evaluation_id: evaluationId,
      p_evidence_id: evidenceId,
    });
    if (error) return err(fail('Falha ao remover a evidência.', error));
    return ok(undefined);
  }

  async savePlan(
    operationId: string, evaluationId: string, answerId: string, input: MonthlyPlanInput,
  ): Promise<Result<void>> {
    // `save_action_plan` é o MOTOR ÚNICO. O que distingue a origem é
    // `monthlyCriterionAnswerId`, e nada mais.
    const { error } = await this.client.rpc('save_action_plan', {
      p_input: {
        ...(input.id ? { id: input.id } : {}),
        operationId,
        evaluationId,
        monthlyCriterionAnswerId: answerId,
        action: input.action,
        problem: input.problem ?? '',
        owner: input.owner,
        dueDate: input.dueDate,
        priority: input.priority ?? 'high',
      },
    });
    if (error) return err(fail('Falha ao salvar o plano de ação.', error));
    return ok(undefined);
  }

  async submitAudit(evaluationId: string): Promise<Result<MonthlyAudit>> {
    const { data, error } = await this.client.rpc('submit_monthly_audit', {
      p_evaluation_id: evaluationId,
    });
    if (error) return err(fail('Falha ao enviar a auditoria.', error));
    return ok(toAudit(data as RawAudit));
  }

  async validateAudit(
    evaluationId: string, decision: 'approved' | 'returned', note: string,
  ): Promise<Result<MonthlyAudit>> {
    const { data, error } = await this.client.rpc('validate_evaluation', {
      p_evaluation_id: evaluationId,
      p_decision: decision,
      p_note: note,
    });
    if (error) return err(fail('Falha ao registrar a decisão.', error));
    return ok(toAudit(data as RawAudit));
  }

  async getSnapshot(evaluationId: string): Promise<Result<MonthlyAuditSnapshot>> {
    const { data, error } = await this.client.rpc('get_monthly_audit_snapshot', {
      p_evaluation_id: evaluationId,
    });
    if (error) return err(fail('Falha ao carregar o conteúdo oficial da auditoria.', error));
    const raw = data as MonthlyAuditSnapshot & { score: number | string; official: RawAudit };
    return ok({ ...raw, score: num(raw.score), official: toAudit(raw.official) });
  }
}

// ---------------------------------------------------------------------------
// Adapter honesto do modo demonstração
// ---------------------------------------------------------------------------

export const MONTHLY_AUDIT_UNAVAILABLE_MESSAGE =
  'A Auditoria Mensal existe apenas no ambiente corporativo. '
  + 'A unicidade da competência, a materialização dos critérios, a imutabilidade após o envio, '
  + 'a comprovação das evidências e o snapshot oficial são impostos pelo servidor, '
  + 'e não têm equivalente no modo demonstração.';

export class UnavailableMonthlyAuditRepository implements MonthlyAuditRepository {
  private refuse<T>(): Promise<Result<T>> {
    return Promise.resolve(err(new AppError('config/missing-env', MONTHLY_AUDIT_UNAVAILABLE_MESSAGE, {
      severity: 'low',
    })));
  }

  startAudit(_o: string, _c: string) { return this.refuse<MonthlyAudit>(); }
  getAudit(_o: string, _c: string) { return this.refuse<MonthlyAudit | null>(); }
  listAudits(_o: string, _l?: number) { return this.refuse<MonthlyAuditSummary[]>(); }
  saveAnswer(_a: string, _p: CriterionAnswerPatch) { return this.refuse<MaterializedCriterion>(); }
  attachEvidence(_e: string, _c: string, _f: MonthlyEvidenceUpload) { return this.refuse<void>(); }
  removeEvidence(_e: string, _i: string) { return this.refuse<void>(); }
  savePlan(_o: string, _e: string, _a: string, _i: MonthlyPlanInput) { return this.refuse<void>(); }
  submitAudit(_e: string) { return this.refuse<MonthlyAudit>(); }
  validateAudit(_e: string, _d: 'approved' | 'returned', _n: string) { return this.refuse<MonthlyAudit>(); }
  getSnapshot(_e: string) { return this.refuse<MonthlyAuditSnapshot>(); }
}
