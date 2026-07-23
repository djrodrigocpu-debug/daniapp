/**
 * Provider de Visitas/Auditorias/Avaliações (Masterplan §6, §7.4). As telas
 * consomem `useEvaluations()` — nunca o AppContext como banco.
 *
 * Leituras reativas vêm do store local (fonte REAL LOCAL); as mutações passam pelo
 * `EvaluationsRepository` selecionado (Local ou Supabase). Assim OperationDetail e
 * Evaluation operam sobre persistência real, com a mesma interface em ambos os modos.
 */
import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { ActionPlan, AssessmentAnswer, Evaluation, Evidence, Frequency, Operation, User } from '../types';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { EvidenceInput, ActionPlanInput } from '../data/repositories/EvaluationsRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';

export type SubmitResult = { ok: true } | { ok: false; message: string };

interface EvaluationsContextValue {
  getEvaluation: (id: string) => Evaluation | undefined;
  getOperation: (id: string) => Operation | undefined;
  getUser: (id: string) => User | undefined;
  listByOperation: (operationId: string) => Evaluation[];
  getCurrentDraft: (operationId: string) => Evaluation | undefined;
  getActionPlan: (evaluationId: string, themeId: string) => ActionPlan | undefined;
  getEvidences: (ids: string[]) => Evidence[];
  startEvaluation: (operationId: string, frequency: Frequency) => Promise<string | null>;
  saveAnswer: (evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>) => void;
  addEvidence: (evaluationId: string, themeId: string, input: EvidenceInput) => void;
  removeEvidence: (evaluationId: string, evidenceId: string) => void;
  saveActionPlan: (input: ActionPlanInput) => void;
  submit: (evaluationId: string) => Promise<SubmitResult>;
}

const EvaluationsContext = createContext<EvaluationsContextValue | undefined>(undefined);

export function EvaluationsProvider({ children }: { children: React.ReactNode }) {
  const { evaluations: repo } = useRepositories();
  const user = useOperationalUser();
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);

  const getEvaluation = useCallback((id: string) => data.evaluations.find((e) => e.id === id), [data.evaluations]);
  const getOperation = useCallback((id: string) => data.operations.find((o) => o.id === id), [data.operations]);
  const getUser = useCallback((id: string) => data.users.find((u) => u.id === id), [data.users]);
  const listByOperation = useCallback(
    (operationId: string) =>
      data.evaluations
        .filter((e) => e.operationId === operationId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.evaluations],
  );
  const getCurrentDraft = useCallback(
    (operationId: string) =>
      data.evaluations.find((e) => e.operationId === operationId && ['draft', 'returned'].includes(e.status)),
    [data.evaluations],
  );
  const getActionPlan = useCallback(
    (evaluationId: string, themeId: string) =>
      data.actionPlans.find((p) => p.evaluationId === evaluationId && p.themeId === themeId),
    [data.actionPlans],
  );
  const getEvidences = useCallback(
    (ids: string[]) => ids.map((id) => data.evidences.find((e) => e.id === id)).filter((e): e is Evidence => !!e),
    [data.evidences],
  );

  const startEvaluation = useCallback(
    async (operationId: string, frequency: Frequency) => {
      const res = await repo.startEvaluation(operationId, frequency, user?.id ?? '');
      return res.ok ? res.value.id : null;
    },
    [repo, user?.id],
  );
  const saveAnswer = useCallback(
    (evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>) => {
      void repo.saveAnswer(evaluationId, themeId, patch);
    },
    [repo],
  );
  const addEvidence = useCallback(
    (evaluationId: string, themeId: string, input: EvidenceInput) => {
      void repo.addEvidence(evaluationId, themeId, input);
    },
    [repo],
  );
  const removeEvidence = useCallback(
    (evaluationId: string, evidenceId: string) => {
      void repo.removeEvidence(evaluationId, evidenceId);
    },
    [repo],
  );
  const saveActionPlan = useCallback(
    (input: ActionPlanInput) => {
      void repo.saveActionPlan(input);
    },
    [repo],
  );
  const submit = useCallback(
    async (evaluationId: string): Promise<SubmitResult> => {
      const res = await repo.submit(evaluationId);
      return res.ok ? { ok: true } : { ok: false, message: res.error.message };
    },
    [repo],
  );

  const value = useMemo<EvaluationsContextValue>(
    () => ({
      getEvaluation,
      getOperation,
      getUser,
      listByOperation,
      getCurrentDraft,
      getActionPlan,
      getEvidences,
      startEvaluation,
      saveAnswer,
      addEvidence,
      removeEvidence,
      saveActionPlan,
      submit,
    }),
    [getEvaluation, getOperation, getUser, listByOperation, getCurrentDraft, getActionPlan, getEvidences, startEvaluation, saveAnswer, addEvidence, removeEvidence, saveActionPlan, submit],
  );

  return <EvaluationsContext.Provider value={value}>{children}</EvaluationsContext.Provider>;
}

export function useEvaluations(): EvaluationsContextValue {
  const ctx = useContext(EvaluationsContext);
  if (!ctx) throw new Error('useEvaluations exige EvaluationsProvider.');
  return ctx;
}
