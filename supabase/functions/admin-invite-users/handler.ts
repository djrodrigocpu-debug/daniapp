/**
 * Núcleo testável da Edge Function `admin-invite-users` (fase 2 do onboarding).
 *
 * Fica separado do `index.ts` porque este arquivo NÃO importa nada de Deno:
 * assim a lógica de autorização e idempotência roda no vitest com mocks, e o
 * entrypoint fica sendo só leitura de ambiente + HTTP.
 *
 * POR QUE ESTA FUNÇÃO EXISTE (P0-C): inserir uma linha em `auth.users` por SQL
 * não cria credencial — não há senha, confirmação nem identidade no GoTrue, e o
 * usuário não consegue autenticar. A identidade real só nasce pela Auth Admin
 * API, que exige `service_role` e por isso NUNCA pode viver no bundle do app.
 *
 * ORDEM (imposta por public.users.id → auth.users(id)): esta fase roda DEPOIS da
 * simulação SQL e ANTES do commit. Nenhuma linha do Postgres é tocada aqui, então
 * uma falha parcial não deixa perfil órfão — e como a operação é idempotente por
 * e-mail, basta reexecutar.
 *
 * SEGREDOS: a service role só é usada para chamar a Auth Admin API. Ela nunca é
 * lida do corpo da requisição, nunca é devolvida e nunca entra em log.
 */

/** Estado de cada e-mail no ciclo de vida da identidade. */
export type InviteState = 'invited' | 'already_exists' | 'failed';

export interface InviteResultRow {
  email: string;
  state: InviteState;
  /** Preenchido em 'invited' e 'already_exists'; null em 'failed'. */
  authUserId: string | null;
  /** Mensagem segura para o operador — nunca inclui token, header ou payload. */
  message?: string;
}

export interface InviteResponse {
  ok: boolean;
  counters: { total: number; invited: number; alreadyExisting: number; failed: number };
  rows: InviteResultRow[];
}

/** Subconjunto da Auth Admin API que usamos — injetável para teste. */
export interface AuthAdminPort {
  /** Cria a identidade e dispara o convite, com o destino do link. */
  inviteUserByEmail(email: string, redirectTo: string): Promise<{ id: string } | { error: string }>;
  /** Recupera a identidade existente (idempotência). */
  findUserByEmail(email: string): Promise<{ id: string } | null>;
}

/**
 * Destino do link de convite. É decidido pelo SERVIDOR, nunca pelo navegador:
 * um `redirectTo` livre transformaria o convite em vetor de phishing — o link
 * sairia de um remetente legítimo levando a credencial para domínio alheio.
 *
 * `INVITE_REDIRECT_URL` define o padrão; `INVITE_REDIRECT_ALLOWLIST` (lista
 * separada por vírgula) permite alternativas conhecidas, e só elas.
 */
export interface RedirectPolicy {
  /** Usada quando o chamador não pede nada. Obrigatória. */
  defaultUrl: string;
  /** Origens completas aceitas além da padrão. */
  allowlist: string[];
}

/** Compara origem + caminho, ignorando query/fragmento e barra final. */
function sameTarget(a: string, b: string): boolean {
  const norm = (u: string) => u.split('#')[0].split('?')[0].replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Resolve o destino final. Sem pedido explícito, usa o padrão. Com pedido,
 * exige correspondência exata na allowlist — nada de `startsWith`, que aceitaria
 * `https://staging.exemplo.test.atacante.com`.
 */
export function resolveRedirect(requested: unknown, policy: RedirectPolicy): string {
  if (!policy.defaultUrl || policy.defaultUrl.trim() === '') {
    throw new HandlerError(500, 'Função não configurada no servidor (destino do convite ausente).');
  }
  if (requested === undefined || requested === null || requested === '') {
    return policy.defaultUrl;
  }
  if (typeof requested !== 'string') {
    throw new HandlerError(400, 'redirectTo inválido.');
  }
  const permitidas = [policy.defaultUrl, ...policy.allowlist];
  const match = permitidas.find((allowed) => sameTarget(allowed, requested));
  if (!match) {
    // Não ecoa a URL recusada: ela vem do cliente e pode ser conteúdo hostil.
    throw new HandlerError(400, 'Destino de redirecionamento não autorizado.');
  }
  return match;
}

/** Verificação de identidade/papel do SOLICITANTE, com o token dele. */
export interface CallerPort {
  /** null quando o token é inválido/ausente. */
  resolveCaller(accessToken: string): Promise<{ id: string; role: string | null } | null>;
}

export interface HandlerDeps {
  auth: AuthAdminPort;
  caller: CallerPort;
  /** true quando a service role está configurada no ambiente do servidor. */
  hasServiceRole: boolean;
  /** Destino do link, decidido no servidor (ver resolveRedirect). */
  redirect: RedirectPolicy;
}

export interface HandlerRequest {
  accessToken: string | null;
  emails: unknown;
  /** Opcional; só é aceito se constar na allowlist do servidor. */
  redirectTo?: unknown;
}

export class HandlerError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HandlerError';
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_EMAILS = 200;

/** Normaliza e valida o lote; lança HandlerError para entrada inaceitável. */
function parseEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new HandlerError(400, 'Corpo inválido: esperado { emails: string[] }.');
  }
  if (raw.length === 0) {
    throw new HandlerError(400, 'Nenhum e-mail informado.');
  }
  if (raw.length > MAX_EMAILS) {
    throw new HandlerError(400, `Lote excede o limite de ${MAX_EMAILS} e-mails.`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      throw new HandlerError(400, 'Corpo inválido: todos os itens devem ser texto.');
    }
    const email = item.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      throw new HandlerError(400, `E-mail inválido no lote: ${email}`);
    }
    // Repetição no lote é colapsada, não duplicada — o convite é por e-mail.
    if (!seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

/**
 * Executa a fase 2. Nunca lança por falha de UM e-mail: a linha vira 'failed'
 * e o lote continua, para que o relatório mostre exatamente o que resta fazer
 * numa reexecução. Só erros de contrato/autorização abortam.
 */
export async function handleInviteUsers(
  request: HandlerRequest,
  deps: HandlerDeps,
): Promise<InviteResponse> {
  // 1) A service role é pré-requisito do servidor, não do chamador.
  if (!deps.hasServiceRole) {
    throw new HandlerError(500, 'Função não configurada no servidor (service role ausente).');
  }

  // 2) Identidade do solicitante.
  if (!request.accessToken) {
    throw new HandlerError(401, 'Autenticação obrigatória.');
  }
  const caller = await deps.caller.resolveCaller(request.accessToken);
  if (!caller) {
    throw new HandlerError(401, 'Sessão inválida ou expirada.');
  }

  // 3) Papel: só Administrador convida — mesma regra que o banco aplica.
  if (caller.role !== 'admin') {
    throw new HandlerError(403, 'Apenas Administrador pode convidar usuários.');
  }

  // Destino resolvido ANTES de qualquer chamada ao Auth: pedido inválido não
  // pode gerar convite nenhum.
  const redirectTo = resolveRedirect(request.redirectTo, deps.redirect);

  const emails = parseEmails(request.emails);
  const rows: InviteResultRow[] = [];

  for (const email of emails) {
    // Idempotência: identidade já existente é reaproveitada, nunca recriada.
    let existing: { id: string } | null = null;
    try {
      existing = await deps.auth.findUserByEmail(email);
    } catch {
      rows.push({ email, state: 'failed', authUserId: null, message: 'Falha ao consultar a identidade.' });
      continue;
    }
    if (existing) {
      rows.push({ email, state: 'already_exists', authUserId: existing.id });
      continue;
    }

    try {
      const created = await deps.auth.inviteUserByEmail(email, redirectTo);
      if ('error' in created) {
        rows.push({ email, state: 'failed', authUserId: null, message: created.error });
      } else {
        rows.push({ email, state: 'invited', authUserId: created.id });
      }
    } catch {
      // Detalhe do provedor não vaza; o operador reexecuta com segurança.
      rows.push({ email, state: 'failed', authUserId: null, message: 'Falha ao criar a identidade.' });
    }
  }

  const invited = rows.filter((r) => r.state === 'invited').length;
  const alreadyExisting = rows.filter((r) => r.state === 'already_exists').length;
  const failed = rows.filter((r) => r.state === 'failed').length;

  return {
    // ok=false quando algo ficou pendente: o cliente NÃO deve seguir para o
    // commit SQL com um lote incompleto.
    ok: failed === 0,
    counters: { total: rows.length, invited, alreadyExisting, failed },
    rows,
  };
}
