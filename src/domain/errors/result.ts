/**
 * Tipo Result<T> — resultado explícito de operações que podem falhar por regra
 * de domínio, sem lançar exceção no fluxo esperado (Masterplan §16.2: erros
 * recuperáveis com orientação). Exceções ficam para falhas verdadeiramente
 * inesperadas.
 */
import { AppError, AppErrorCode } from './AppError';

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: AppError };
export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(error: AppError): Err;
export function err(code: AppErrorCode, message: string): Err;
export function err(errorOrCode: AppError | AppErrorCode, message?: string): Err {
  if (errorOrCode instanceof AppError) return { ok: false, error: errorOrCode };
  return { ok: false, error: new AppError(errorOrCode, message ?? errorOrCode) };
}

export function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.ok;
}

export function isErr<T>(result: Result<T>): result is Err {
  return !result.ok;
}

/** Extrai o valor ou lança — use apenas quando a falha for realmente excepcional. */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw result.error;
}

/** Aplica `fn` ao valor de sucesso, propagando o erro. */
export function mapResult<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  return result.ok ? ok(fn(result.value)) : result;
}
