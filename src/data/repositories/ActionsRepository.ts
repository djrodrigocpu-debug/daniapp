/**
 * Repositório de Planos de Ação (Masterplan §13). Escopo por operação visível.
 * Adapters Local (REAL LOCAL) e Supabase (REAL REMOTO, pronto para conexão).
 *
 * A mudança de status obedece à máquina do Manual do GC (actionPlanWorkflow):
 * no modo Supabase a autoridade é o servidor (RPC + trigger, 0025); o modo
 * local espelha as MESMAS regras funcionais — papel, segregação e terminal.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ActionPlan, UserRole } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import {
  ACTION_VALIDATOR_ROLES,
  actionStatusHumanLabel,
  canTransitionActionPlanUi,
} from '../../domain/workflow/actionPlanWorkflow';
import { LocalStore, localStore } from '../store/localStore';
import { OperationScope, isOperationVisible } from './OperationsRepository';

/** Quem está mudando o status — o modo local aplica papel e segregação. */
export interface ActionActor {
  userId: string;
  role: UserRole;
  /** Nome funcional exibido como validador (sem UUID na tela). */
  name: string;
}

export interface ActionsRepository {
  /** Planos das operações visíveis ao escopo. */
  listByScope(scope: OperationScope): Promise<Result<ActionPlan[]>>;
  updateStatus(planId: string, status: ActionPlan['status'], actor: ActionActor): Promise<Result<ActionPlan>>;
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

  async updateStatus(planId: string, status: ActionPlan['status'], actor: ActionActor): Promise<Result<ActionPlan>> {
    const plan = this.store.getSnapshot().actionPlans.find((item) => item.id === planId);
    if (!plan) return err('validation/invalid-input', 'Plano de ação não encontrado.');

    // Clique repetido no status atual é no-op idempotente, não transição.
    if (plan.status === status) return ok(plan);

    if (plan.status === 'validated') {
      return err('integrity/immutable-record', 'Plano validado é imutável: não reabre e não muda.');
    }
    if (status === 'overdue') {
      return err('validation/invalid-input', 'Vencido é derivado da data, não é escolha manual.');
    }
    if (!canTransitionActionPlanUi(plan.status, status)) {
      return err(
        'validation/invalid-input',
        `Transição inválida de ${actionStatusHumanLabel[plan.status]} para ${actionStatusHumanLabel[status]}.`,
      );
    }

    const now = new Date().toISOString();
    let next: ActionPlan;
    if (status === 'validated') {
      if (!ACTION_VALIDATOR_ROLES.includes(actor.role)) {
        return err('authz/forbidden', 'Apenas Coordenação, Regional ou Administração registram Validado.');
      }
      if (!plan.createdBy) {
        return err('authz/forbidden', 'Plano sem autoria registrada: validação bloqueada.');
      }
      if (plan.createdBy === actor.userId) {
        return err('authz/self-approval', 'Quem criou o plano não pode validá-lo.');
      }
      // Escrita atômica da trilha: status + validador + data juntos.
      next = { ...plan, status, validatorName: actor.name, validatedAt: now, updatedAt: now };
    } else {
      next = { ...plan, status, updatedAt: now };
    }

    this.store.update((previous) => ({
      ...previous,
      actionPlans: previous.actionPlans.map((item) => (item.id === planId ? next : item)),
    }));
    return ok(next);
  }
}

export class SupabaseActionsRepository implements ActionsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByScope(_scope: OperationScope): Promise<Result<ActionPlan[]>> {
    // A RLS restringe ao escopo; a view projeta a forma da UI.
    const { data, error } = await this.client.from('ui_action_plans').select('*').order('dueDate');
    if (error) return err(new AppError('network/unavailable', 'Falha ao carregar planos.', { cause: error }));
    return ok((data ?? []) as ActionPlan[]);
  }

  async updateStatus(planId: string, status: ActionPlan['status'], _actor: ActionActor): Promise<Result<ActionPlan>> {
    // Autoridade no servidor: máquina, papel, segregação e trilha (RPC 0025).
    const { data, error } = await this.client.rpc('update_action_status', { p_plan_id: planId, p_status: status });
    if (error) {
      // A mensagem do servidor nomeia a recusa (transição/papel/segregação) —
      // repassar texto genérico esconderia o que resolve o problema.
      const message = (error as { message?: string }).message ?? 'Falha ao atualizar o status.';
      return err(new AppError('network/unavailable', message, { cause: error }));
    }
    return ok(data as ActionPlan);
  }
}
