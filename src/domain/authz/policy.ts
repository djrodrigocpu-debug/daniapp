/**
 * Política de autorização RBAC + escopo (Masterplan §5.1; Anexo B).
 *
 * Este módulo é a versão de DOMÍNIO da autorização, usada pela interface para
 * exibir/ocultar e para bloquear ações antes de chamar o servidor. Ele NÃO
 * substitui a RLS (segurança real no banco, §5.1, migration 0002) — apenas a
 * espelha para melhorar usabilidade. Funções puras, testáveis (T01, T02, T28).
 */
import { Role } from '../model';

/** Sujeito de autorização derivado da sessão (escopos ativos achatados). */
export interface AuthzSubject {
  userId: string;
  roles: Role[];
  /** Regiões sob escopo regional. */
  regionIds: string[];
  /** Coordenadorias sob escopo de coordenador. */
  coordinationIds: string[];
  /** Operações diretamente atribuídas (GC). */
  assignedOperationIds: string[];
}

/** Operação com os atributos necessários à decisão de escopo. */
export interface ScopedOperation {
  id: string;
  regionId: string;
  coordinationId: string;
}

export function hasRole(subject: AuthzSubject, role: Role): boolean {
  return subject.roles.includes(role);
}

export function isAdmin(subject: AuthzSubject): boolean {
  return hasRole(subject, 'admin');
}

/**
 * Acesso a uma operação (§5.1; Anexo D — T01). Nega por padrão; libera se:
 * admin, OU regional da região, OU coordenador da coordenadoria, OU GC atribuído.
 */
export function canAccessOperation(subject: AuthzSubject, op: ScopedOperation): boolean {
  if (isAdmin(subject)) return true;
  if (hasRole(subject, 'regional') && subject.regionIds.includes(op.regionId)) return true;
  if (hasRole(subject, 'coordinator') && subject.coordinationIds.includes(op.coordinationId)) return true;
  if (hasRole(subject, 'channel_manager') && subject.assignedOperationIds.includes(op.id)) return true;
  return false;
}

/**
 * Pode validar (aprovar/devolver) a avaliação? Coordenador com acesso à operação
 * E que NÃO é o autor (§5.3; Anexo D — T02: ninguém aprova a própria submissão).
 */
export function canValidate(
  subject: AuthzSubject,
  evaluation: { authorUserId: string; operation: ScopedOperation },
): boolean {
  if (evaluation.authorUserId === subject.userId) return false; // sem autoaprovação
  if (!hasRole(subject, 'coordinator')) return false;
  return canAccessOperation(subject, evaluation.operation);
}

/** Somente Administrador gerencia indicadores (§8.1, D-05; Anexo B). */
export function canManageIndicators(subject: AuthzSubject): boolean {
  return isAdmin(subject);
}

/** Somente Administrador gerencia usuários/vínculos (Anexo B). */
export function canManageUsers(subject: AuthzSubject): boolean {
  return isAdmin(subject);
}

/** Pode criar visita? GC (atribuída), coordenador (se autorizado), admin (excepcional). */
export function canCreateVisit(subject: AuthzSubject, op: ScopedOperation, coordinatorMayCreate: boolean): boolean {
  if (isAdmin(subject)) return true;
  if (hasRole(subject, 'channel_manager') && subject.assignedOperationIds.includes(op.id)) return true;
  if (coordinatorMayCreate && hasRole(subject, 'coordinator') && subject.coordinationIds.includes(op.coordinationId)) {
    return true;
  }
  return false;
}

export type ExportScope =
  | { kind: 'all' }
  | { kind: 'regions'; ids: string[] }
  | { kind: 'coordinations'; ids: string[] }
  | { kind: 'operations'; ids: string[] }
  | { kind: 'none' };

/**
 * Escopo de exportação por perfil (§5.2, §7.10; Anexo D — T16). Toda exportação
 * é registrada com autor/período/escopo/finalidade (ver exportGuard).
 */
export function exportScope(subject: AuthzSubject): ExportScope {
  if (isAdmin(subject)) return { kind: 'all' };
  if (hasRole(subject, 'regional')) return { kind: 'regions', ids: subject.regionIds };
  if (hasRole(subject, 'coordinator')) return { kind: 'coordinations', ids: subject.coordinationIds };
  if (hasRole(subject, 'channel_manager')) return { kind: 'operations', ids: subject.assignedOperationIds };
  return { kind: 'none' };
}

/**
 * Ranking nominal individual: PROIBIDO no piloto para qualquer perfil
 * (§4, §8.5; Anexo D — T28). Trava ética inegociável nesta fase.
 */
export function canSeeNominalRanking(_subject: AuthzSubject): boolean {
  return false;
}
