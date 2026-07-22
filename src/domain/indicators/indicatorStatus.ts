/**
 * Semáforo e atingimento de indicadores (Masterplan §7.5, §8.2). Funções puras.
 */
import { IndicatorDirection, TrafficLight } from '../model';

export interface IndicatorEval {
  direction: IndicatorDirection;
  target: number;
  /** Tolerância do amarelo, em pontos percentuais da meta (ex.: 10 = 10%). */
  yellowTolerance: number;
  actual: number;
  /** Para `target_band`: limite inferior/superior da faixa ideal. */
  bandMin?: number;
  bandMax?: number;
}

export function indicatorStatus(e: IndicatorEval): TrafficLight {
  if (e.direction === 'higher_better') {
    if (e.actual >= e.target) return 'green';
    if (e.actual >= e.target * (1 - e.yellowTolerance / 100)) return 'yellow';
    return 'red';
  }
  if (e.direction === 'lower_better') {
    if (e.actual <= e.target) return 'green';
    if (e.actual <= e.target * (1 + e.yellowTolerance / 100)) return 'yellow';
    return 'red';
  }
  // target_band: dentro da faixa = verde; margem de tolerância = amarelo
  const min = e.bandMin ?? e.target;
  const max = e.bandMax ?? e.target;
  if (e.actual >= min && e.actual <= max) return 'green';
  const tolLow = min * (1 - e.yellowTolerance / 100);
  const tolHigh = max * (1 + e.yellowTolerance / 100);
  if (e.actual >= tolLow && e.actual <= tolHigh) return 'yellow';
  return 'red';
}

/** Atingimento percentual (0–150), limitado para evitar distorções (§7.5). */
export function achievement(e: IndicatorEval): number {
  if (e.direction === 'higher_better') {
    if (e.target === 0) return e.actual >= 0 ? 100 : 0;
    return clamp((e.actual / e.target) * 100, 0, 150);
  }
  if (e.direction === 'lower_better') {
    if (e.actual === 0) return 150;
    return clamp((e.target / e.actual) * 100, 0, 150);
  }
  const mid = ((e.bandMin ?? e.target) + (e.bandMax ?? e.target)) / 2;
  if (mid === 0) return 100;
  return clamp(100 - Math.abs((e.actual - mid) / mid) * 100, 0, 150);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
