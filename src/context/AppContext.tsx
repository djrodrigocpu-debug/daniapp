import React, { createContext, ReactNode, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { themes } from '../data/catalog';
import { resolveOperationalUser } from '../data/demoDirectory';
import { localStore } from '../data/store/localStore';
import { useAuth } from './AuthProvider';
import {
  ActionPlan,
  AppData,
  AssessmentAnswer,
  Evaluation,
  Evidence,
  Frequency,
  Operation,
  TrafficLight,
  User,
  IndicatorResult,
  VisitReport,
} from '../types';
import { calculateScore, completionRate } from '../utils/scoring';
import { getScoreStatus } from '../utils/format';

type SubmitResult = { ok: true } | { ok: false; message: string };

interface AppContextValue {
  ready: boolean;
  data: AppData;
  /**
   * Identidade operacional derivada da SESSÃO CORPORATIVA autenticada
   * (`AuthProvider`). `null` quando anônimo ou quando a sessão não tem vínculo
   * operacional (perfil sem escopo — §7).
   */
  currentUser: User | null;
  visibleOperations: Operation[];
  logout: () => Promise<void>;
  resetDemo: () => Promise<void>;
  getOperation: (operationId: string) => Operation | undefined;
  getUser: (userId: string) => User | undefined;
  getEvaluation: (evaluationId: string) => Evaluation | undefined;
  getCurrentDraft: (operationId: string) => Evaluation | undefined;
  startEvaluation: (operationId: string, frequency: Frequency) => string;
  updateAnswer: (evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>) => void;
  addEvidence: (evaluationId: string, themeId: string, evidence: Omit<Evidence, 'id' | 'themeId' | 'createdAt'>) => void;
  removeEvidence: (evaluationId: string, evidenceId: string) => void;
  saveActionPlan: (plan: Omit<ActionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  updateActionStatus: (actionId: string, status: ActionPlan['status']) => void;
  submitEvaluation: (evaluationId: string) => SubmitResult;
  validateEvaluation: (evaluationId: string, decision: 'approved' | 'returned', note: string) => void;
  updateIndicatorResult: (resultId: string, patch: Partial<IndicatorResult>) => void;
  createVisitReport: (report: Omit<VisitReport, 'id' | 'createdAt' | 'createdBy'>) => string;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createBlankAnswers(frequency: Frequency): AssessmentAnswer[] {
  return themes
    .filter((theme) => theme.frequency === frequency)
    .map((theme) => ({
      themeId: theme.id,
      status: 'not_evaluated' as TrafficLight,
      measuredValue: '',
      observation: '',
      evidenceIds: [],
    }));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { state: authState, signOut } = useAuth();
  // Fonte única: o store local persistente, COMPARTILHADO com os repositórios —
  // telas migradas (repositório) e não migradas (AppContext) leem/escrevem no
  // mesmo estado, sem dessincronização. A hidratação é disparada pelo
  // RepositoryProvider no boot (§17).
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);
  const ready = useSyncExternalStore(localStore.subscribe, localStore.isReady);

  // A identidade operacional vem da SESSÃO CORPORATIVA autenticada — nunca de um
  // login demonstrativo. Resolve por id (alinhado no diretório demo) e cai para
  // e-mail corporativo (compatível com um provisionamento Supabase futuro). Sem
  // vínculo operacional ⇒ `null` (perfil sem escopo, §7).
  const currentUser = useMemo<User | null>(
    () => resolveOperationalUser(authState.session, data.users),
    [authState.session, data.users],
  );

  const visibleOperations = useMemo(() => {
    if (!currentUser) return [];
    // Administrador e Regional enxergam todo o escopo; Coordenador vê a própria
    // coordenadoria; GC vê apenas as operações sob sua responsabilidade.
    if (currentUser.role === 'admin' || currentUser.role === 'regional') return data.operations;
    if (currentUser.role === 'coordinator') {
      return data.operations.filter((operation) => operation.coordinatorId === currentUser.id);
    }
    return data.operations.filter((operation) => operation.managerId === currentUser.id);
  }, [currentUser, data.operations]);

  const logout = useCallback(async () => {
    // Encerra a sessão corporativa; `currentUser` volta a `null` reativamente.
    await signOut();
  }, [signOut]);

  const resetDemo = useCallback(async () => {
    await localStore.reset();
  }, []);

  const getOperation = useCallback((operationId: string) => data.operations.find((operation) => operation.id === operationId), [data.operations]);
  const getUser = useCallback((userId: string) => data.users.find((user) => user.id === userId), [data.users]);
  const getEvaluation = useCallback((evaluationId: string) => data.evaluations.find((evaluation) => evaluation.id === evaluationId), [data.evaluations]);
  const getCurrentDraft = useCallback((operationId: string) => data.evaluations.find((evaluation) => evaluation.operationId === operationId && ['draft', 'returned'].includes(evaluation.status)), [data.evaluations]);

  const startEvaluation = useCallback((operationId: string, frequency: Frequency) => {
    const existing = data.evaluations.find((evaluation) => evaluation.operationId === operationId && ['draft', 'returned'].includes(evaluation.status) && evaluation.frequency === frequency);
    if (existing) return existing.id;

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + (frequency === 'weekly' ? 6 : 29));
    const id = makeId('EV');
    const evaluation: Evaluation = {
      id,
      operationId,
      cycleLabel: frequency === 'weekly'
        ? `Semana de ${new Intl.DateTimeFormat('pt-BR').format(now)}`
        : `${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(now)}`,
      periodStart: now.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      frequency,
      evaluatorId: currentUser?.id ?? '',
      status: 'draft',
      score: 0,
      answers: createBlankAnswers(frequency),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    localStore.update((previous) => ({ ...previous, evaluations: [evaluation, ...previous.evaluations] }));
    return id;
  }, [currentUser?.id, data.evaluations]);

  const updateAnswer = useCallback((evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>) => {
    localStore.update((previous) => ({
      ...previous,
      evaluations: previous.evaluations.map((evaluation) => {
        if (evaluation.id !== evaluationId) return evaluation;
        const answers = evaluation.answers.map((answer) => answer.themeId === themeId ? { ...answer, ...patch } : answer);
        return { ...evaluation, answers, score: calculateScore(answers), updatedAt: new Date().toISOString() };
      }),
    }));
  }, []);

  const addEvidence = useCallback((evaluationId: string, themeId: string, input: Omit<Evidence, 'id' | 'themeId' | 'createdAt'>) => {
    const evidence: Evidence = { ...input, id: makeId('EVD'), themeId, createdAt: new Date().toISOString() };
    localStore.update((previous) => ({
      ...previous,
      evidences: [evidence, ...previous.evidences],
      evaluations: previous.evaluations.map((evaluation) => {
        if (evaluation.id !== evaluationId) return evaluation;
        return {
          ...evaluation,
          answers: evaluation.answers.map((answer) => answer.themeId === themeId
            ? { ...answer, evidenceIds: [...answer.evidenceIds, evidence.id] }
            : answer),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  }, []);

  const removeEvidence = useCallback((evaluationId: string, evidenceId: string) => {
    localStore.update((previous) => ({
      ...previous,
      evidences: previous.evidences.filter((evidence) => evidence.id !== evidenceId),
      evaluations: previous.evaluations.map((evaluation) => evaluation.id !== evaluationId ? evaluation : {
        ...evaluation,
        answers: evaluation.answers.map((answer) => ({ ...answer, evidenceIds: answer.evidenceIds.filter((id) => id !== evidenceId) })),
        updatedAt: new Date().toISOString(),
      }),
    }));
  }, []);

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

  const submitEvaluation = useCallback((evaluationId: string): SubmitResult => {
    const evaluation = data.evaluations.find((item) => item.id === evaluationId);
    if (!evaluation) return { ok: false, message: 'Avaliação não encontrada.' };
    const rate = completionRate(evaluation.answers);
    if (rate < 100) return { ok: false, message: `Preencha todos os itens antes de enviar. Conclusão atual: ${rate}%.` };

    for (const answer of evaluation.answers) {
      const theme = themes.find((item) => item.id === answer.themeId);
      if (!theme) continue;
      if (theme.evidenceRequired && answer.status !== 'not_applicable' && answer.evidenceIds.length === 0) {
        return { ok: false, message: `Inclua uma evidência em “${theme.title}”.` };
      }
      if (answer.status === 'red') {
        const hasPlan = data.actionPlans.some((plan) => plan.evaluationId === evaluationId && plan.themeId === answer.themeId);
        if (!hasPlan) return { ok: false, message: `Crie um plano de ação para o item vermelho “${theme.title}”.` };
      }
    }

    const now = new Date().toISOString();
    localStore.update((previous) => ({
      ...previous,
      evaluations: previous.evaluations.map((item) => item.id === evaluationId ? { ...item, status: 'submitted', submittedAt: now, updatedAt: now } : item),
    }));
    return { ok: true };
  }, [data.actionPlans, data.evaluations]);

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
    getEvaluation,
    getCurrentDraft,
    startEvaluation,
    updateAnswer,
    addEvidence,
    removeEvidence,
    saveActionPlan,
    updateActionStatus,
    submitEvaluation,
    validateEvaluation,
    updateIndicatorResult,
    createVisitReport,
  }), [
    ready, data, currentUser, visibleOperations, logout, resetDemo, getOperation, getUser, getEvaluation,
    getCurrentDraft, startEvaluation, updateAnswer, addEvidence, removeEvidence, saveActionPlan, updateActionStatus,
    submitEvaluation, validateEvaluation, updateIndicatorResult, createVisitReport,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve ser utilizado dentro de AppProvider.');
  return context;
}
