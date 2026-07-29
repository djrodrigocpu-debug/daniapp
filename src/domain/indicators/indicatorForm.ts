/**
 * Validação pura do cadastro de indicador e da entrada de resultado (§7.5, §8).
 *
 * Regras que fecham o cadastro administrativo incompleto: unidade e direção são
 * escolhidas (não fixadas), zero é valor válido e é preservado, ausência e NaN
 * são recusados — nunca substituídos por default oculto.
 */
import { IndicatorDirection, IndicatorUnit } from '../../types';

/** Unidades reconhecidas pelo contrato existente (src/types IndicatorUnit). */
export const INDICATOR_UNITS: IndicatorUnit[] = ['%', 'R$', 'qtd', 'p.p.', 'x'];

export const INDICATOR_DIRECTIONS: Array<{ value: IndicatorDirection; label: string }> = [
  { value: 'higher_better', label: 'Maior é melhor' },
  { value: 'lower_better', label: 'Menor é melhor' },
];

/**
 * Converte texto de formulário em número decimal ESTRITO: aceita vírgula ou
 * ponto, preserva zero e sinal; devolve null para vazio, NaN ou lixo — o
 * chamador decide a mensagem, nunca um default silencioso.
 */
export function parseDecimalInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export interface IndicatorVersionForm {
  unit: IndicatorUnit;
  direction: IndicatorDirection;
  target: string;
  yellowTolerance: string;
  weight: string;
}

export interface IndicatorVersionValues {
  unit: IndicatorUnit;
  direction: IndicatorDirection;
  target: number;
  yellowTolerance: number;
  weight: number;
}

export type IndicatorVersionValidation =
  | { ok: true; value: IndicatorVersionValues }
  | { ok: false; message: string };

export function validateIndicatorVersionForm(form: IndicatorVersionForm): IndicatorVersionValidation {
  const target = parseDecimalInput(form.target);
  if (target === null) return { ok: false, message: 'Informe uma meta numérica.' };
  const yellowTolerance = parseDecimalInput(form.yellowTolerance);
  if (yellowTolerance === null) return { ok: false, message: 'Informe a tolerância amarela (0 é válido).' };
  if (yellowTolerance < 0) return { ok: false, message: 'A tolerância amarela não pode ser negativa.' };
  const weight = parseDecimalInput(form.weight);
  if (weight === null) return { ok: false, message: 'Informe a prioridade do indicador.' };
  if (weight < 0) return { ok: false, message: 'A prioridade não pode ser negativa.' };
  return { ok: true, value: { unit: form.unit, direction: form.direction, target, yellowTolerance, weight } };
}

/**
 * Prévia do limite amarelo (Correção D): a tolerância é uma PORCENTAGEM
 * aplicada sobre a meta, não uma diferença absoluta. Mesma fórmula de
 * calculateIndicatorStatus (src/data/performance.ts) — nada é alterado no
 * cálculo, isto é apenas exibição.
 *   higher_better: meta × (1 − tolerância/100)
 *   lower_better:  meta × (1 + tolerância/100)
 * Devolve null quando os campos ainda não são válidos.
 */
export function yellowLimitPreview(
  direction: IndicatorDirection,
  targetText: string,
  toleranceText: string,
): number | null {
  const target = parseDecimalInput(targetText);
  const tolerance = parseDecimalInput(toleranceText);
  if (target === null || tolerance === null || tolerance < 0) return null;
  return direction === 'higher_better'
    ? target * (1 - tolerance / 100)
    : target * (1 + tolerance / 100);
}
