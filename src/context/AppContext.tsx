/**
 * AppContext — camada de COMPATIBILIDADE em redução (estratégia strangler §9.3).
 *
 * Já NÃO é banco: lê/escreve no `localStore` compartilhado com os repositórios.
 * A identidade e as operações/auditoria migraram para providers dedicados
 * (`OperationsProvider`, `EvaluationsProvider`). Aqui restam apenas os métodos
 * ainda consumidos por telas não migradas (Ações, Validações, Performance),
 * que serão movidos para seus repositórios nos próximos verticais.
 */
import React, { createContext, ReactNode, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { resolveOperationalUser } from '../data/demoDirectory';
import { localStore } from '../data/store/localStore';
import { makeId } from '../utils/ids';
import { useAuth } from './AuthProvider';
import {
  ActionPlan,
  AppData,
  Operation,
  User,
  IndicatorResult,
  VisitReport,
} from '../types';
import { getScoreStatus } from '../utils/format';

interface AppContextValue {
  ready: boolean;
  data: AppData;
  /**
   * Identidade operacional derivada da SESSÃO CORPORATIVA autenticada
   * (`AuthProvider`). `null` quando anônimo ou sem vínculo operacional (§7).
   */
  currentUser: User | null;
  visibleOperations: Operation[];
  logout: () => Promise<void>;
  resetDemo: () => Promise<void>;
  getOperation: (operationId: string) => Operation | undefined;
  getUser: (userId: string) => User | undefined;
  saveActionPlan: (plan: Omit<ActionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  updateActionStatus: (actionId: string, status: ActionPlan['status']) => void;
  validateEvaluation: (evaluationId: string, decision: 'approved' | 'returned', note: string) => void;
  updateIndicatorResult: (resultId: string, patch: Partial<IndicatorResult>) => void;
  createVisitReport: (report: Omit<VisitReport, 'id' | 'createdAt' | 'createdBy'>) => string;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { state: authState, signOut } = useAuth();
  // Fonte única: o store local persistente, COMPARTILHADO com os repositórios —
  // telas migradas (repositório) e não migradas (AppContext) leem/escrevem no
  // mesmo estado, sem dessincronização. Hidratação disparada pelo RepositoryProvider.
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);
  const ready = useSyncExternalStore(localStore.subscribe, localStore.isReady);

  const currentUser = useMemo<User | null>(
    () => resolveOperationalUser(authState.session, data.users),
    [authState.session, data.users],
  );

  const visibleOperations = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin' || currentUser.role === 'regional') return data.operations;
    if (currentUser.role === 'coordinator') {
      return data.operations.filter((operation) => operation.coordinatorId === currentUser.id);
    }
    return data.operations.filter((operation) => operation.managerId === currentUser.id);
  }, [currentUser, data.operations]);

  const logout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const resetDemo = useCallback(async () => {
    await localStore.reset();
  }, []);

  const getOperation = useCallback((operationId: string) => data.operations.find((operation) => operation.id === operationId), [data.operations]);
  const getUser = useCallback((userId: string) => data.users.find((user) => user.id === userId), [data.users]);

  const saveActionPlan = useCallback((input: Omit<ActionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const now = new Date().toISOString();
    localStore.update((previous) => {
      if (input.id) {
        return {
          ...previous,
          actionPlans: previous.actionPlans.map((plan) => plan.id === input.id ? { ...plan, ...input, updatedAt: now } : plan),
        };
      }
      const plan: ActionPlan = { ...input, id: makeId('ACT'), createdAt: now, updatedAt: now };
      return { ...previous, actionPlans: [plan, ...previous.actionPlans] };
    });
  }, []);

  const updateActionStatus = useCallback((actionId: string, status: ActionPlan['status']) => {
    localStore.update((previous) => ({
      ...previous,
      actionPlans: previous.actionPlans.map((plan) => plan.id === actionId ? { ...plan, status, updatedAt: new Date().toISOString() } : plan),
    }));
  }, []);

  const validateEvaluation = useCallback((evaluationId: string, decision: 'approved' | 'returned', note: string) => {
    const evaluation = data.evaluations.find((item) => item.id === evaluationId);
    if (!evaluation) return;
    const now = new Date().toISOString();
    localStore.update((previous) => {
      const updatedEvaluations = previous.evaluations.map((item) => item.id !== evaluationId ? item : {
        ...item,
        status: decision,
        validatorId: currentUser?.id,
        validatorNote: note,
        validatedAt: now,
        updatedAt: now,
      });
      let updatedOperations = previous.operations;
      if (decision === 'approved') {
        updatedOperations = previous.operations.map((operation) => operation.id !== evaluation.operationId ? operation : {
          ...operation,
          previousScore: operation.currentScore,
          currentScore: evaluation.score,
          status: getScoreStatus(evaluation.score),
          lastAudit: now.slice(0, 10),
        });
      }
      return { ...previous, evaluations: updatedEvaluations, operations: updatedOperations };
    });
  }, [currentUser?.id, data.evaluations]);

  const updateIndicatorResult = useCallback((resultId: string, patch: Partial<IndicatorResult>) => {
    localStore.update((previous) => ({
      ...previous,
      indicatorResults: previous.indicatorResults.map((result) => result.id === resultId
        ? { ...result, ...patch, updatedAt: new Date().toISOString() }
        : result),
    }));
  }, []);

  const createVisitReport = useCallback((input: Omit<VisitReport, 'id' | 'createdAt' | 'createdBy'>) => {
    const id = makeId('VIS');
    const report: VisitReport = { ...input, id, createdAt: new Date().toISOString(), createdBy: currentUser?.id ?? '' };
    localStore.update((previous) => ({ ...previous, visitReports: [report, ...previous.visitReports] }));
    return id;
  }, [currentUser?.id]);

  const value = useMemo<AppContextValue>(() => ({
    ready,
    data,
    currentUser,
    visibleOperations,
    logout,
    resetDemo,
    getOperation,
    getUser,
    saveActionPlan,
    updateActionStatus,
    validateEvaluation,
    updateIndicatorResult,
    createVisitReport,
  }), [
    ready, data, currentUser, visibleOperations, logout, resetDemo, getOperation, getUser,
    saveActionPlan, updateActionStatus, validateEvaluation, updateIndicatorResult, createVisitReport,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve ser utilizado dentro de AppProvider.');
  return context;
}
