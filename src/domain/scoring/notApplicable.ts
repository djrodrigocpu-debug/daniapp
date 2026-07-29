/**
 * Justificativa obrigatória do "Não aplicável" (Correção B).
 *
 * PARIDADE SERVIDOR: espelho exato de app.na_reason_is_valid (0025) — mesma
 * expressão de limpeza e mesmo limiar. A matemática do não aplicável não muda:
 * o item continua fora do numerador e do denominador e não exige evidência.
 */
export const NA_REASON_MIN_USEFUL = 10;

/** Comprimento útil: remove espaço, ponto, hífen, travessão e sublinhado. */
export function usefulReasonLength(text: string): number {
  return text.replace(/[\s.\-–—_]/g, '').length;
}

export function isValidNotApplicableReason(text: string | null | undefined): boolean {
  return usefulReasonLength(text ?? '') >= NA_REASON_MIN_USEFUL;
}
