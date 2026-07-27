/**
 * Identidade OPERACIONAL da UI derivada EXCLUSIVAMENTE da sessão corporativa
 * autenticada (Masterplan §8, §5.4). Em `source=supabase`, a identidade é a sessão
 * autoritativa do servidor — NUNCA o seed/localStore.
 *
 * Regra crítica: um Administrador com escopo ativo e campos hierárquicos nulos
 * (sem região, coordenadoria, unidade ou operações) É uma identidade VÁLIDA e não
 * pode cair em "Perfil sem vínculo". Os campos legados `region`/`coordinatorId` são
 * apenas visuais — usam rótulos neutros e nunca UUIDs inventados.
 *
 * Função pura e testável — sem relógio, sem I/O, sem leitura de store.
 */
import { User, UserRole } from '../../types';
import { AuthenticatedSession } from '../repositories';
import { Role } from '../model';

/** Prioridade quando a sessão tem múltiplos papéis ativos (mais amplo primeiro). */
export const ROLE_PRIORITY: readonly Role[] = ['admin', 'regional', 'coordinator', 'channel_manager'];

/** Rótulo neutro de "área de atuação" — puramente visual, não é dado de escopo. */
const AREA_LABEL: Record<Role, string> = {
  admin: 'Corporativo',
  regional: 'Gerência Regional',
  coordinator: 'Coordenação',
  channel_manager: 'Gerente de Canal',
};

/** Papel ativo de maior prioridade da sessão; null quando não há papel ativo. */
export function primaryRole(roles: readonly Role[]): Role | null {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

/**
 * Constrói o `User` de UI a partir da sessão autenticada. Retorna `null` apenas
 * quando NÃO há papel/escopo ativo reconhecido (aí sim, perfil sem vínculo).
 */
export function operationalUserFromSession(session: AuthenticatedSession | null): User | null {
  if (!session) return null;

  const role = primaryRole(session.roles);
  if (!role) return null; // autenticado, porém sem papel ativo — sem vínculo (§7)

  // Escopo do papel escolhido (para valores visuais legados; pode não existir).
  const scope = session.scopes.find((s) => s.role === role && s.active) ?? null;

  return {
    id: session.user.id,
    name: session.user.displayName,
    email: session.user.corporateEmail,
    role: role as UserRole,
    // Legado/visual — nunca inventa UUID. Coordenador expõe sua coordenadoria.
    coordinatorId: role === 'coordinator' ? (scope?.coordinationId ?? undefined) : undefined,
    region: AREA_LABEL[role],
    avatarInitials: initials(session.user.displayName),
    active: session.user.status === 'active',
  };
}
