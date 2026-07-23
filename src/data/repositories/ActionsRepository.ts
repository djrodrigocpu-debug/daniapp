/**
 * Repositório de Planos de Ação (Masterplan §13). Escopo por operação visível.
 * Adapters Local (REAL LOCAL) e Supabase (REAL REMOTO, pronto para conexão).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ActionPlan } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { LocalStore, localStore } from '../store/localStore';
import { OperationScope, isOperationVisible } from './OperationsRepository';

export interface ActionsRepository {
  /** Planos das operações visíveis ao escopo. */
  listByScope(scope: OperationScope): Promise<Result<ActionPlan[]>>;
  updateStatus(planId: string, status: ActionPlan['status']): Promise<Result<ActionPlan>>;
}

export class LocalActionsRepository implements ActionsRepository {
  constructor(private readonly store: LocalStore = localStore) {}

  async listByScope(scope: OperationScope): Promise<Result<ActionPlan[]>> {
    const data = this.store.getSnapshot();
    const visibleOpIds = new Set(
      data.operations.filter((op) => isOperationVisible(scope, op)).map((op) => op.id),
    );
    const plans = data.actionPlans
      .filter((plan) => visibleOpIds.has(plan.operationId))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return ok(plans);
  }

  async updateStatus(planId: string, status: ActionPlan['status']): Promise<Result<ActionPlan>> {
    let updated: ActionPlan | null = null;
    this.store.update((previous) => ({
      ...previous,
      actionPlans: previous.actionPlans.map((plan) => {
        if (plan.id !== planId) return plan;
        updated = { ...plan, status, updatedAt: new Date().toISOString() };
        return updated;
      }),
    }));
    if (!updated) return err('validation/invalid-input', 'Plano de ação não encontrado.');
    return ok(updated);
  }
}

export class SupabaseActionsRepository implements ActionsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByScope(_scope: OperationScope): Promise<Result<ActionPlan[]>> {
    // A RLS restringe ao escopo; a view projeta a forma da UI.
    const { data, error } = await this.client.from('ui_action_plans').select('*').order('due_date');
    if (error) return err(new AppError('network/unavailable', 'Falha ao carregar planos.', { cause: error }));
    return ok((data ?? []) as ActionPlan[]);
  }

  async updateStatus(planId: string, status: ActionPlan['status']): Promise<Result<ActionPlan>> {
    const { data, error } = await this.client.rpc('update_action_status', { p_plan_id: planId, p_status: status });
    if (error) return err(new AppError('network/unavailable', 'Falha ao atualizar o status.', { cause: error }));
    return ok(data as ActionPlan);
  }
}
