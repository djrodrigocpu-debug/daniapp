/**
 * Identidade operacional derivada da sessão corporativa autenticada (§8, §9.3).
 * Fonte única para escopo — usada pela navegação e pelos providers de repositório.
 * Não é "dado operacional": é a identidade da sessão.
 *
 * Separa os caminhos pelo MODO de autenticação (AuthProvider):
 *   supabase → identidade EXCLUSIVAMENTE da sessão autoritativa (nunca localStore);
 *   demo     → ponte com o diretório demonstrativo derivado do seed local;
 *   unconfigured → sem backend, sem identidade.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { User } from '../types';
import { localStore } from '../data/store/localStore';
import { resolveOperationalUser } from '../data/demoDirectory';
import { operationalUserFromSession } from '../domain/auth/operationalUser';
import { AuthenticatedSession } from '../domain/repositories';
import { AuthMode } from '../services/auth/authFactory';
import { useAuth } from './AuthProvider';

/**
 * Regra pura de identidade por modo (testável sem React). Em `supabase`, a
 * identidade vem só da sessão — `localUsers` é ignorado, garantindo que o seed
 * local NUNCA seja consultado no ambiente remoto.
 */
export function resolveIdentity(
  mode: AuthMode,
  session: AuthenticatedSession | null,
  localUsers: User[],
): User | null {
  if (mode === 'supabase') return operationalUserFromSession(session);
  if (mode === 'demo') return resolveOperationalUser(session, localUsers);
  return null;
}

export function useOperationalUser(): User | null {
  const { state, mode } = useAuth();
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);
  return useMemo(
    () => resolveIdentity(mode, state.session, data.users),
    [mode, state.session, data.users],
  );
}
