/**
 * Núcleo testável da Edge Function `initial-password-change`.
 *
 * POR QUE ESTA FUNÇÃO EXISTE: a senha temporária da carga é conhecida por quem
 * preparou a planilha. Ela precisa ser trocada no primeiro acesso, e a troca
 * precisa ser PROVADA — não declarada pelo cliente.
 *
 * A prova mora aqui, não no banco. A migration 0016 tentou provar comparando
 * `encrypted_password` com um hash guardado, e isso não prova nada: bcrypt usa
 * salt aleatório, então reenviar a MESMA senha gera hash diferente. A 0017
 * removeu aquela comparação. Agora:
 *
 *   - a igualdade "nova = atual" é verificada em MEMÓRIA, antes de qualquer
 *     chamada ao provedor;
 *   - a senha atual é validada pelo próprio GoTrue, via `current_password` no
 *     `updateUser` — quem valida credencial é quem a guarda;
 *   - só depois do provedor confirmar a troca é que o onboarding é encerrado,
 *     e o encerramento usa `service_role` com o uuid tirado do JWT validado.
 *
 * O corpo da requisição NÃO carrega identidade: nem e-mail, nem userId, nem
 * papel. Aceitar qualquer um deles permitiria trocar a senha de outra pessoa.
 *
 * NENHUMA das duas senhas é registrada, devolvida ou colocada em mensagem.
 */

export type ChangeErrorCode =
  | 'unauthenticated'
  | 'not_required'
  | 'missing_current'
  | 'missing_new'
  | 'same_password'
  | 'too_short'
  | 'needs_letter_and_digit'
  | 'contains_email'
  | 'invalid_current'
  | 'provider_failed'
  | 'completion_failed';

export const MIN_NEW_PASSWORD_LENGTH = 12;

export class ChangeError extends Error {
  constructor(readonly status: number, readonly code: ChangeErrorCode, message: string) {
    super(message);
    this.name = 'ChangeError';
  }
}

/** Mensagens deliberadamente genéricas; nenhuma ecoa a senha. */
const MESSAGES: Record<ChangeErrorCode, string> = {
  unauthenticated: 'Autenticação obrigatória.',
  not_required: 'Não há troca de senha pendente para esta conta.',
  missing_current: 'Informe a senha atual.',
  missing_new: 'Informe a nova senha.',
  same_password: 'A nova senha precisa ser diferente da senha atual.',
  too_short: `A nova senha precisa ter pelo menos ${MIN_NEW_PASSWORD_LENGTH} caracteres.`,
  needs_letter_and_digit: 'A nova senha precisa conter letras e números.',
  contains_email: 'A nova senha não pode conter o seu e-mail.',
  invalid_current: 'Senha atual incorreta.',
  provider_failed: 'Não foi possível alterar a senha. Tente novamente.',
  completion_failed: 'A senha foi alterada, mas a liberação não concluiu. Entre novamente.',
};

const falha = (status: number, code: ChangeErrorCode) =>
  new ChangeError(status, code, MESSAGES[code]);

/** Identidade extraída do JWT — nunca do corpo da requisição. */
export interface CallerIdentity {
  id: string;
  email: string;
}

export interface AuthPort {
  /** Resolve o usuário a partir do token. `null` quando o token é inválido. */
  resolveCaller(accessToken: string): Promise<CallerIdentity | null>;
  /**
   * PROVA a senha atual e só então troca, sob o JWT do próprio usuário — nunca
   * com service role, e nunca `updateUserById`, que trocaria a senha sem
   * conferir nada.
   *
   * O e-mail entra aqui porque a prova da senha atual é uma AUTENTICAÇÃO: não
   * dá para provar que alguém sabe a senha sem tentar usá-la. Ver a nota da
   * implementação sobre por que `current_password` do provedor não basta.
   */
  updateOwnPassword(
    accessToken: string,
    email: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true } | { ok: false; invalidCurrent: boolean }>;
}

export interface DbPort {
  /** `public.password_change_status()` sob o JWT do usuário. */
  isChangeRequired(accessToken: string): Promise<boolean>;
  /** `public.service_complete_initial_password_change(uuid)` com service_role. */
  completeForUser(userId: string): Promise<{ ok: boolean }>;
}

export interface HandlerDeps {
  auth: AuthPort;
  db: DbPort;
  hasServiceRole: boolean;
  /** Tentativas da conclusão. Pequeno e limitado de propósito. */
  completionAttempts?: number;
}

export interface HandlerRequest {
  accessToken: string | null;
  currentPassword: unknown;
  newPassword: unknown;
}

export interface ChangeResponse {
  ok: true;
  /** Sempre false no sucesso; o cliente ainda assim reconsulta o estado. */
  required: false;
}

/** Regras da nova senha. Não recebe nem devolve a senha em nenhuma mensagem. */
export function validateNewPassword(nova: string, atual: string, email: string): void {
  if (nova === atual) throw falha(400, 'same_password');
  if (nova.length < MIN_NEW_PASSWORD_LENGTH) throw falha(400, 'too_short');
  if (!/[A-Za-zÀ-ÿ]/.test(nova) || !/\d/.test(nova)) throw falha(400, 'needs_letter_and_digit');

  const alvo = email.trim().toLowerCase();
  const senha = nova.toLowerCase();
  if (alvo !== '') {
    const local = alvo.split('@')[0];
    if (senha.includes(alvo) || (local.length >= 4 && senha.includes(local))) {
      throw falha(400, 'contains_email');
    }
  }
}

/**
 * Troca a senha inicial do PRÓPRIO usuário autenticado.
 *
 * Ordem obrigatória: identidade → obrigação → validação em memória → provedor →
 * conclusão. Inverter qualquer passo abre um buraco: validar depois do provedor
 * já teria trocado a senha; concluir antes do provedor liberaria o gate sem troca.
 */
export async function handleInitialPasswordChange(
  request: HandlerRequest,
  deps: HandlerDeps,
): Promise<ChangeResponse> {
  if (!deps.hasServiceRole) {
    throw new ChangeError(500, 'completion_failed', 'Função não configurada no servidor.');
  }
  if (!request.accessToken) throw falha(401, 'unauthenticated');

  // 1) Identidade EXCLUSIVAMENTE do token validado.
  const caller = await deps.auth.resolveCaller(request.accessToken);
  if (!caller) throw falha(401, 'unauthenticated');

  // 2) Só troca quem está obrigado. Sem isso a função viraria um "trocar senha"
  //    genérico, fora do fluxo de primeiro acesso.
  if (!(await deps.db.isChangeRequired(request.accessToken))) {
    throw falha(409, 'not_required');
  }

  const atual = typeof request.currentPassword === 'string' ? request.currentPassword : '';
  const nova = typeof request.newPassword === 'string' ? request.newPassword : '';
  if (atual === '') throw falha(400, 'missing_current');
  if (nova === '') throw falha(400, 'missing_new');

  // 3) Comparação em MEMÓRIA. É o único ponto do sistema onde as duas senhas
  //    existem juntas, e é o único lugar onde "são iguais" pode ser decidido.
  validateNewPassword(nova, atual, caller.email);

  // 4) A senha atual é provada e a troca é efetivada. O e-mail vem do token,
  //    igual ao uuid — nunca do corpo.
  const trocado = await deps.auth.updateOwnPassword(
    request.accessToken, caller.email, atual, nova,
  );
  if (!trocado.ok) {
    // Falhou: o onboarding NÃO é concluído e a conta segue no gate.
    throw falha(trocado.invalidCurrent ? 400 : 502,
      trocado.invalidCurrent ? 'invalid_current' : 'provider_failed');
  }

  // 5) Conclusão, já com a troca confirmada. O uuid vem do token — nunca do corpo.
  const tentativas = Math.max(1, Math.min(deps.completionAttempts ?? 3, 5));
  for (let i = 0; i < tentativas; i += 1) {
    const r = await deps.db.completeForUser(caller.id);
    if (r.ok) return { ok: true, required: false };
  }

  // A senha JÁ mudou, mas o gate continua. É recuperável: o cliente entra com a
  // senha nova e a conclusão é idempotente, então roda de novo sem prejuízo.
  throw falha(503, 'completion_failed');
}
