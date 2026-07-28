/**
 * Senha INICIAL definida na planilha de provisionamento.
 *
 * Regra distinta da senha escolhida pelo usuário (`src/domain/auth/passwordPolicy.ts`,
 * mínimo 12): esta é digitada pelo administrador para muitas linhas de uma vez,
 * e por isso o mínimo é 10 com exigência explícita de letras E números — o que
 * impede o padrão perigoso de repetir o mesmo "123456" para o lote inteiro.
 *
 * CICLO DE VIDA (obrigatório): a senha existe SOMENTE em memória, durante a
 * requisição de provisionamento. Ela nunca é:
 *   - gravada em `public.users` ou em qualquer tabela;
 *   - devolvida na resposta da Edge Function;
 *   - escrita em log, relatório, telemetria ou arquivo de diagnóstico;
 *   - persistida em AsyncStorage/localStorage pelo aplicativo.
 *
 * Por isso este módulo só a recebe para validar, e nenhuma mensagem de erro
 * daqui ecoa o valor informado.
 */

export const MIN_INITIAL_PASSWORD_LENGTH = 10;

export type InitialPasswordIssue =
  | 'empty'
  | 'too_short'
  | 'only_whitespace'
  | 'needs_letter_and_digit'
  | 'equals_email'
  | 'contains_email';

export interface InitialPasswordCheck {
  ok: boolean;
  issue?: InitialPasswordIssue;
  /** Mensagem pronta para a tela/relatório; NUNCA ecoa a senha. */
  message?: string;
}

const MESSAGES: Record<InitialPasswordIssue, string> = {
  empty: 'Informe a senha inicial.',
  too_short: `A senha inicial precisa ter pelo menos ${MIN_INITIAL_PASSWORD_LENGTH} caracteres.`,
  only_whitespace: 'A senha inicial não pode conter apenas espaços.',
  needs_letter_and_digit: 'A senha inicial precisa conter letras e números.',
  equals_email: 'A senha inicial não pode ser igual ao e-mail.',
  contains_email: 'A senha inicial não pode conter o e-mail.',
};

function fail(issue: InitialPasswordIssue): InitialPasswordCheck {
  return { ok: false, issue, message: MESSAGES[issue] };
}

/**
 * Valida a senha inicial de UMA linha, contra o e-mail daquela mesma linha.
 *
 * `email` entra normalizado (minúsculo, sem espaços). A comparação é feita em
 * minúsculas para que `Fulano@Empresa.com` como senha também seja recusado.
 */
export function checkInitialPassword(password: string, email: string): InitialPasswordCheck {
  if (typeof password !== 'string' || password === '') return fail('empty');
  if (password.trim() === '') return fail('only_whitespace');
  // Comprimento medido COMO SERÁ ENVIADO: espaço interno é caractere legítimo.
  if (password.length < MIN_INITIAL_PASSWORD_LENGTH) return fail('too_short');

  // As regras de parentesco com o e-mail vêm ANTES da composição: quem colou o
  // e-mail no campo da senha precisa ler "não pode ser igual ao e-mail", não
  // "precisa conter letras e números" — que descreve o sintoma, não a causa.
  const senha = password.toLowerCase();
  const alvo = (email ?? '').trim().toLowerCase();
  if (alvo !== '') {
    if (senha === alvo) return fail('equals_email');
    // Recusa também a parte local: "fulano.silva" como senha de
    // fulano.silva@empresa.com é adivinhável a partir da própria planilha.
    const local = alvo.split('@')[0];
    if (senha.includes(alvo) || (local.length >= 4 && senha.includes(local))) {
      return fail('contains_email');
    }
  }

  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return fail('needs_letter_and_digit');
  }

  return { ok: true };
}

/** Atalho booleano. */
export function isValidInitialPassword(password: string, email: string): boolean {
  return checkInitialPassword(password, email).ok;
}
