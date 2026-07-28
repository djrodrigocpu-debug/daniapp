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
  if (weight === null) return { ok: false, message: 'Informe o peso do indicador.' };
  if (weight < 0) return { ok: false, message: 'O peso não pode ser negativo.' };
  return { ok: true, value: { unit: form.unit, direction: form.direction, target, yellowTolerance, weight } };
}
