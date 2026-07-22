/**
 * Modelo de domínio corporativo AAPEX/AACE V2 (Masterplan §5, §6.3, §11.2).
 *
 * Substitui o modelo demonstrativo de `src/types` pela estrutura corporativa:
 * 4 perfis (inclui Administrador), escopos hierárquicos, versionamento de
 * indicadores/templates, estados de workflow e integridade histórica.
 *
 * Identificadores são UUID (strings) — não significativos (§11.1). Timestamps
 * são ISO-8601 em UTC.
 */

// ---------------------------------------------------------------------------
// Perfis e escopo (RBAC + ABAC) — §5.1
// ---------------------------------------------------------------------------

/** Quatro perfis com login no piloto (D-03/D-04). */
export type Role = 'admin' | 'regional' | 'coordinator' | 'channel_manager';

export const ALL_ROLES: readonly Role[] = ['admin', 'regional', 'coordinator', 'channel_manager'];

export type UserStatus = 'invited' | 'active' | 'suspended' | 'inactive';

export interface UserAccount {
  id: string;
  displayName: string;
  corporateEmail: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Vínculo temporal entre usuário, papel e escopo (§5.4, Anexo C `user_scopes`).
 * O escopo é definido pelo nível mais específico preenchido:
 * region → coordination → unit → operation.
 */
export interface UserScope {
  id: string;
  userId: string;
  role: Role;
  regionId: string | null;
  coordinationId: string | null;
  unitId: string | null;
  /** Operações às quais um GC está diretamente vinculado. */
  operationIds: string[];
  validFrom: string;
  validTo: string | null;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Estrutura organizacional — §11.2
// ---------------------------------------------------------------------------

export interface Organization { id: string; name: string; active: boolean; }
export interface Region { id: string; organizationId: string; name: string; active: boolean; }
export interface Coordination { id: string; regionId: string; name: string; coordinatorUserId: string | null; active: boolean; }
export interface Unit { id: string; regionId: string; name: string; timezone: string; active: boolean; }

export interface Operation {
  id: string;
  unitId: string;
  coordinationId: string;
  partnerName: string;
  officeName: string;
  city: string;
  state: 'PR' | 'SC';
  /** GC vinculado (autor das visitas). */
  channelManagerUserId: string | null;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Estados de workflow — §6.3
// ---------------------------------------------------------------------------

export type VisitType = 'weekly' | 'monthly';
export type VisitStatus =
  | 'planned' | 'draft' | 'ready' | 'submitted' | 'returned' | 'approved' | 'cancelled';
export type EvaluationStatus =
  | 'draft' | 'submitted' | 'returned' | 'approved' | 'superseded';
export type ActionStatus =
  | 'open' | 'in_progress' | 'blocked' | 'done' | 'overdue' | 'cancelled_justified';
export type EvidenceStatus =
  | 'local_pending' | 'uploading' | 'stored' | 'failed' | 'expired';
export type IndicatorLifecycle = 'draft' | 'active' | 'inactive';
export type TrafficLight = 'green' | 'yellow' | 'red' | 'not_evaluated' | 'not_applicable';

// ---------------------------------------------------------------------------
// Calendário — §6.1/§6.2
// ---------------------------------------------------------------------------

export type CalendarExceptionKind =
  | 'holiday' | 'rescheduled' | 'cancelled_justified' | 'not_performed';

export interface CalendarException {
  id: string;
  unitId: string;
  date: string; // YYYY-MM-DD
  kind: CalendarExceptionKind;
  reason: string;
  /** Nova data quando `kind === 'rescheduled'`. */
  rescheduledTo?: string;
}

export interface VisitRule {
  id: string;
  unitId: string;
  /** Dia da semana da visita (0=domingo..6=sábado). Terça = 2 (§6.1). */
  weeklyVisitWeekday: number;
  /** Ordinal da semana para auditoria mensal (1 = primeira). */
  monthlyAuditWeekOrdinal: number;
  /** Dia da semana da auditoria mensal (segunda = 1). */
  monthlyAuditWeekday: number;
  toleranceDays: number;
}

// ---------------------------------------------------------------------------
// Auditoria: templates versionados e itens — §6.1, §7.4, §11.4
// ---------------------------------------------------------------------------

export interface AuditTemplate { id: string; code: string; title: string; active: boolean; }

export interface AuditTemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  effectiveFrom: string;
  /** true quando já referenciado por alguma avaliação — imutável (§11.4). */
  locked: boolean;
}

export interface AuditItem {
  id: string;
  templateVersionId: string;
  code: string;
  title: string;
  pillar: string;
  weight: number;
  frequency: VisitType;
  required: boolean;
  evidenceRequired: boolean;
}

// ---------------------------------------------------------------------------
// Indicadores versionados — §8.1/§8.2, §11.3
// ---------------------------------------------------------------------------

export type IndicatorDirection = 'higher_better' | 'lower_better' | 'target_band';

export interface IndicatorDefinition {
  id: string;
  code: string; // estável, ex.: IND-012
  name: string;
  lifecycle: IndicatorLifecycle;
  createdAt: string;
}

export interface IndicatorVersion {
  id: string;
  definitionId: string;
  versionNumber: number;
  unit: string;
  direction: IndicatorDirection;
  target: number;
  yellowTolerance: number;
  weight: number;
  effectiveFrom: string;
  /** Situações em que não deve ser comparado (§8.2 "Limitações"). */
  limitations?: string;
}

export interface Measurement {
  id: string;
  operationId: string;
  indicatorVersionId: string;
  period: string; // YYYY-MM
  targetValue: number;
  actualValue: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Avaliação, respostas e snapshot — §11.4
// ---------------------------------------------------------------------------

export interface EvaluationAnswer {
  itemId: string;
  status: TrafficLight;
  measuredValue: string;
  observation: string;
  evidenceIds: string[];
}

export interface Evaluation {
  id: string;
  operationId: string;
  visitId: string;
  templateVersionId: string;
  authorUserId: string;
  status: EvaluationStatus;
  score: number;
  answers: EvaluationAnswer[];
  rowVersion: number;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfficialSnapshot {
  id: string;
  evaluationId: string;
  operationId: string;
  period: string;
  score: number;
  templateVersionId: string;
  answers: EvaluationAnswer[];
  approvedByUserId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Evidências — §11.5
// ---------------------------------------------------------------------------

export interface EvidenceFile {
  id: string;
  bucket: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  authorUserId: string;
  sourceObjectId: string;
  status: EvidenceStatus;
  retentionUntil: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Planos de ação, diagnóstico, validação — §7.6/§7.7/§7.8
// ---------------------------------------------------------------------------

export interface Diagnosis {
  id: string;
  evaluationId: string;
  itemId: string;
  finding: string;
  probableCause: string;
  impact: string;
  evidenceIds: string[];
}

export type ActionPriority = 'high' | 'medium' | 'low';

export interface ActionPlan {
  id: string;
  operationId: string;
  evaluationId: string;
  itemId: string;
  description: string;
  origin: string;
  ownerUserId: string;
  dueDate: string;
  priority: ActionPriority;
  completionCriterion: string;
  status: ActionStatus;
  completionEvidenceId?: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type ValidationDecision = 'approved' | 'returned';

export interface Validation {
  id: string;
  evaluationId: string;
  validatorUserId: string;
  decision: ValidationDecision;
  reason: string;
  createdAt: string;
}
