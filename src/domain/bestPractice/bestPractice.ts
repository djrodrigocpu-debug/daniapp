/**
 * Boas práticas: proposta, moderação e publicação (Masterplan §7.9;
 * Anexo D — T27).
 *
 * GCs e Coordenadores propõem; o Coordenador modera; antes de publicar, remover
 * dados pessoais. Publicação de conteúdo com possível dado pessoal é bloqueada
 * pela moderação.
 */
import { AuthzSubject, hasRole, isAdmin } from '../authz/policy';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';

export interface BestPracticeDraft {
  title: string;
  content: string;
  /** Sinalizado pela moderação como contendo possível dado pessoal. */
  containsPersonalData: boolean;
}

export function canPropose(subject: AuthzSubject): boolean {
  return (
    isAdmin(subject) ||
    hasRole(subject, 'regional') ||
    hasRole(subject, 'coordinator') ||
    hasRole(subject, 'channel_manager')
  );
}

export function canModerate(subject: AuthzSubject): boolean {
  return isAdmin(subject) || hasRole(subject, 'coordinator');
}

/**
 * Publicação: exige moderador autorizado e ausência de dado pessoal (T27).
 * Popularidade não substitui validação.
 */
export function assertCanPublish(subject: AuthzSubject, draft: BestPracticeDraft): Result<true> {
  if (!canModerate(subject)) {
    return err(new AppError('authz/forbidden', 'Somente Coordenador ou Administrador publicam boas práticas.', { severity: 'high' }));
  }
  if (draft.containsPersonalData) {
    return err(new AppError('validation/invalid-input', 'Remova dados pessoais antes de publicar a boa prática.', { severity: 'high' }));
  }
  if (draft.title.trim().length < 3 || draft.content.trim().length < 10) {
    return err(new AppError('validation/incomplete', 'Boa prática exige título e conteúdo mínimos.'));
  }
  return ok(true);
}
