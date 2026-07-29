/**
 * Máquinas de estado de visita, avaliação e plano de ação (Masterplan §6.3).
 * Transições explícitas e determinísticas — nada de mudança livre de estado.
 */
import { VisitStatus, EvaluationStatus, ActionStatus } from '../model';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';

const VISIT_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  planned: ['draft', 'cancelled'],
  draft: ['ready', 'cancelled'],
  ready: ['submitted', 'draft', 'cancelled'],
  submitted: ['returned', 'approved'],
  returned: ['draft', 'cancelled'],
  approved: [],
  cancelled: [],
};

const EVALUATION_TRANSITIONS: Record<EvaluationStatus, EvaluationStatus[]> = {
  draft: ['submitted'],
  submitted: ['returned', 'approved'],
  returned: ['submitted'],
  approved: ['superseded'], // apenas via adendo controlado
  superseded: [],
};

/**
 * Máquina do plano de ação — o Manual do Gerente de Canal é normativo (decisão
 * do proprietário). Espelho exato de app.action_transition_allowed (0025);
 * paridade provada em src/db/action_plan_governance.integration.test.ts.
 *
 * blocked = "Aguardando área interna"; waiting_partner = "Aguardando parceiro";
 * done = "Concluído"; validated = "Validado" (terminal, exige papel validador).
 * DIVERGÊNCIA REGISTRADA: 'overdue' como origem não está na tabela do manual
 * (Vencido é derivado da data), mas caminhos antigos persistiram 'overdue'
 * fisicamente — sem estas saídas um plano legado ficaria preso.
 */
const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  open: ['in_progress', 'waiting_partner', 'blocked'],
  in_progress: ['waiting_partner', 'blocked', 'done'],
  waiting_partner: ['in_progress', 'blocked', 'done'],
  blocked: ['in_progress', 'waiting_partner', 'done'],
  done: ['in_progress', 'validated'], // reabertura só ANTES da validação (§7.7)
  validated: [], // terminal: não reabre, não muda
  overdue: ['in_progress', 'waiting_partner', 'blocked', 'done'],
  cancelled_justified: [],
};

function transition<S extends string>(
  table: Record<S, S[]>,
  from: S,
  to: S,
  label: string,
): Result<S> {
  const allowed = table[from] ?? [];
  if (!allowed.includes(to)) {
    return err(
      new AppError('validation/invalid-input', `Transição inválida de ${label}: ${from} → ${to}.`, {
        details: { from, to },
      }),
    );
  }
  return ok(to);
}

export const canTransitionVisit = (from: VisitStatus, to: VisitStatus) =>
  transition(VISIT_TRANSITIONS, from, to, 'visita');

export const canTransitionEvaluation = (from: EvaluationStatus, to: EvaluationStatus) =>
  transition(EVALUATION_TRANSITIONS, from, to, 'avaliação');

export const canTransitionAction = (from: ActionStatus, to: ActionStatus) =>
  transition(ACTION_TRANSITIONS, from, to, 'plano de ação');
