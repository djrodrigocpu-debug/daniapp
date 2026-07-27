/**
 * CNPJ do Parceiro AACE — dado CADASTRAL da empresa avaliada.
 *
 * FRONTEIRA IMPORTANTE: o CNPJ identifica a empresa, não uma credencial. Parceiro
 * NÃO é usuário do aplicativo nesta fase:
 *   - não recebe identidade em `auth.users`;
 *   - não recebe perfil em `public.users`;
 *   - não recebe escopo em `public.user_scopes`;
 *   - não faz login, com CNPJ nem com nada.
 *
 * Este módulo existe apenas para normalizar e validar o número na importação de
 * parceiros, que segue separada da planilha de usuários.
 */

/** Quantidade de dígitos de um CNPJ. */
export const CNPJ_DIGITS = 14;

export type CnpjRejectionReason = 'empty' | 'length' | 'repeated' | 'check_digits';

export type CnpjValidation =
  | { ok: true; cnpj: string }
  | { ok: false; reason: CnpjRejectionReason; message: string };

/** Remove tudo que não for dígito: aceita `12.345.678/0001-95` ou `12345678000195`. */
export function normalizeCnpj(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  return String(raw).replace(/\D+/g, '');
}

/** Pesos do módulo 11 do CNPJ: 5..2 seguido de 9..2. */
const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function checkDigit(digits: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i += 1) soma += Number(digits[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** true quando os 14 dígitos são o mesmo caractere. */
function isRepeated(cnpj: string): boolean {
  return /^(\d)\1{13}$/.test(cnpj);
}

/**
 * Normaliza e valida. Diferente do CPF, o CNPJ não é dado pessoal, então a
 * mensagem PODE citar o número — é um identificador público de empresa e
 * mostrá-lo ajuda o operador a achar a linha na planilha.
 */
export function validateCnpj(raw: unknown): CnpjValidation {
  const cnpj = normalizeCnpj(raw);
  if (cnpj === '') return { ok: false, reason: 'empty', message: 'Informe o CNPJ.' };
  if (cnpj.length !== CNPJ_DIGITS) {
    return { ok: false, reason: 'length', message: `CNPJ deve ter 14 dígitos: ${cnpj}` };
  }
  // Sequências repetidas passam no módulo 11 e precisam de recusa explícita.
  if (isRepeated(cnpj)) {
    return { ok: false, reason: 'repeated', message: `CNPJ inválido: ${formatCnpj(cnpj)}` };
  }
  const d1 = checkDigit(cnpj.slice(0, 12), PESOS_1);
  const d2 = checkDigit(cnpj.slice(0, 13), PESOS_2);
  if (d1 !== Number(cnpj[12]) || d2 !== Number(cnpj[13])) {
    return { ok: false, reason: 'check_digits', message: `CNPJ inválido: ${formatCnpj(cnpj)}` };
  }
  return { ok: true, cnpj };
}

/** Atalho booleano. */
export function isValidCnpj(raw: unknown): boolean {
  return validateCnpj(raw).ok;
}

/** Exibição cadastral: `12.345.678/0001-95`. */
export function formatCnpj(raw: unknown): string {
  const d = normalizeCnpj(raw);
  if (d.length !== CNPJ_DIGITS) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
