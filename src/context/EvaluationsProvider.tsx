/**
 * Provider de Visitas/Auditorias/Avaliações (Masterplan §6, §7.4). As telas
 * consomem `useEvaluations()` — nunca o AppContext como banco.
 *
 * Leituras reativas vêm do store local (fonte REAL LOCAL); as mutações passam pelo
 * `EvaluationsRepository` selecionado (Local ou Supabase). Assim OperationDetail e
 * Evaluation operam sobre persistência real, com a mesma interface em ambos os modos.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActionPlan, AssessmentAnswer, Evaluation, Evidence, Frequency, Operation, User } from '../types';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { EvidenceInput, ActionPlanInput } from '../data/repositories/EvaluationsRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';
import { useOperations } from './OperationsProvider';
import { useDirectory } from './DirectoryProvider';

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
  const { evaluations: repo, source } = useRepositories();
  const user = useOperationalUser();
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);
  // Operação é entidade REAL, já buscada pela mesma fonte que preenche a
  // lista (§ correção do bug "Parceiro não existente"). `data.operations` é
  // o store local de demonstração — nunca populado pelos dados corporativos.
  const { operations } = useOperations();
  // Usuário real vem do diretório compartilhado, não do seed local.
  const { getUser } = useDirectory();

  /**
   * Avaliações visíveis, carregadas UMA vez pelo repositório do modo vigente.
   * Antes os lookups liam `data.evaluations` (localStore de demonstração):
   * em modo corporativo o histórico vinha sempre vazio, uma avaliação criada
   * no servidor voltava como "não encontrada" e `getCurrentDraft` nunca
   * achava o rascunho aberto — o guard de ciclo em andamento não disparava.
   */
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  const load = useCallback(async () => {
    if (!user) {
      setEvaluations([]);
      return;
    }
    const res = await repo.listVisible();
    setEvaluations(res.ok ? res.value : []);
  }, [repo, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reatividade do modo demonstração; em corporativo o refetch é explícito.
  useEffect(() => {
    if (source !== 'local') return undefined;
    return localStore.subscribe(() => void load());
  }, [source, load]);

  const getEvaluation = useCallback((id: string) => evaluations.find((e) => e.id === id), [evaluations]);
  const getOperation = useCallback((id: string) => operations.find((o) => o.id === id), [operations]);
  const listByOperation = useCallback(
    (operationId: string) =>
      evaluations
        .filter((e) => e.operationId === operationId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [evaluations],
  );
  const getCurrentDraft = useCallback(
    (operationId: string) =>
      evaluations.find((e) => e.operationId === operationId && ['draft', 'returned'].includes(e.status)),
    [evaluations],
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
      // Recarrega ANTES de devolver o id: a tela navega em seguida e precisa
      // encontrar a avaliação recém-criada no servidor.
      await load();
      return res.ok ? res.value.id : null;
    },
    [repo, user?.id, load],
  );
  const saveAnswer = useCallback(
    (evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>) => {
      void repo.saveAnswer(evaluationId, themeId, patch).then(() => load());
    },
    [repo, load],
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
      // O status muda no servidor; sem recarregar, a tela seguiria mostrando
      // a avaliação como rascunho.
      await load();
      return res.ok ? { ok: true } : { ok: false, message: res.error.message };
    },
    [repo, load],
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
