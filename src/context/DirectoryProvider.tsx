/**
 * Diretório de usuários da sessão — resolve `User` por UUID para as telas que
 * exibem nome de GC, coordenador ou avaliador.
 *
 * FONTE ÚNICA e compartilhada: `EvaluationsProvider` e `ValidationsProvider`
 * consomem daqui em vez de cada um procurar no `localStore` de demonstração,
 * que em modo corporativo nunca contém os usuários reais.
 *
 * UMA consulta por sessão, indexada por id — nenhuma chamada por item
 * renderizado. Em modo demonstração o `localStore` continua sendo a fonte e a
 * reatividade é preservada pela assinatura do store.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '../types';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';

interface DirectoryContextValue {
  /** Usuários visíveis ao solicitante (a RLS filtra no servidor). */
  users: User[];
  loading: boolean;
  error: string | null;
  /**
   * Resolve por UUID canônico. `undefined` significa "não veio do servidor" —
   * pode ser inexistência real OU limite de visibilidade da RLS; a tela mostra
   * "—" nos dois casos, sem afirmar que a entidade não existe.
   */
  getUser: (id: string) => User | undefined;
  refresh: () => void;
}

const DirectoryContext = createContext<DirectoryContextValue | undefined>(undefined);

export function DirectoryProvider({ children }: { children: React.ReactNode }) {
  const { directory: repo, source } = useRepositories();
  const currentUser = useOperationalUser();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Sem sessão não há diretório a carregar — e nem RLS que o filtre.
    if (!currentUser) {
      setUsers([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await repo.listUsers();
    if (!res.ok) {
      setUsers([]);
      setError(res.error.message);
    } else {
      setUsers(res.value);
    }
    setLoading(false);
  }, [repo, currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reatividade do modo demonstração: mutações no store recarregam o diretório.
  // Em modo corporativo a atualização vem do refetch explícito.
  useEffect(() => {
    if (source !== 'local') return undefined;
    return localStore.subscribe(() => void load());
  }, [source, load]);

  // Índice por UUID: o lookup das telas é O(1) e não dispara consulta alguma.
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const getUser = useCallback((id: string) => byId.get(id), [byId]);

  const value = useMemo<DirectoryContextValue>(
    () => ({ users, loading, error, getUser, refresh: () => void load() }),
    [users, loading, error, getUser, load],
  );

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): DirectoryContextValue {
  const ctx = useContext(DirectoryContext);
  if (!ctx) throw new Error('useDirectory exige DirectoryProvider.');
  return ctx;
}
