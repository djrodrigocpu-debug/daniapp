/**
 * Provider de Operações + Dashboard (Masterplan §6, §15). As telas consomem
 * `useOperations()`/`useDashboard()` — nunca o `AppContext` como banco.
 *
 * Deriva o escopo do usuário autenticado, consulta o `OperationsRepository`
 * (Local ou Supabase, injetado pelo RepositoryProvider) e expõe estados de
 * carregamento/erro/vazio com retry. Recarrega quando o store local muda (para
 * refletir mutações feitas por outras telas ainda não migradas).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Operation } from '../types';
import { DashboardMetrics } from '../domain/dashboard/metrics';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { scopeFromUser } from '../data/repositories/OperationsRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';

interface OperationsContextValue {
  operations: Operation[];
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const OperationsContext = createContext<OperationsContextValue | undefined>(undefined);

export function OperationsProvider({ children }: { children: React.ReactNode }) {
  const { operations: repo, source } = useRepositories();
  const user = useOperationalUser();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setOperations([]);
      setMetrics(null);
      setLoading(false);
      setError(null);
      return;
    }
    const scope = scopeFromUser(user);
    setLoading(true);
    setError(null);
    const [opsRes, dashRes] = await Promise.all([repo.listVisible(scope), repo.getDashboard(scope)]);
    if (!opsRes.ok) {
      setOperations([]);
      setMetrics(null);
      setError(opsRes.error.message);
      setLoading(false);
      return;
    }
    setOperations(opsRes.value);
    setMetrics(dashRes.ok ? dashRes.value : null);
    setError(dashRes.ok ? null : dashRes.error.message);
    setLoading(false);
  }, [repo, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reatividade REAL LOCAL: mutações no store (por telas ainda em AppContext)
  // recarregam operações/métricas. Em modo Supabase a atualização vem do refetch.
  useEffect(() => {
    if (source !== 'local') return undefined;
    return localStore.subscribe(() => {
      void load();
    });
  }, [source, load]);

  const value = useMemo<OperationsContextValue>(
    () => ({ operations, metrics, loading, error, refresh: () => void load() }),
    [operations, metrics, loading, error, load],
  );

  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

function useOperationsContext(): OperationsContextValue {
  const ctx = useContext(OperationsContext);
  if (!ctx) throw new Error('useOperations/useDashboard exigem OperationsProvider.');
  return ctx;
}

export function useOperations(): Pick<OperationsContextValue, 'operations' | 'loading' | 'error' | 'refresh'> {
  const { operations, loading, error, refresh } = useOperationsContext();
  return { operations, loading, error, refresh };
}

export function useDashboard(): Pick<OperationsContextValue, 'metrics' | 'loading' | 'error' | 'refresh'> {
  const { metrics, loading, error, refresh } = useOperationsContext();
  return { metrics, loading, error, refresh };
}
