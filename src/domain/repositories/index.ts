/**
 * Contratos de repositório (Masterplan §9.3 — estratégia strangler).
 *
 * As telas deixam de ler o AppContext monolítico e passam a consumir estes
 * serviços de domínio. Cada contrato tem duas implementações possíveis:
 *  - `supabase/*` (corporativa, autoritativa no servidor);
 *  - `demo/*`     (isolada, apenas dev — nunca no build de produção).
 *
 * Todos os métodos retornam `Result<T>`: falhas de regra/negócio são valores,
 * não exceções (§16.2).
 */
import { Result } from '../errors/result';
import {
  UserAccount,
  UserScope,
  Operation,
  Evaluation,
  Validation,
  ValidationDecision,
  ActionPlan,
  IndicatorDefinition,
  IndicatorVersion,
  Measurement,
  EvidenceFile,
  Role,
} from '../model';

export interface AuthenticatedSession {
  user: UserAccount;
  scopes: UserScope[];
  /** Papéis efetivos derivados dos escopos ativos. */
  roles: Role[];
  accessTokenExpiresAt: string;
}

export interface AuthRepository {
  signIn(email: string, password: string): Promise<Result<AuthenticatedSession>>;
  signOut(): Promise<Result<true>>;
  getSession(): Promise<Result<AuthenticatedSession | null>>;
  requestPasswordReset(email: string): Promise<Result<true>>;
}

export interface VisitsRepository {
  listVisibleOperations(session: AuthenticatedSession): Promise<Result<Operation[]>>;
  getEvaluation(id: string): Promise<Result<Evaluation | null>>;
  saveDraft(evaluation: Evaluation): Promise<Result<Evaluation>>;
  submit(evaluationId: string, expectedRowVersion: number): Promise<Result<Evaluation>>;
  validate(
    evaluationId: string,
    decision: ValidationDecision,
    reason: string,
  ): Promise<Result<Validation>>;
}

export interface IndicatorsRepository {
  listDefinitions(includeInactive: boolean): Promise<Result<IndicatorDefinition[]>>;
  getActiveVersion(definitionId: string): Promise<Result<IndicatorVersion | null>>;
  /** Somente Administrador (D-05). */
  createDefinition(name: string, code: string): Promise<Result<IndicatorDefinition>>;
  /** Nova versão para mudança substantiva (§8.1). */
  createVersion(version: Omit<IndicatorVersion, 'id'>): Promise<Result<IndicatorVersion>>;
  /** Inativa para novas avaliações; nunca deleta se usado (D-05, T05). */
  deactivate(definitionId: string): Promise<Result<IndicatorDefinition>>;
  saveMeasurement(measurement: Measurement): Promise<Result<Measurement>>;
}

export interface ActionsRepository {
  listByOperation(operationId: string): Promise<Result<ActionPlan[]>>;
  save(plan: ActionPlan): Promise<Result<ActionPlan>>;
  updateStatus(
    planId: string,
    status: ActionPlan['status'],
    expectedRowVersion: number,
  ): Promise<Result<ActionPlan>>;
}

export interface EvidenceRepository {
  reserveMetadata(input: Omit<EvidenceFile, 'id' | 'status' | 'createdAt'>): Promise<Result<EvidenceFile>>;
  confirmStored(evidenceId: string, sha256: string): Promise<Result<EvidenceFile>>;
  /** URL assinada de curta duração (§11.5). */
  getSignedUrl(evidenceId: string, ttlSeconds: number): Promise<Result<string>>;
}

// ---------------------------------------------------------------------------
// Sincronização / outbox — §12.3
// ---------------------------------------------------------------------------

export type SyncOperationKind =
  | 'save_draft' | 'submit_evaluation' | 'save_action' | 'update_action_status' | 'save_measurement';

export interface SyncOperation {
  id: string;
  idempotencyKey: string;
  kind: SyncOperationKind;
  payload: unknown;
  expectedRowVersion: number | null;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export interface SyncService {
  enqueue(op: Omit<SyncOperation, 'id' | 'attempts' | 'createdAt'>): Promise<Result<SyncOperation>>;
  pending(): Promise<Result<SyncOperation[]>>;
  flush(): Promise<Result<{ processed: number; failed: number }>>;
}
