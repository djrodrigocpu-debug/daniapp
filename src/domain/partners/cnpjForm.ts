/**
 * Decisão do campo CNPJ no formulário de Parceiro AACE.
 *
 * POR QUE ISTO É UM MÓDULO E NÃO LÓGICA NA TELA: a regra de montagem do patch
 * tem uma armadilha real. `admin_update_operation` distingue três coisas:
 *
 *   - chave `cnpj` AUSENTE       ⇒ preserva o valor atual;
 *   - chave presente e vazia     ⇒ RECUSA a edição inteira, se já houver CNPJ;
 *   - chave presente com valor   ⇒ valida e grava.
 *
 * Ou seja: mandar `cnpj: ''` porque o operador não mexeu no campo faria o
 * servidor recusar a edição de um parceiro legado inteiro — o usuário tentaria
 * corrigir a cidade e receberia um erro sobre CNPJ. A tela não pode errar isso,
 * e tela neste projeto não tem teste (o Vitest só inclui `*.test.ts` e não há
 * testing-library). Então a decisão vive aqui, pura e coberta.
 *
 * A comparação é sempre entre valores NORMALIZADOS: comparar o texto formatado
 * acusaria mudança sempre que a máscara pontuasse diferente.
 */
import { isValidCnpj, normalizeCnpj } from './cnpj';

export type CnpjFieldError =
  | 'obrigatorio'
  | 'invalido'
  | 'remocao_nao_permitida';

export interface CnpjFieldDecision {
  ok: boolean;
  /** Motivo da recusa; ausente quando `ok`. */
  error?: CnpjFieldError;
  /** Mensagem pronta para a tela. Nunca ecoa o valor digitado. */
  message?: string;
  /**
   * O que fazer com a chave no payload:
   *  - `omit`  ⇒ NÃO incluir `cnpj` (preserva o que está no banco);
   *  - `send`  ⇒ incluir `cnpj: value`, já com 14 dígitos.
   */
  patch: { action: 'omit' } | { action: 'send'; value: string };
}

const MESSAGES: Record<CnpjFieldError, string> = {
  obrigatorio: 'Informe o CNPJ do parceiro.',
  invalido: 'CNPJ inválido.',
  remocao_nao_permitida:
    'Não é possível remover um CNPJ já cadastrado deixando o campo vazio. '
    + 'Informe outro CNPJ válido ou restaure o atual.',
};

function recusa(error: CnpjFieldError): CnpjFieldDecision {
  return { ok: false, error, message: MESSAGES[error], patch: { action: 'omit' } };
}

export interface CnpjFieldParams {
  /** O que está no campo, como o operador digitou (pode vir formatado). */
  typed: string;
  /**
   * Valor atualmente gravado. `null` para parceiro legado (anterior à 0014) e
   * para criação. É o que distingue "não mexeu" de "apagou".
   */
  current: string | null;
  /** true no formulário de criação; false na edição. */
  creating: boolean;
}

/**
 * Decide se o CNPJ entra no payload, sai dele, ou barra o envio.
 *
 * Criação: obrigatório e válido.
 * Edição com CNPJ gravado: igual ⇒ omite; vazio ⇒ recusa; novo válido ⇒ envia.
 * Edição de legado (`current === null`): vazio ⇒ omite (nunca manda `''`);
 * preenchido e válido ⇒ envia.
 */
export function resolveCnpjField({ typed, current, creating }: CnpjFieldParams): CnpjFieldDecision {
  const digitado = normalizeCnpj(typed);
  const atual = normalizeCnpj(current);

  if (creating) {
    if (digitado === '') return recusa('obrigatorio');
    if (!isValidCnpj(digitado)) return recusa('invalido');
    return { ok: true, patch: { action: 'send', value: digitado } };
  }

  // Não mexeu: a chave sai do payload e o banco preserva o que já tem.
  if (digitado === atual) return { ok: true, patch: { action: 'omit' } };

  if (digitado === '') {
    // Legado continua legado — nunca mandamos string vazia, que o servidor leria
    // como ordem de remoção.
    if (atual === '') return { ok: true, patch: { action: 'omit' } };
    return recusa('remocao_nao_permitida');
  }

  if (!isValidCnpj(digitado)) return recusa('invalido');
  return { ok: true, patch: { action: 'send', value: digitado } };
}

/**
 * Aplica a decisão a um payload. Devolve um objeto NOVO; quando a ação é
 * `omit`, a chave `cnpj` simplesmente não existe — não vira `undefined`, que
 * alguns serializadores transformariam em `null`.
 */
export function applyCnpjToPayload<T extends object>(
  payload: T,
  decision: CnpjFieldDecision,
): T & { cnpj?: string } {
  if (decision.patch.action === 'send') {
    return { ...payload, cnpj: decision.patch.value };
  }
  return { ...payload };
}
