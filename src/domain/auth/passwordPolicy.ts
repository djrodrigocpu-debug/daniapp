/**
 * Política de senha da definição/redefinição corporativa.
 *
 * Função pura, sem I/O: a tela apenas exibe o resultado. O mínimo de 12
 * caracteres é MAIOR que o padrão do Supabase (6) — o servidor aceitaria menos,
 * então a regra precisa ser aplicada aqui antes de chamar updateUser.
 *
 * A senha NUNCA é registrada em log, persistida em AsyncStorage nem colocada em
 * query string; este módulo só a recebe em memória para validar.
 */

export const MIN_PASSWORD_LENGTH = 12;

export type PasswordIssue =
  | 'too_short'
  | 'only_whitespace'
  | 'mismatch'
  | 'empty';

export interface PasswordCheck {
  ok: boolean;
  issue?: PasswordIssue;
  /** Mensagem pronta para a tela; nunca ecoa a senha. */
  message?: string;
}

const MESSAGES: Record<PasswordIssue, string> = {
  empty: 'Informe a nova senha.',
  too_short: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  only_whitespace: 'A senha não pode conter apenas espaços.',
  mismatch: 'A confirmação não confere com a nova senha.',
};

/**
 * Valida a senha e a confirmação. A ordem das checagens é deliberada: primeiro
 * o que é problema da senha em si, depois a divergência — assim o operador
 * corrige uma coisa por vez.
 */
export function checkPassword(password: string, confirmation: string): PasswordCheck {
  if (password === '') return fail('empty');
  if (password.trim() === '') return fail('only_whitespace');
  // Conta o comprimento da senha COMO SERÁ ENVIADA (sem aparar): espaço interno
  // é caractere legítimo; o que recusamos é a senha só de espaços, acima.
  if (password.length < MIN_PASSWORD_LENGTH) return fail('too_short');
  if (password !== confirmation) return fail('mismatch');
  return { ok: true };
}

function fail(issue: PasswordIssue): PasswordCheck {
  return { ok: false, issue, message: MESSAGES[issue] };
}
