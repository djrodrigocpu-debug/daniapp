/**
 * Pontuação ponderada determinística (Masterplan §8.3; Anexo D — T15).
 *
 * Regras:
 *  - green = 1, yellow = 0,5, red = 0, not_evaluated = 0 (conta no denominador);
 *  - not_applicable é EXCLUÍDO do denominador (§8.3);
 *  - nota = round(earned / possible * 100);
 *  - função pura: mesma entrada ⇒ mesma saída, no cliente e no servidor.
 *
 * O servidor recalcula e compara com a prévia do cliente; divergência bloqueia
 * aprovação (`assertScoreConsistency`).
 */
import { TrafficLight } from '../model';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';

export interface ScorableItem {
  weight: number;
  status: TrafficLight;
}

const STATUS_VALUE: Record<TrafficLight, number | null> = {
  green: 1,
  yellow: 0.5,
  red: 0,
  not_evaluated: 0,
  not_applicable: null, // fora do denominador
};

/** Nota 0–100, ponderada e determinística. */
export function scoreAnswers(items: ScorableItem[]): number {
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    const value = STATUS_VALUE[item.status];
    if (value === null) continue;
    if (item.weight < 0) continue;
    possible += item.weight;
    earned += item.weight * value;
  }
  if (possible === 0) return 0;
  return Math.round((earned / possible) * 100);
}

/** Percentual de itens efetivamente avaliados (para bloqueio de envio §7.4). */
export function completionRate(statuses: TrafficLight[]): number {
  if (statuses.length === 0) return 0;
  const done = statuses.filter((s) => s !== 'not_evaluated').length;
  return Math.round((done / statuses.length) * 100);
}

/**
 * Consistência cliente × servidor (T15). O servidor é a autoridade: se a prévia
 * do cliente diverge do recálculo, a aprovação é bloqueada e um alerta é gerado.
 */
export function assertScoreConsistency(clientScore: number, items: ScorableItem[]): Result<number> {
  const serverScore = scoreAnswers(items);
  if (clientScore !== serverScore) {
    return err(
      new AppError('validation/score-divergence', 'Nota do cliente diverge do servidor; aprovação bloqueada.', {
        severity: 'critical',
        details: { clientScore, serverScore },
      }),
    );
  }
  return ok(serverScore);
}
