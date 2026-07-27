/**
 * Erros de domínio padronizados (Masterplan §12, §13.4, §16.2).
 *
 * Todo erro de negócio/segurança carrega um `code` estável (para logs sem dados
 * sensíveis) e uma `message` apresentável ao usuário. Nunca inclua segredo,
 * token ou payload sensível em `message` ou `details` (§15.1).
 */

export type AppErrorCode =
  // autenticação / sessão
  | 'auth/invalid-credentials'
  | 'auth/session-expired'
  | 'auth/not-authenticated'
  | 'auth/mfa-required'
  // autorização (RBAC + escopo)
  | 'authz/forbidden'
  | 'authz/out-of-scope'
  | 'authz/self-approval'
  // validação de domínio
  | 'validation/incomplete'
  | 'validation/missing-evidence'
  | 'validation/missing-action-plan'
  | 'validation/score-divergence'
  | 'validation/invalid-input'
  // integridade histórica
  | 'integrity/immutable-record'
  | 'integrity/indicator-in-use'
  | 'integrity/template-in-use'
  // sincronização / offline
  | 'sync/conflict'
  | 'sync/duplicate'
  | 'sync/stale-version'
  // infraestrutura / configuração
  | 'config/missing-env'
  | 'network/unavailable'
  | 'storage/invalid-file'
  | 'unknown';

export type AppErrorSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AppErrorOptions {
  /** Detalhes não sensíveis para diagnóstico (nunca segredos). */
  details?: Record<string, string | number | boolean | null>;
  /** Severidade conforme Masterplan §13.4. */
  severity?: AppErrorSeverity;
  /** Erro de origem, preservado para telemetria. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly severity: AppErrorSeverity;
  readonly details?: Record<string, string | number | boolean | null>;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.severity = options.severity ?? 'medium';
    this.details = options.details;
  }

  /** Representação segura para log (sem stack, sem dados sensíveis). */
  toLogRecord(): { code: AppErrorCode; severity: AppErrorSeverity; message: string; details?: Record<string, string | number | boolean | null> } {
    return { code: this.code, severity: this.severity, message: this.message, details: this.details };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
