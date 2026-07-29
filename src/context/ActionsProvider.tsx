/**
 * Provider de Planos de Ação (Masterplan §13). Telas consomem `useActions()` —
 * escopo do usuário autenticado, dados via ActionsRepository (Local/Supabase).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { alertDialog } from '../utils/dialog';
import { ActionPlan, Operation } from '../types';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { scopeFromUser } from '../data/repositories/OperationsRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';
import { useOperations } from './OperationsProvider';

interface ActionsContextValue {
  plans: ActionPlan[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  updateStatus: (planId: string, status: ActionPlan['status']) => void;
  getOperation: (id: string) => Operation | undefined;
}

const ActionsContext = createContext<ActionsContextValue | undefined>(undefined);

export function ActionsProvider({ children }: { children: React.ReactNode }) {
  const { actions: repo, source } = useRepositories();
  const user = useOperationalUser();
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);
  // Mesma correção do bug "Parceiro não existente": a operação vem da lista
  // REAL já carregada, não do store local de demonstração.
  const { operations } = useOperations();
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setPlans([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await repo.listByScope(scopeFromUser(user));
    if (!res.ok) {
      setError(res.error.message);
      setPlans([]);
    } else {
      setPlans(res.value);
    }
    setLoading(false);
  }, [repo, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (source !== 'local') return undefined;
    return localStore.subscribe(() => void load());
  }, [source, load]);

  const updateStatus = useCallback(
    (planId: string, status: ActionPlan['status']) => {
      if (!user) return;
      void (async () => {
        const res = await repo.updateStatus(planId, status, {
          userId: user.id,
          role: user.role,
          name: user.name,
        });
        if (!res.ok) {
          // Recusa do servidor (transição/papel/segregação) precisa aparecer —
          // antes o erro era engolido e a tela fingia sucesso.
          alertDialog('Não foi possível atualizar', res.error.message);
          return;
        }
        // Recarrega para refletir o que foi PERSISTIDO (status + trilha de
        // validação), não o que a tela acha que aconteceu.
        await load();
      })();
    },
    [repo, user, load],
  );
  const getOperation = useCallback((id: string) => operations.find((o) => o.id === id), [operations]);

  const value = useMemo<ActionsContextValue>(
    () => ({ plans, loading, error, refresh: () => void load(), updateStatus, getOperation }),
    [plans, loading, error, load, updateStatus, getOperation],
  );

  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

export function useActions(): ActionsContextValue {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useActions exige ActionsProvider.');
  return ctx;
}
