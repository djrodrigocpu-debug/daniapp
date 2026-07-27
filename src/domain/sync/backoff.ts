/**
 * Backoff exponencial com teto (Masterplan §12.3). Determinístico por padrão
 * (sem jitter) para testes; jitter opcional para produção.
 */
export interface BackoffOptions {
  baseMs?: number;
  capMs?: number;
  jitter?: (n: number) => number; // injetável; ausente = sem jitter
}

/** Atraso da próxima tentativa (attempt começa em 0). */
export function nextDelayMs(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? 1000;
  const cap = options.capMs ?? 60_000;
  const raw = Math.min(cap, base * 2 ** Math.max(0, attempt));
  if (options.jitter) return Math.min(cap, options.jitter(raw));
  return raw;
}

/** Máximo de tentativas antes de marcar como falha persistente. */
export const MAX_ATTEMPTS = 6;

export function isExhausted(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS;
}
