/**
 * Identidade operacional derivada da sessão corporativa autenticada (§8, §9.3).
 * Fonte única para escopo — usada tanto pelo AppContext (compat) quanto pelos
 * providers de repositório. Não é "dado operacional": é a identidade da sessão.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { User } from '../types';
import { localStore } from '../data/store/localStore';
import { resolveOperationalUser } from '../data/demoDirectory';
import { useAuth } from './AuthProvider';

export function useOperationalUser(): User | null {
  const { state } = useAuth();
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);
  return useMemo(
    () => resolveOperationalUser(state.session, data.users),
    [state.session, data.users],
  );
}
