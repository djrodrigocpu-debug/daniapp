/**
 * Implementação REAL LOCAL do OperationsRepository sobre o store persistente.
 * Executável e testável sem backend; mesma interface do adapter Supabase.
 */
import { Operation } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { computeDashboardMetrics, DashboardMetrics } from '../../domain/dashboard/metrics';
import { LocalStore, localStore } from '../store/localStore';
import {
  OperationScope,
  OperationsRepository,
  filterVisibleOperations,
  isOperationVisible,
} from './OperationsRepository';

export class LocalOperationsRepository implements OperationsRepository {
  constructor(private readonly store: LocalStore = localStore) {}

  async listVisible(scope: OperationScope): Promise<Result<Operation[]>> {
    const operations = filterVisibleOperations(scope, this.store.getSnapshot().operations);
    return ok(operations);
  }

  async getById(scope: OperationScope, id: string): Promise<Result<Operation | null>> {
    const operation = this.store.getSnapshot().operations.find((item) => item.id === id) ?? null;
    if (operation && !isOperationVisible(scope, operation)) {
      return err('authz/out-of-scope', 'Operação fora do seu escopo de acesso.');
    }
    return ok(operation);
  }

  async getDashboard(scope: OperationScope, nowISO?: string): Promise<Result<DashboardMetrics>> {
    const data = this.store.getSnapshot();
    const operations = filterVisibleOperations(scope, data.operations);
    return ok(computeDashboardMetrics(operations, data.actionPlans, data.evaluations, nowISO));
  }
}
