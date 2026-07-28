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
import { useOperations } from './OperationsProvider';

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
  // Mesma correção do bug "Parceiro não existente": a operação vem da lista
  // REAL já carregada, não do store local de demonstração — era por isto que
  // "Abrir Gestão Assistida" mostrava "Parceiro AACE não encontrado" para
  // qualquer parceiro real.
  const { operations } = useOperations();

  return {
    getOperation: (id) => operations.find((o) => o.id === id),
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
