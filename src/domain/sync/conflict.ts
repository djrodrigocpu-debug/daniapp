/**
 * Regras de conflito de sincronização (Masterplan §12.4; Anexo D — T09, T11, T23, T24).
 *
 * Nunca mesclar silenciosamente campos críticos: em conflito, bloquear ou exigir
 * revisão explícita. O servidor é a autoridade.
 */
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';

/**
 * Concorrência otimista por row_version (T23). Se a versão esperada pelo cliente
 * não bate com a atual do servidor, há conflito — o usuário revisa a diferença.
 */
export function optimisticCheck(expectedRowVersion: number, currentRowVersion: number): Result<true> {
  if (expectedRowVersion !== currentRowVersion) {
    return err(
      new AppError('sync/conflict', 'Registro alterado por outra pessoa/dispositivo. Revise a diferença.', {
        severity: 'medium',
        details: { expectedRowVersion, currentRowVersion },
      }),
    );
  }
  return ok(true);
}

/** Evidência duplicada por hash/idempotência não é reinserida (T24). */
export function isDuplicateEvidence(existingHashes: readonly string[], sha256: string): boolean {
  return existingHashes.includes(sha256);
}

/**
 * Rascunho antigo tentando alterar um registro já submetido: rejeitar (§12.4).
 */
export function rejectStaleDraft(serverStatus: string): Result<true> {
  if (serverStatus !== 'draft' && serverStatus !== 'returned') {
    return err(new AppError('sync/stale-version', 'Registro já submetido; alteração de rascunho antigo rejeitada.', { severity: 'high' }));
  }
  return ok(true);
}

/**
 * Usuário perdeu o escopo antes de sincronizar (T11): o servidor NEGA e a
 * operação vai para revisão administrativa (não some silenciosamente).
 */
export function resolveLostScope(hasScopeNow: boolean): Result<true> {
  if (!hasScopeNow) {
    return err(new AppError('authz/out-of-scope', 'Escopo revogado antes da sincronização; operação enviada para revisão administrativa.', { severity: 'high' }));
  }
  return ok(true);
}

/**
 * Template mudou durante o rascunho: o rascunho mantém a versão de abertura;
 * novo ciclo usa a nova versão (§12.4). Retorna a versão que deve prevalecer.
 */
export function templateVersionForDraft(openedWithVersionId: string, _currentVersionId: string): string {
  return openedWithVersionId;
}
