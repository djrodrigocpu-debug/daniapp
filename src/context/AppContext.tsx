import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { initialData, demoPassword } from '../data/mock';
import { themes } from '../data/catalog';
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

const DATA_KEY = '@aace_excelencia:data:v1.2';
const USER_KEY = '@aace_excelencia:user:v1';

type SubmitResult = { ok: true } | { ok: false; message: string };

interface AppContextValue {
  ready: boolean;
  data: AppData;
  currentUser: User | null;
  visibleOperations: Operation[];
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
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
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<AppData>(initialData);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    async function hydrate() {
      try {
        const [storedData, storedUserId] = await Promise.all([
          AsyncStorage.getItem(DATA_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        const hydrated = storedData ? (JSON.parse(storedData) as AppData) : initialData;
        setData(hydrated);
        if (storedUserId) {
          setCurrentUser(hydrated.users.find((user) => user.id === storedUserId) ?? null);
        }
      } catch {
        setData(initialData);
      } finally {
        setReady(true);
      }
    }
    void hydrate();
  }, []);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(DATA_KEY, JSON.stringify(data));
  }, [data, ready]);

  const visibleOperations = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'regional') return data.operations;
    if (currentUser.role === 'coordinator') {
      return data.operations.filter((operation) => operation.coordinatorId === currentUser.id);
    }
    return data.operations.filter((operation) => operation.managerId === currentUser.id);
  }, [currentUser, data.operations]);

  const login = useCallback(async (email: string, password: string) => {
    const normalized = email.trim().toLowerCase();
    const user = data.users.find((item) => item.email.toLowerCase() === normalized);
    if (!user || password !== demoPassword) {
      return { ok: false, message: 'E-mail ou senha inválidos.' };
    }
    setCurrentUser(user);
    await AsyncStorage.setItem(USER_KEY, user.id);
    return { ok: true };
  }, [data.users]);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    await AsyncStorage.removeItem(USER_KEY);
  }, []);

  const resetDemo = useCallback(async () => {
    setData(initialData);
    await AsyncStorage.setItem(DATA_KEY, JSON.stringify(initialData));
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
    setData((previous) => ({ ...previous, evaluations: [evaluation, ...previous.evaluations] }));
    return id;
  }, [currentUser?.id, data.evaluations]);

  const updateAnswer = useCallback((evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>) => {
    setData((previous) => ({
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
    setData((previous) => ({
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
    setData((previous) => ({
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
    setData((previous) => {
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
    setData((previous) => ({
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
    setData((previous) => ({
      ...previous,
      evaluations: previous.evaluations.map((item) => item.id === evaluationId ? { ...item, status: 'submitted', submittedAt: now, updatedAt: now } : item),
    }));
    return { ok: true };
  }, [data.actionPlans, data.evaluations]);

  const validateEvaluation = useCallback((evaluationId: string, decision: 'approved' | 'returned', note: string) => {
    const evaluation = data.evaluations.find((item) => item.id === evaluationId);
    if (!evaluation) return;
    const now = new Date().toISOString();
    setData((previous) => {
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
    setData((previous) => ({
      ...previous,
      indicatorResults: previous.indicatorResults.map((result) => result.id === resultId
        ? { ...result, ...patch, updatedAt: new Date().toISOString() }
        : result),
    }));
  }, []);

  const createVisitReport = useCallback((input: Omit<VisitReport, 'id' | 'createdAt' | 'createdBy'>) => {
    const id = makeId('VIS');
    const report: VisitReport = { ...input, id, createdAt: new Date().toISOString(), createdBy: currentUser?.id ?? '' };
    setData((previous) => ({ ...previous, visitReports: [report, ...previous.visitReports] }));
    return id;
  }, [currentUser?.id]);

  const value = useMemo<AppContextValue>(() => ({
    ready,
    data,
    currentUser,
    visibleOperations,
    login,
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
    ready, data, currentUser, visibleOperations, login, logout, resetDemo, getOperation, getUser, getEvaluation,
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
