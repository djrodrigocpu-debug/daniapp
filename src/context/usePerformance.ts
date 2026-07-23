/**
 * Hook da Gestão Assistida (§7). Lê o estado real (indicadores, planos, visitas)
 * de forma reativa e escreve pelos repositórios (Performance + Evaluations para
 * planos). Substitui o acesso ao AppContext na PerformanceScreen.
 */
import { useSyncExternalStore } from 'react';
import { ActionPlan, IndicatorDefinition, IndicatorResult, Operation, VisitReport } from '../types';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { VisitReportInput } from '../data/repositories/PerformanceRepository';
import { ActionPlanInput } from '../data/repositories/EvaluationsRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';

export interface PerformanceApi {
  getOperation: (id: string) => Operation | undefined;
  indicatorResults: (operationId: string) => IndicatorResult[];
  indicatorDefinitions: IndicatorDefinition[];
  actionPlans: (operationId: string) => ActionPlan[];
  latestReport: (operationId: string) => VisitReport | undefined;
  updateIndicatorResult: (resultId: string, patch: Partial<IndicatorResult>) => void;
  saveActionPlan: (input: ActionPlanInput) => void;
  createVisitReport: (input: VisitReportInput) => void;
}

export function usePerformance(): PerformanceApi {
  const { performance: perfRepo, evaluations: evalRepo } = useRepositories();
  const user = useOperationalUser();
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);

  return {
    getOperation: (id) => data.operations.find((o) => o.id === id),
    indicatorResults: (operationId) => data.indicatorResults.filter((r) => r.operationId === operationId),
    indicatorDefinitions: data.indicatorDefinitions,
    actionPlans: (operationId) => data.actionPlans.filter((p) => p.operationId === operationId),
    latestReport: (operationId) => data.visitReports.find((r) => r.operationId === operationId),
    updateIndicatorResult: (resultId, patch) => {
      void perfRepo.updateIndicatorResult(resultId, patch);
    },
    saveActionPlan: (input) => {
      void evalRepo.saveActionPlan(input);
    },
    createVisitReport: (input) => {
      void perfRepo.createVisitReport(input, user?.id ?? '');
    },
  };
}
