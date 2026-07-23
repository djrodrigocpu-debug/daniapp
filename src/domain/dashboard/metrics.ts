/**
 * Métricas do Dashboard como função pura (Masterplan §15). Os números vêm dos
 * registros reais (operações/ações/avaliações do escopo), nunca de constantes.
 * Testável e reutilizada pelo repositório — a UI não recalcula regra de negócio.
 */
import { ActionPlan, Evaluation, Operation } from '../../types';

export interface DashboardMetrics {
  /** Índice médio (0–100) das operações do escopo. */
  average: number;
  operationsCount: number;
  criticalCount: number;
  openActionsCount: number;
  overdueActionsCount: number;
  pendingValidationsCount: number;
  pendingAuditsCount: number;
  /** Operações com ciclo mais próximo do vencimento (até 3). */
  upcoming: Operation[];
  /** Operações vermelhas (para blocos de foco). */
  critical: Operation[];
}

const CLOSED_ACTION_STATUS = new Set<ActionPlan['status']>(['validated', 'completed']);

export function computeDashboardMetrics(
  operations: Operation[],
  actionPlans: ActionPlan[],
  evaluations: Evaluation[],
  nowISO: string = new Date().toISOString(),
): DashboardMetrics {
  const ids = new Set(operations.map((operation) => operation.id));
  const today = nowISO.slice(0, 10);

  const average = operations.length
    ? Math.round(operations.reduce((sum, operation) => sum + operation.currentScore, 0) / operations.length)
    : 0;

  const critical = operations.filter((operation) => operation.status === 'red');

  const openActions = actionPlans.filter(
    (plan) => ids.has(plan.operationId) && !CLOSED_ACTION_STATUS.has(plan.status),
  );
  const overdueActions = openActions.filter(
    (plan) => plan.status === 'overdue' || plan.dueDate < today,
  );

  const pendingValidations = evaluations.filter(
    (evaluation) => ids.has(evaluation.operationId) && evaluation.status === 'submitted',
  );

  const pendingAudits = operations.filter(
    (operation) => !operation.lastAudit || operation.nextAudit <= today,
  );

  const upcoming = [...operations]
    .sort((a, b) => a.nextAudit.localeCompare(b.nextAudit))
    .slice(0, 3);

  return {
    average,
    operationsCount: operations.length,
    criticalCount: critical.length,
    openActionsCount: openActions.length,
    overdueActionsCount: overdueActions.length,
    pendingValidationsCount: pendingValidations.length,
    pendingAuditsCount: pendingAudits.length,
    upcoming,
    critical,
  };
}
