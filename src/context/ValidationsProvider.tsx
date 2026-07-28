/**
 * Provider de Validações (Masterplan §14). Telas consomem `useValidations()` —
 * fila por escopo, decisão via ValidationsRepository (Local/Supabase). As travas
 * (autoaprovação/escopo/imutabilidade) vivem no repositório/servidor.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Evaluation, Operation, User } from '../types';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { scopeFromUser } from '../data/repositories/OperationsRepository';
import { ValidationDecision } from '../data/repositories/ValidationsRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';
import { useOperations } from './OperationsProvider';
import { useDirectory } from './DirectoryProvider';

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
  // Mesma correção do bug "Parceiro não existente": a operação vem da lista
  // REAL já carregada, não do store local de demonstração.
  const { operations } = useOperations();
  // Avaliador é usuário real: vem do diretório compartilhado, não do seed.
  const { getUser } = useDirectory();
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

  const getOperation = useCallback((id: string) => operations.find((o) => o.id === id), [operations]);

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
