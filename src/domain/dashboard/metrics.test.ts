import { describe, it, expect } from 'vitest';
import { computeDashboardMetrics } from './metrics';
import { ActionPlan, Evaluation, Operation } from '../../types';

const op = (id: string, score: number, status: Operation['status'], nextAudit: string, lastAudit?: string): Operation => ({
  id, partnerName: `P${id}`, officeName: 'O', city: 'C', state: 'PR',
  coordinatorId: 'U02', managerId: 'U03', active: true,
  currentScore: score, previousScore: score, lastAudit, nextAudit, status, openActions: 0,
});

const action = (id: string, operationId: string, status: ActionPlan['status'], dueDate: string): ActionPlan => ({
  id, operationId, evaluationId: 'E1', themeId: 'T01', problem: '', rootCause: '', action: '',
  owner: '', dueDate, priority: 'high', expectedEvidence: '', status,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

const evaluation = (id: string, operationId: string, status: Evaluation['status']): Evaluation => ({
  id, operationId, cycleLabel: 'c', periodStart: '2026-07-01', periodEnd: '2026-07-07',
  frequency: 'weekly', evaluatorId: 'U03', status, score: 70, answers: [],
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
});

const NOW = '2026-07-22T12:00:00.000Z';

describe('computeDashboardMetrics', () => {
  it('média zero e listas vazias quando não há operações', () => {
    const m = computeDashboardMetrics([], [], [], NOW);
    expect(m).toMatchObject({ average: 0, operationsCount: 0, criticalCount: 0, upcoming: [] });
  });

  it('calcula média arredondada e conta críticas', () => {
    const ops = [op('O1', 90, 'green', '2026-07-30'), op('O2', 59, 'red', '2026-07-25'), op('O3', 70, 'yellow', '2026-07-28')];
    const m = computeDashboardMetrics(ops, [], [], NOW);
    expect(m.average).toBe(73); // (90+59+70)/3 = 73
    expect(m.criticalCount).toBe(1);
    expect(m.operationsCount).toBe(3);
  });

  it('conta ações abertas e vencidas (por status e por data)', () => {
    const ops = [op('O1', 80, 'green', '2026-07-30')];
    const actions = [
      action('A1', 'O1', 'in_progress', '2026-07-30'), // aberta, no prazo
      action('A2', 'O1', 'overdue', '2026-08-30'),      // aberta, vencida por status
      action('A3', 'O1', 'in_progress', '2026-07-01'),  // aberta, vencida por data
      action('A4', 'O1', 'completed', '2026-07-01'),    // fechada — ignora
      action('A5', 'OX', 'in_progress', '2026-07-01'),  // fora do escopo — ignora
    ];
    const m = computeDashboardMetrics(ops, actions, [], NOW);
    expect(m.openActionsCount).toBe(3);
    expect(m.overdueActionsCount).toBe(2);
  });

  it('conta validações pendentes (submitted) apenas do escopo', () => {
    const ops = [op('O1', 80, 'green', '2026-07-30')];
    const evals = [
      evaluation('E1', 'O1', 'submitted'),
      evaluation('E2', 'O1', 'approved'),
      evaluation('E3', 'OX', 'submitted'), // fora do escopo
    ];
    const m = computeDashboardMetrics(ops, [], evals, NOW);
    expect(m.pendingValidationsCount).toBe(1);
  });

  it('conta auditorias pendentes (sem lastAudit ou nextAudit vencida) e ordena upcoming', () => {
    const ops = [
      op('O1', 80, 'green', '2026-08-30', '2026-07-01'), // futura, com lastAudit → não pendente
      op('O2', 80, 'green', '2026-07-10', '2026-07-01'), // nextAudit <= hoje → pendente
      op('O3', 80, 'green', '2026-09-01'),               // sem lastAudit → pendente
    ];
    const m = computeDashboardMetrics(ops, [], [], NOW);
    expect(m.pendingAuditsCount).toBe(2);
    expect(m.upcoming.map((o) => o.id)).toEqual(['O2', 'O1', 'O3']); // ordenado por nextAudit asc
  });
});
