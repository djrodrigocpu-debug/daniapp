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
  /** Cria a identidade e dispara o convite. */
  inviteUserByEmail(email: string): Promise<{ id: string } | { error: string }>;
  /** Recupera a identidade existente (idempotência). */
  findUserByEmail(email: string): Promise<{ id: string } | null>;
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
}

export interface HandlerRequest {
  accessToken: string | null;
  emails: unknown;
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
      const created = await deps.auth.inviteUserByEmail(email);
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
