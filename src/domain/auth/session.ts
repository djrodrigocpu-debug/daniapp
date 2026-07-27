/**
 * Regras de sessão e derivação de escopo (Masterplan §5.4, §7.1; Anexo D — T10).
 * Funções puras — a I/O de autenticação fica no repositório (Supabase).
 */
import { UserScope, Role } from '../model';
import { AuthzSubject } from '../authz/policy';

export interface SessionLike {
  userId: string;
  scopes: UserScope[];
  accessTokenExpiresAt: string; // ISO
}

/** Escopos ativos e vigentes na data de referência. */
export function activeScopes(scopes: UserScope[], nowISO: string): UserScope[] {
  const now = Date.parse(nowISO);
  return scopes.filter(
    (s) => s.active && (s.validTo === null || Date.parse(s.validTo) > now) && Date.parse(s.validFrom) <= now,
  );
}

/** Papéis efetivos derivados dos escopos ativos. */
export function rolesFromScopes(scopes: UserScope[], nowISO: string): Role[] {
  const roles = new Set<Role>();
  for (const s of activeScopes(scopes, nowISO)) roles.add(s.role);
  return [...roles];
}

/** Constrói o sujeito de autorização a partir da sessão (liga policy à sessão). */
export function subjectFromSession(session: SessionLike, nowISO: string): AuthzSubject {
  const active = activeScopes(session.scopes, nowISO);
  const regionIds = new Set<string>();
  const coordinationIds = new Set<string>();
  const assignedOperationIds = new Set<string>();
  for (const s of active) {
    if (s.role === 'regional' && s.regionId) regionIds.add(s.regionId);
    if (s.role === 'coordinator' && s.coordinationId) coordinationIds.add(s.coordinationId);
    if (s.role === 'channel_manager') s.operationIds.forEach((id) => assignedOperationIds.add(id));
  }
  return {
    userId: session.userId,
    roles: rolesFromScopes(session.scopes, nowISO),
    regionIds: [...regionIds],
    coordinationIds: [...coordinationIds],
    assignedOperationIds: [...assignedOperationIds],
  };
}

/** Sessão expirada quando o token venceu (T10). */
export function isSessionExpired(session: Pick<SessionLike, 'accessTokenExpiresAt'>, nowISO: string): boolean {
  return Date.parse(session.accessTokenExpiresAt) <= Date.parse(nowISO);
}
