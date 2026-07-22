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

const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  open: ['in_progress', 'blocked', 'cancelled_justified'],
  in_progress: ['blocked', 'done', 'overdue', 'cancelled_justified'],
  blocked: ['in_progress', 'cancelled_justified'],
  overdue: ['in_progress', 'done', 'cancelled_justified'],
  done: ['in_progress'], // reabertura preserva histórico anterior (§7.7)
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
