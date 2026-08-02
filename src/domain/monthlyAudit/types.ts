/**
 * Contratos de domínio da AUDITORIA MENSAL por competência (AAPEx 1.3.5, D4).
 *
 * Espelham as migrations 0042–0044 e nada mais. Onde o servidor calcula, aqui há
 * um campo de LEITURA — `score` e `status` da auditoria não entram em nenhum
 * tipo de entrada, porque não é a interface que os produz.
 *
 * TERMINOLOGIA (D8, obrigatória). "Auditoria Mensal" é o módulo de PROCESSO —
 * pergunta se a rotina que sustenta o número existe e é executada. Não confundir
 * com a Gestão Assistida, que é semanal e mede resultado.
 */

/** Modelo de que a avaliação é feita. O legado não deixa de existir. */
export type EvaluationModel = 'legacy_template' | 'monthly_criteria';

/**
 * Resposta a um critério de processo.
 *
 * QUATRO valores, contra os cinco de `traffic_light`. A diferença é o amarelo, e
 * ela é deliberada (ADR-135-003, D-N): o processo existe e é executado, ou não.
 */
export type CriterionAnswerStatus =
  | 'nao_avaliado'
  | 'conforme'
  | 'nao_conforme'
  | 'nao_aplicavel';

/** Estados da auditoria — os mesmos de `evaluations`, sem valor novo. */
export type MonthlyAuditStatus = 'draft' | 'submitted' | 'returned' | 'approved' | 'superseded';

export interface MonthlyEvidence {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Plano vinculado à não conformidade, no seu estado ATUAL. */
export interface MonthlyPlanLink {
  id: string;
  action: string;
  owner: string;
  dueDate: string;
  priority: string;
  /** Vocabulário de interface do motor de planos. */
  status: string;
}

export interface CriterionAnswer {
  id: string;
  status: CriterionAnswerStatus;
  /** Só faz sentido em `nao_aplicavel`: é o "não se aplica por quê". */
  justification: string;
  observation: string;
  diagnosis: string;
  answeredBy: string | null;
  answeredAt: string | null;
  evidences: MonthlyEvidence[];
  /** N:1 — uma não conformidade pode exigir mais de uma ação (D-R). */
  plans: MonthlyPlanLink[];
}

/** Proveniência: a que objetos do catálogo esta linha congelada se refere. */
export interface CriterionProvenance {
  regionalConfigId: string;
  regionalConfigVersionId: string;
  indicatorDefinitionId: string;
  indicatorVersionId: string;
  themeId: string;
  themeVersionId: string;
  criterionId: string;
  criterionVersionId: string;
}

export interface MaterializedCriterion {
  id: string;
  evaluationId: string;
  provenance: CriterionProvenance;

  criterionCode: string;
  indicatorCode: string;
  indicatorName: string;
  themeCode: string;
  themeName: string;

  /** Os dez campos de D4, copiados no ato da criação da auditoria. */
  question: string;
  description: string;
  guidance: string;
  sortOrder: number;
  required: boolean;
  evidenceRequired: boolean;
  allowsNa: boolean;
  requiresJustification: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;

  answer: CriterionAnswer;
}

export interface MonthlyAudit {
  id: string;
  operationId: string;
  partnerName: string;
  evaluationModel: EvaluationModel;
  /** `AAAA-MM`. */
  competence: string;
  periodStart: string;
  periodEnd: string;
  cycleLabel: string;
  status: MonthlyAuditStatus;
  /** Calculado pelo servidor. PROVISÓRIO enquanto A-10 estiver aberta. */
  score: number;
  authorUserId: string;
  authorName: string;
  submittedAt: string | null;
  validatedAt: string | null;
  validatorId: string | null;
  validatorName: string | null;
  validatorNote: string;
  approvedAt: string | null;
  criteria: MaterializedCriterion[];
}

/** Linha da lista de competências — o suficiente para listar sem carregar tudo. */
export interface MonthlyAuditSummary {
  id: string;
  operationId: string;
  competence: string;
  cycleLabel: string;
  status: MonthlyAuditStatus;
  score: number;
  submittedAt: string | null;
  approvedAt: string | null;
  criteriaCount: number;
  nonConformCount: number;
  pendingCount: number;
}

/** Conteúdo oficial congelado da auditoria aprovada. */
export interface MonthlyAuditSnapshot {
  snapshotId: string;
  evaluationId: string;
  period: string;
  score: number;
  approvedBy: string;
  approvedAt: string;
  /**
   * Identificador da regra de pontuação usada. Enquanto A-10 estiver aberta
   * carrega `proporcao-simples/A-10-pendente` — e a tela precisa dizer isso, em
   * vez de chamar o número de Índice.
   */
  scoreRule: string;
  official: MonthlyAudit;
}

/**
 * O que a interface pode enviar de uma resposta. Note o que NÃO está aqui: a
 * pergunta, a parametrização do critério e o score. Nenhum deles é do cliente.
 */
export interface CriterionAnswerPatch {
  status?: CriterionAnswerStatus;
  justification?: string;
  observation?: string;
  diagnosis?: string;
}

/** O que a interface envia para criar ou editar um plano da não conformidade. */
export interface MonthlyPlanInput {
  /** Presente = edição; ausente = criação. */
  id?: string;
  action: string;
  problem?: string;
  owner: string;
  dueDate: string;
  priority?: 'high' | 'medium' | 'low';
}
