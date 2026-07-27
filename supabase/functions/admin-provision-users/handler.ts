/**
 * Núcleo testável da Edge Function `admin-provision-users`.
 *
 * SUBSTITUI OPERACIONALMENTE `admin-invite-users`. A diferença é o mecanismo de
 * nascimento da credencial:
 *
 *   antes  →  inviteUserByEmail  →  e-mail de convite  →  usuário define senha
 *   agora  →  createUser(email, senha, email_confirm: true)  →  sem e-mail algum
 *
 * O canal de e-mail deixa de existir no caminho crítico: não há SMTP, não há
 * link de confirmação, não há convite. A senha inicial vem da planilha e o
 * `email_confirm: true` já nasce com o e-mail confirmado — que é exatamente a
 * condição que `admin_activate_confirmed_users` (0010) exige para promover o
 * perfil de `invited` para `active`. Por isso nada disto precisa de migration.
 *
 * ORDEM (imposta por public.users.id → auth.users(id)): o perfil não pode
 * preceder a identidade.
 *
 *   1. admin_import_users(rows, commit=false)  — valida tudo, não grava nada
 *   2. índice paginado do Auth                 — quem já tem identidade
 *   3. createUser dos que faltam               — senha inicial, sem e-mail
 *   4. admin_import_users(rows+authUserId, commit=true) — transação única
 *   5. admin_activate_confirmed_users()        — invited → active
 *
 * SENHA: entra por `rows[].initialPassword`, vive apenas no escopo desta
 * requisição e não sai em nenhuma saída — nem no relatório, nem em erro, nem em
 * log. `ProvisionResultRow` deliberadamente não tem campo para ela.
 */

/** Estado de cada e-mail no ciclo de vida da identidade. */
export type ProvisionState = 'created' | 'already_exists' | 'failed';

export interface ProvisionResultRow {
  email: string;
  state: ProvisionState;
  /** Preenchido em 'created' e 'already_exists'; null em 'failed'. */
  authUserId: string | null;
  /** Mensagem segura para o operador — nunca inclui senha, token ou payload. */
  message?: string;
}

export interface ProvisionResponse {
  ok: boolean;
  counters: {
    total: number;
    created: number;
    alreadyExisting: number;
    failed: number;
    /** Perfis promovidos de `invited` para `active` na etapa 5. */
    activated: number;
  };
  rows: ProvisionResultRow[];
  /** Relatório linha a linha devolvido pela RPC no commit. */
  report: unknown;
}

/** Linha do lote, já normalizada pelo aplicativo. */
export interface ProvisionRequestRow {
  index: number;
  name: string;
  email: string;
  role: string;
  region: string;
  /** Exigida SOMENTE quando o e-mail ainda não tem identidade no Auth. */
  initialPassword?: string;
  active?: boolean;
}

/** Verificação de identidade/papel do SOLICITANTE, com o token dele. */
export interface CallerPort {
  /** null quando o token é inválido/ausente. */
  resolveCaller(accessToken: string): Promise<{ id: string; role: string | null } | null>;
}

/** Subconjunto da Auth Admin API — injetável para teste. */
export interface AuthAdminPort {
  /**
   * Resolve, DE UMA VEZ, quais e-mails do lote já têm identidade.
   * Em lote por contrato: uma consulta por e-mail multiplicaria a varredura da
   * base pelo tamanho do lote.
   */
  findExistingIdentities(emails: string[]): Promise<Map<string, string>>;
  /**
   * Cria a identidade JÁ CONFIRMADA, com a senha inicial. Nunca envia e-mail.
   * `inviteUserByEmail` não faz parte desta porta — é o ponto do desenho que
   * torna impossível disparar convite por engano.
   */
  createUser(email: string, password: string): Promise<{ id: string } | { error: string }>;
}

/** RPCs do Postgres usadas pelo provisionamento. */
export interface DbPort {
  /** `public.admin_import_users(p_rows, p_commit)`. */
  importUsers(rows: unknown[], commit: boolean): Promise<{ data?: unknown; error?: string }>;
  /** `public.admin_activate_confirmed_users()`. */
  activateConfirmedUsers(): Promise<{ data?: unknown; error?: string }>;
}

export interface HandlerDeps {
  caller: CallerPort;
  auth: AuthAdminPort;
  db: DbPort;
  /** true quando a service role está configurada no ambiente do servidor. */
  hasServiceRole: boolean;
}

export interface HandlerRequest {
  accessToken: string | null;
  rows: unknown;
}

export class HandlerError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HandlerError';
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Mesmo teto do importador do aplicativo (`MAX_USER_IMPORT_ROWS`). */
export const MAX_ROWS = 200;
export const MIN_INITIAL_PASSWORD_LENGTH = 10;

const PAPEIS_COM_LOGIN = new Set(['admin', 'regional', 'coordinator', 'channel_manager']);

/**
 * Normaliza e valida o lote. Lança para entrada inaceitável — erro de contrato
 * aborta tudo, ao contrário de falha de UMA identidade, que vira linha `failed`.
 */
function parseRows(raw: unknown): ProvisionRequestRow[] {
  if (!Array.isArray(raw)) {
    throw new HandlerError(400, 'Corpo inválido: esperado { rows: [] }.');
  }
  if (raw.length === 0) throw new HandlerError(400, 'Nenhum registro informado.');
  if (raw.length > MAX_ROWS) {
    throw new HandlerError(400, `Lote excede o limite de ${MAX_ROWS} registros.`);
  }

  const vistos = new Set<string>();
  const saida: ProvisionRequestRow[] = [];

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      throw new HandlerError(400, 'Corpo inválido: cada registro deve ser um objeto.');
    }
    const r = item as Record<string, unknown>;
    const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email) || email.length > 254) {
      throw new HandlerError(400, `E-mail inválido no lote: ${email || '(vazio)'}`);
    }
    if (vistos.has(email)) {
      throw new HandlerError(400, `E-mail repetido no lote: ${email}`);
    }
    vistos.add(email);

    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (name === '') throw new HandlerError(400, `Nome ausente para ${email}.`);

    const role = typeof r.role === 'string' ? r.role.trim() : '';
    // Somente perfis com conta de autenticação. Parceiro AACE não entra aqui:
    // é entidade avaliada, não usuário — não tem identidade, perfil nem escopo.
    if (!PAPEIS_COM_LOGIN.has(role)) {
      throw new HandlerError(400, `Perfil sem conta de acesso para ${email}.`);
    }

    const senha = typeof r.initialPassword === 'string' ? r.initialPassword : undefined;
    if (senha !== undefined) {
      // Só o formato; a mensagem nunca ecoa a senha.
      if (senha.length < MIN_INITIAL_PASSWORD_LENGTH) {
        throw new HandlerError(400, `Senha inicial curta demais para ${email}.`);
      }
      if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) {
        throw new HandlerError(400, `Senha inicial precisa de letras e números para ${email}.`);
      }
      if (senha.toLowerCase() === email || senha.toLowerCase().includes(email)) {
        throw new HandlerError(400, `Senha inicial não pode conter o e-mail (${email}).`);
      }
    }

    saida.push({
      index: typeof r.index === 'number' ? r.index : saida.length + 1,
      name,
      email,
      role,
      region: typeof r.region === 'string' ? r.region.trim() : '',
      ...(senha !== undefined ? { initialPassword: senha } : {}),
      ...(typeof r.active === 'boolean' ? { active: r.active } : {}),
    });
  }
  return saida;
}

/** Remove a senha antes de qualquer coisa cruzar a fronteira do Postgres. */
function semSenha(row: ProvisionRequestRow, authUserId?: string) {
  const { initialPassword: _descartada, ...resto } = row;
  return authUserId ? { ...resto, authUserId } : resto;
}

/** Extrai `pendingAuth` do relatório da RPC sem confiar no formato. */
function lerPendingAuth(data: unknown): string[] {
  const dto = data as { pendingAuth?: unknown } | null | undefined;
  if (!dto || !Array.isArray(dto.pendingAuth)) return [];
  return dto.pendingAuth
    .filter((e): e is string => typeof e === 'string')
    .map((e) => e.trim().toLowerCase());
}

function lerPromovidos(data: unknown): number {
  const dto = data as { promoted?: unknown } | null | undefined;
  return typeof dto?.promoted === 'number' ? dto.promoted : 0;
}

/**
 * Provisiona o lote. Nunca envia e-mail e nunca chama convite.
 *
 * Falha de UMA identidade vira linha `failed` e o lote NÃO é comitado — a
 * gravação é tudo-ou-nada, então um lote incompleto não pode virar meia
 * importação silenciosa.
 */
export async function handleProvisionUsers(
  request: HandlerRequest,
  deps: HandlerDeps,
): Promise<ProvisionResponse> {
  // 1) A service role é pré-requisito do servidor, não do chamador.
  if (!deps.hasServiceRole) {
    throw new HandlerError(500, 'Função não configurada no servidor (service role ausente).');
  }

  // 2) Identidade do solicitante.
  if (!request.accessToken) throw new HandlerError(401, 'Autenticação obrigatória.');
  const caller = await deps.caller.resolveCaller(request.accessToken);
  if (!caller) throw new HandlerError(401, 'Sessão inválida ou expirada.');

  // 3) Papel: só Administrador provisiona — mesma regra que o banco aplica.
  if (caller.role !== 'admin') {
    throw new HandlerError(403, 'Apenas Administrador pode provisionar usuários.');
  }

  const rows = parseRows(request.rows);

  // 4) SIMULAÇÃO: valida o lote inteiro no Postgres sem gravar nada. Se o lote
  //    for recusado aqui, nenhuma identidade é criada — ordem deliberada, para
  //    não deixar identidade órfã por erro de planilha.
  const simulado = await deps.db.importUsers(rows.map((r) => semSenha(r)), false);
  if (simulado.error) {
    throw new HandlerError(400, `Simulação recusou o lote: ${simulado.error}`);
  }
  const pendentes = new Set(lerPendingAuth(simulado.data));

  // 5) Índice do Auth: uma varredura paginada por requisição. Falha aqui aborta
  //    ANTES de criar qualquer identidade — tratar "não consegui consultar"
  //    como "não existe" duplicaria contas.
  const existentes = await deps.auth.findExistingIdentities(rows.map((r) => r.email));

  // 6) Cria só o que falta.
  const resultado: ProvisionResultRow[] = [];
  const idPorEmail = new Map<string, string>();

  for (const row of rows) {
    const jaExiste = existentes.get(row.email);
    if (jaExiste) {
      // Identidade preexistente: reaproveita o UUID e NÃO toca na senha. Trocar
      // a senha de quem já usa o sistema por causa de uma reimportação seria
      // sequestro de conta por planilha.
      idPorEmail.set(row.email, jaExiste);
      resultado.push({ email: row.email, state: 'already_exists', authUserId: jaExiste });
      continue;
    }

    if (!pendentes.has(row.email)) {
      // O Postgres não pediu identidade para este e-mail (perfil já existe e
      // será atualizado). Nada a criar.
      resultado.push({ email: row.email, state: 'already_exists', authUserId: null });
      continue;
    }

    if (!row.initialPassword) {
      resultado.push({
        email: row.email,
        state: 'failed',
        authUserId: null,
        message: 'Senha inicial obrigatória para usuário novo.',
      });
      continue;
    }

    try {
      const criado = await deps.auth.createUser(row.email, row.initialPassword);
      if ('error' in criado) {
        resultado.push({ email: row.email, state: 'failed', authUserId: null, message: criado.error });
      } else {
        idPorEmail.set(row.email, criado.id);
        resultado.push({ email: row.email, state: 'created', authUserId: criado.id });
      }
    } catch {
      // Detalhe do provedor não vaza; o operador reexecuta com segurança.
      resultado.push({
        email: row.email,
        state: 'failed',
        authUserId: null,
        message: 'Falha ao criar a identidade.',
      });
    }
  }

  const created = resultado.filter((r) => r.state === 'created').length;
  const alreadyExisting = resultado.filter((r) => r.state === 'already_exists').length;
  const failed = resultado.filter((r) => r.state === 'failed').length;

  // 7) Uma única falha impede o commit inteiro.
  if (failed > 0) {
    return {
      ok: false,
      counters: { total: rows.length, created, alreadyExisting, failed, activated: 0 },
      rows: resultado,
      report: null,
    };
  }

  // 8) COMMIT: perfis e escopos numa transação única, já com os authUserId.
  const comitado = await deps.db.importUsers(
    rows.map((r) => semSenha(r, idPorEmail.get(r.email))),
    true,
  );
  if (comitado.error) {
    throw new HandlerError(400, `Gravação recusada: ${comitado.error}`);
  }

  // 9) `email_confirm: true` no createUser já preencheu `email_confirmed_at`,
  //    que é a condição de `admin_activate_confirmed_users` — os novos perfis
  //    saem de `invited` para `active` sem nenhum clique do usuário.
  const ativados = await deps.db.activateConfirmedUsers();
  if (ativados.error) {
    throw new HandlerError(400, `Ativação recusada: ${ativados.error}`);
  }

  return {
    ok: true,
    counters: {
      total: rows.length,
      created,
      alreadyExisting,
      failed,
      activated: lerPromovidos(ativados.data),
    },
    rows: resultado,
    report: comitado.data ?? null,
  };
}
