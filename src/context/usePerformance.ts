/**
 * Hook da Gestão Assistida (§7).
 *
 * MODO CORPORATIVO: catálogo de indicadores, resultados e relatórios de visita
 * vêm do `PerformanceRepository` (Supabase) — UMA consulta por coleção, nada por
 * card renderizado. Os planos de ação reusam a MESMA coleção corporativa já
 * carregada pelo `ActionsProvider` (`ui_action_plans`), sem repositório
 * duplicado e sem consulta nova.
 *
 * Até a fatia 6B as quatro coleções vinham do `localStore` — o store de
 * demonstração, nunca populado em modo corporativo. Era a mesma classe de
 * defeito do "Parceiro AACE não encontrado": a entidade real vinha do servidor
 * e a agregação seguinte consultava o seed, entregando resultado vazio ou
 * incorreto sem avisar.
 *
 * MODO DEMONSTRAÇÃO: os adapters locais leem o store e a assinatura mantém a
 * reatividade — nenhuma regressão offline.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionPlan, IndicatorDefinition, IndicatorResult, Operation, VisitReport } from '../types';
import { Result } from '../domain/errors/result';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { SaveIndicatorResultInput, VisitReportInput } from '../data/repositories/PerformanceRepository';
import { ActionPlanInput } from '../data/repositories/EvaluationsRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';
import { useOperations } from './OperationsProvider';
import { useActions } from './ActionsProvider';

export interface PerformanceApi {
  /** true enquanto a carga das coleções não terminou. */
  loading: boolean;
  /** Falha de rede/RLS — NUNCA apresentada como inexistência ou vazio. */
  error: string | null;
  getOperation: (id: string) => Operation | undefined;
  indicatorResults: (operationId: string) => IndicatorResult[];
  indicatorDefinitions: IndicatorDefinition[];
  actionPlans: (operationId: string) => ActionPlan[];
  latestReport: (operationId: string) => VisitReport | undefined;
  /**
   * Cria o primeiro resultado de operação+indicador+período ou atualiza o
   * existente pelo caminho corporativo (RPC `save_indicator_result`). Retorna o
   * Result para a tela distinguir sucesso, validação e falha de rede — erro
   * nunca vira silêncio.
   */
  saveIndicatorResult: (input: SaveIndicatorResultInput) => Promise<Result<IndicatorResult>>;
  updateIndicatorResult: (resultId: string, patch: Partial<IndicatorResult>) => void;
  saveActionPlan: (input: ActionPlanInput) => void;
  createVisitReport: (input: VisitReportInput) => void;
}

export function usePerformance(): PerformanceApi {
  const { performance: perfRepo, evaluations: evalRepo, source } = useRepositories();
  const user = useOperationalUser();
  // Mesma correção do bug "Parceiro não existente": a operação vem da lista
  // REAL já carregada, não do store local de demonstração — era por isto que
  // "Abrir Gestão Assistida" mostrava "Parceiro AACE não encontrado" para
  // qualquer parceiro real.
  const { operations, loading: operationsLoading, error: operationsError } = useOperations();
  // Planos de ação: a MESMA coleção da aba Ações, já carregada por escopo.
  const { plans, loading: plansLoading, error: plansError, refresh: refreshPlans } = useActions();

  const [definitions, setDefinitions] = useState<IndicatorDefinition[]>([]);
  const [results, setResults] = useState<IndicatorResult[]>([]);
  const [reports, setReports] = useState<VisitReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setDefinitions([]);
      setResults([]);
      setReports([]);
      setLoading(false);
      setError(null);
      return;
    }
    const [defs, res, reps] = await Promise.all([
      perfRepo.listIndicatorDefinitions(),
      perfRepo.listIndicatorResults(),
      perfRepo.listVisitReports(),
    ]);
    setDefinitions(defs.ok ? defs.value : []);
    setResults(res.ok ? res.value : []);
    setReports(reps.ok ? reps.value : []);
    // Falha de rede/RLS não é catálogo vazio nem parceiro sem resultado: a tela
    // precisa distinguir os três, e por isso o erro é propagado.
    const failure = [defs, res, reps].find((result) => !result.ok);
    setError(failure && !failure.ok ? failure.error.message : null);
    setLoading(false);
  }, [perfRepo, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reatividade do modo demonstração; em corporativo a recarga é explícita.
  useEffect(() => {
    if (source !== 'local') return undefined;
    return localStore.subscribe(() => void load());
  }, [source, load]);

  // Índices por chave canônica: o lookup por parceiro é O(1) sobre coleções já
  // carregadas — nenhuma consulta por indicador, plano ou visita renderizados.
  const resultsByOperation = useMemo(() => {
    const index = new Map<string, IndicatorResult[]>();
    for (const result of results) {
      const bucket = index.get(result.operationId);
      if (bucket) bucket.push(result);
      else index.set(result.operationId, [result]);
    }
    return index;
  }, [results]);

  const plansByOperation = useMemo(() => {
    const index = new Map<string, ActionPlan[]>();
    for (const plan of plans) {
      const bucket = index.get(plan.operationId);
      if (bucket) bucket.push(plan);
      else index.set(plan.operationId, [plan]);
    }
    return index;
  }, [plans]);

  const latestReportByOperation = useMemo(() => {
    const index = new Map<string, VisitReport>();
    for (const report of reports) {
      const current = index.get(report.operationId);
      if (!current || report.createdAt.localeCompare(current.createdAt) > 0) index.set(report.operationId, report);
    }
    return index;
  }, [reports]);

  const getOperation = useCallback((id: string) => operations.find((o) => o.id === id), [operations]);
  const indicatorResults = useCallback(
    (operationId: string) => resultsByOperation.get(operationId) ?? [],
    [resultsByOperation],
  );
  const actionPlans = useCallback(
    (operationId: string) => plansByOperation.get(operationId) ?? [],
    [plansByOperation],
  );
  const latestReport = useCallback(
    (operationId: string) => latestReportByOperation.get(operationId),
    [latestReportByOperation],
  );

  const saveIndicatorResult = useCallback(
    async (input: SaveIndicatorResultInput) => {
      const res = await perfRepo.saveIndicatorResult(input);
      if (res.ok) {
        // A linha persistida volta do servidor: substitui a existente pelo id
        // ou entra como primeiro resultado — sem recarregar as três coleções.
        setResults((prev) => {
          const exists = prev.some((r) => r.id === res.value.id);
          return exists ? prev.map((r) => (r.id === res.value.id ? res.value : r)) : [res.value, ...prev];
        });
      }
      return res;
    },
    [perfRepo],
  );

  const updateIndicatorResult = useCallback(
    (resultId: string, patch: Partial<IndicatorResult>) => {
      // A linha gravada volta do servidor: o estado passa a refletir o que foi
      // persistido, sem recarregar as três coleções a cada edição.
      void perfRepo.updateIndicatorResult(resultId, patch).then((res) => {
        if (res.ok) setResults((prev) => prev.map((r) => (r.id === resultId ? res.value : r)));
      });
    },
    [perfRepo],
  );
  const saveActionPlan = useCallback(
    (input: ActionPlanInput) => {
      // Recarrega a coleção de planos: a tela relê `actionPlans` em seguida e
      // precisa encontrar o que o servidor acabou de gravar. Autoria: o modo
      // local grava o que vem daqui; o Supabase carimba auth.uid() (0025).
      void evalRepo.saveActionPlan({ ...input, createdBy: input.createdBy ?? user?.id }).then(() => refreshPlans());
    },
    [evalRepo, refreshPlans, user?.id],
  );
  const createVisitReport = useCallback(
    (input: VisitReportInput) => {
      void perfRepo.createVisitReport(input, user?.id ?? '').then((res) => {
        if (res.ok) setReports((prev) => [res.value, ...prev]);
      });
    },
    [perfRepo, user?.id],
  );

  return {
    loading: loading || operationsLoading || plansLoading,
    error: error ?? operationsError ?? plansError,
    getOperation,
    indicatorResults,
    indicatorDefinitions: definitions,
    actionPlans,
    latestReport,
    saveIndicatorResult,
    updateIndicatorResult,
    saveActionPlan,
    createVisitReport,
  };
}
