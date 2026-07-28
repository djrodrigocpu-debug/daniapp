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
  /**
   * `redirectTo` é o destino do link do e-mail. Sem ele, o GoTrue usa a Site URL
   * e o app não recebe o callback — por isso é explícito aqui.
   */
  requestPasswordReset(email: string, redirectTo?: string): Promise<Result<true>>;

  /**
   * Consome o link de convite/recuperação e estabelece a sessão. Recebe a
   * INTENÇÃO já interpretada (src/domain/auth/callbackLink) para que a regra de
   * leitura da URL fique testável fora do SDK.
   *
   * Opcional: só o backend corporativo implementa. No modo demonstração não há
   * link de e-mail para consumir.
   */
  completeAuthCallback?(intent: AuthCallbackIntent): Promise<Result<AuthenticatedSession>>;

  /** Define a senha do usuário JÁ autenticado pelo callback. */
  updatePassword?(password: string): Promise<Result<true>>;

  /**
   * Ativa o PRÓPRIO perfil após o convite (RPC public.activate_self, 0012).
   * A autorização é do servidor: o cliente não informa quem ativar.
   */
  activateSelf?(): Promise<Result<true>>;

  // -------------------------------------------------------------------------
  // Gate de primeiro acesso (migrations 0016/0017)
  // -------------------------------------------------------------------------

  /**
   * Autentica no provedor SEM montar a sessão corporativa.
   *
   * Existe porque `signIn` acima devolve a sessão já montada, e montar a sessão
   * corporativa é exatamente o que NÃO pode acontecer enquanto a senha temporária
   * não for trocada. Separar as duas etapas é o que permite ao controlador
   * consultar o gate no meio do caminho.
   */
  signInRaw?(email: string, password: string): Promise<Result<true>>;

  /** Lê `public.password_change_status()` sob o JWT do próprio usuário. */
  passwordGate?(): Promise<Result<PasswordGateState>>;

  /**
   * Troca a senha temporária pela Edge Function `initial-password-change`.
   *
   * O cliente NÃO chama `auth.updateUser` aqui: a troca precisa provar a senha
   * atual e encerrar o onboarding com service role, e nenhuma das duas coisas
   * pode acontecer no dispositivo.
   */
  completeInitialPasswordChange?(
    currentPassword: string,
    newPassword: string,
  ): Promise<Result<true>>;

  /** Renova o token depois da troca de senha, antes de reler o gate. */
  refreshSession?(): Promise<Result<true>>;
}

/**
 * Estado do gate, SEMPRE lido do servidor — nunca inferido no cliente.
 *
 * `authenticated` distingue "não há sessão no provedor" de "há sessão e ela está
 * liberada": sem essa distinção, uma leitura falha pareceria acesso livre.
 */
export interface PasswordGateState {
  /** true quando existe sessão no provedor de identidade. */
  authenticated: boolean;
  /** true enquanto a senha temporária não for trocada. */
  required: boolean;
  /** Apenas rótulo para a tela do gate; não é credencial. */
  email: string | null;
}

/**
 * Intenção extraída do link de callback. Espelha CallbackIntent do domínio sem
 * criar dependência circular entre `domain/auth` e `domain/repositories`.
 */
export type AuthCallbackIntent =
  | { kind: 'pkce_code'; code: string }
  | { kind: 'token_hash'; tokenHash: string; purpose: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string };

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
