/**
 * Provider de Validações (Masterplan §14). Telas consomem `useValidations()` —
 * fila por escopo, decisão via ValidationsRepository (Local/Supabase). As travas
 * (autoaprovação/escopo/imutabilidade) vivem no repositório/servidor.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Evaluation, Operation, User } from '../types';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { scopeFromUser } from '../data/repositories/OperationsRepository';
import { ValidationDecision } from '../data/repositories/ValidationsRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';

export type ValidateResult = { ok: true } | { ok: false; message: string };

interface ValidationsContextValue {
  pending: Evaluation[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  validate: (evaluationId: string, decision: ValidationDecision, note: string) => Promise<ValidateResult>;
  getOperation: (id: string) => Operation | undefined;
  getUser: (id: string) => User | undefined;
}

const ValidationsContext = createContext<ValidationsContextValue | undefined>(undefined);

export function ValidationsProvider({ children }: { children: React.ReactNode }) {
  const { validations: repo, source } = useRepositories();
  const user = useOperationalUser();
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);
  const [pending, setPending] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setPending([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await repo.listPending(scopeFromUser(user));
    if (!res.ok) {
      setError(res.error.message);
      setPending([]);
    } else {
      setPending(res.value);
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

  const validate = useCallback(
    async (evaluationId: string, decision: ValidationDecision, note: string): Promise<ValidateResult> => {
      if (!user) return { ok: false, message: 'Sessão inválida.' };
      const res = await repo.validate(evaluationId, { userId: user.id, role: user.role }, decision, note);
      return res.ok ? { ok: true } : { ok: false, message: res.error.message };
    },
    [repo, user],
  );

  const getOperation = useCallback((id: string) => data.operations.find((o) => o.id === id), [data.operations]);
  const getUser = useCallback((id: string) => data.users.find((u) => u.id === id), [data.users]);

  const value = useMemo<ValidationsContextValue>(
    () => ({ pending, loading, error, refresh: () => void load(), validate, getOperation, getUser }),
    [pending, loading, error, load, validate, getOperation, getUser],
  );

  return <ValidationsContext.Provider value={value}>{children}</ValidationsContext.Provider>;
}

export function useValidations(): ValidationsContextValue {
  const ctx = useContext(ValidationsContext);
  if (!ctx) throw new Error('useValidations exige ValidationsProvider.');
  return ctx;
}
