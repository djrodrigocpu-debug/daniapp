/**
 * Validação do formulário do GATE de primeiro acesso. Módulo PURO.
 *
 * Espelha — deliberadamente — parte das regras da Edge Function
 * `initial-password-change`. A duplicação é intencional e não é a autoridade:
 * o servidor recusa de novo. Conferir aqui evita uma ida de rede para errar o
 * óbvio e dá o motivo imediato a quem está digitando.
 *
 * NENHUMA das senhas é registrada, devolvida em mensagem ou persistida.
 */
import { checkPassword } from './passwordPolicy';

export type InitialPasswordIssue =
  | 'missing_current'
  | 'invalid_new'
  | 'same_password';

export interface InitialPasswordCheck {
  ok: boolean;
  issue?: InitialPasswordIssue;
  /** Mensagem pronta para a tela; nunca ecoa qualquer senha. */
  message?: string;
}

/**
 * Ordem deliberada: primeiro a senha atual (sem ela nada acontece), depois a
 * qualidade e a confirmação da nova, por último a igualdade entre as duas.
 * Assim o operador corrige um problema por vez.
 */
export function checkInitialPasswordForm(
  currentPassword: string,
  newPassword: string,
  confirmation: string,
): InitialPasswordCheck {
  if (currentPassword === '') {
    return { ok: false, issue: 'missing_current', message: 'Informe a senha temporária atual.' };
  }

  // Cobre vazia, só espaços, curta demais e confirmação divergente.
  const nova = checkPassword(newPassword, confirmation);
  if (!nova.ok) {
    return { ok: false, issue: 'invalid_new', message: nova.message ?? 'Senha inválida.' };
  }

  if (newPassword === currentPassword) {
    return {
      ok: false,
      issue: 'same_password',
      message: 'A nova senha precisa ser diferente da senha atual.',
    };
  }

  return { ok: true };
}
