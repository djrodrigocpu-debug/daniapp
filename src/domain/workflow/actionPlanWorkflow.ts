/**
 * Workflow do plano de ação no VOCABULÁRIO DA UI (Manual do GC é normativo).
 *
 * A tabela de transições vive em stateMachine.ts (vocabulário do banco, com
 * paridade SQL provada em src/db/action_plan_governance.integration.test.ts);
 * aqui ficam a tradução UI<->banco — espelho de app.action_status_to_ui/_to_db
 * (0025) — e as regras de papel e segregação que a interface e o modo
 * demonstração aplicam. O servidor continua autoritativo.
 */
import { ActionStatus, UserRole } from '../../types';
import { ActionStatus as DbActionStatus } from '../model';
import { canTransitionAction } from './stateMachine';

/** Espelho de app.action_status_to_db (0025). */
export const uiToDbActionStatus: Record<ActionStatus, DbActionStatus> = {
  not_started: 'open',
  in_progress: 'in_progress',
  waiting_partner: 'waiting_partner',
  waiting_internal: 'blocked',
  completed: 'done',
  validated: 'validated',
  overdue: 'overdue',
};

/** Espelho de app.action_status_to_ui (0025). */
export const dbToUiActionStatus: Record<DbActionStatus, ActionStatus> = {
  open: 'not_started',
  in_progress: 'in_progress',
  waiting_partner: 'waiting_partner',
  blocked: 'waiting_internal',
  done: 'completed',
  validated: 'validated',
  overdue: 'overdue',
  cancelled_justified: 'completed',
};

/** Rótulos humanos canônicos (utils/format reexporta para as telas). */
export const actionStatusHumanLabel: Record<ActionStatus, string> = {
  not_started: 'Não iniciado',
  in_progress: 'Em andamento',
  waiting_partner: 'Aguardando parceiro',
  waiting_internal: 'Aguardando área interna',
  completed: 'Concluído',
  validated: 'Validado',
  overdue: 'Vencido',
};

/** Somente Coordenação, Regional e Administração registram Validado (§7.3). */
export const ACTION_VALIDATOR_ROLES: UserRole[] = ['coordinator', 'regional', 'admin'];

export function canTransitionActionPlanUi(from: ActionStatus, to: ActionStatus): boolean {
  return canTransitionAction(uiToDbActionStatus[from], uiToDbActionStatus[to]).ok;
}

export interface ActionPlanActorContext {
  role: UserRole;
  /** true quando o usuário é o criador do plano (não valida o próprio). */
  isCreator: boolean;
  /** false para plano legado sem autoria persistida — validação bloqueada. */
  hasKnownCreator: boolean;
}

/**
 * Próximos status ofertáveis na tela para o plano no status atual.
 * 'overdue' nunca é ofertado: Vencido deriva da data, não é escolha manual.
 */
export function allowedNextActionStatuses(
  current: ActionStatus,
  ctx: ActionPlanActorContext,
): ActionStatus[] {
  const offerable: ActionStatus[] = [
    'not_started', 'in_progress', 'waiting_partner', 'waiting_internal', 'completed', 'validated',
  ];
  return offerable.filter((to) => {
    if (to === current) return false;
    if (!canTransitionActionPlanUi(current, to)) return false;
    if (to === 'validated') {
      if (!ACTION_VALIDATOR_ROLES.includes(ctx.role)) return false;
      if (ctx.isCreator || !ctx.hasKnownCreator) return false;
    }
    return true;
  });
}
