/**
 * Edge Function `admin-provision-users` — provisionamento SEM convite.
 *
 * Entrypoint fino: lê o ambiente, monta as portas e delega para `handler.ts`
 * (onde mora a lógica testada). Roda EXCLUSIVAMENTE no servidor.
 *
 * Deploy (NÃO executado automaticamente):
 *   supabase functions deploy admin-provision-users
 * Requer no ambiente da função: SUPABASE_URL, SUPABASE_ANON_KEY e
 * SUPABASE_SERVICE_ROLE_KEY. A service role NUNCA vai para o bundle do app.
 *
 * NÃO REQUER: SMTP, INVITE_REDIRECT_URL, template de e-mail. Nenhuma mensagem é
 * enviada em nenhum caminho — `inviteUserByEmail` não é importado nem chamado.
 *
 * Contrato:
 *   OPTIONS                  -> 204 com cabecalhos CORS (preflight)
 *   POST { rows: [...] }     + Authorization: Bearer <token do Administrador>
 *   200  { ok, counters, rows, report }
 *   401/403/400/405/500 { error }
 *
 * `cors.ts` e `identityIndex.ts` vivem em `supabase/functions/_shared/` e são
 * usados pelas DUAS funções. Ficavam dentro da pasta de `admin-invite-users`, o
 * que fazia a função nova depender do diretório da legada — se a legada fosse
 * removida um dia, esta quebraria. Duplicar a paginação também não serve: criaria
 * duas verdades sobre idempotência.
 */
// @ts-nocheck — este arquivo roda em Deno, fora do tsconfig do app.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import { AuthAdminPort, CallerPort, DbPort, HandlerError, handleProvisionUsers } from './handler.ts';
import { isPreflight, jsonHeaders, preflightResponse } from '../_shared/cors.ts';
import { buildIdentityIndex } from '../_shared/identityIndex.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authPort: AuthAdminPort = {
  async findExistingIdentities(emails) {
    // A Admin API NÃO filtra por e-mail (PageParams só aceita page/perPage), então
    // a base é percorrida por paginação UMA vez por requisição. O índice é local à
    // chamada: cache entre requisições não enxergaria identidade criada nesse meio.
    const indice = await buildIdentityIndex((params) => admin.auth.admin.listUsers(params));
    const encontrados = new Map<string, string>();
    for (const email of emails) {
      const id = indice.get(email);
      if (id) encontrados.set(email, id);
    }
    return encontrados;
  },
  async createUser(email, password) {
    // `email_confirm: true` é o ponto central do desenho: a identidade nasce com
    // o e-mail JÁ confirmado, sem link e sem SMTP, e por isso
    // `admin_activate_confirmed_users` consegue promovê-la a `active` em seguida.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) return { error: error.message };
    return { id: data.user.id };
  },
  async updatePassword(userId, password) {
    // Caminho ADMINISTRATIVO: usado só quando o operador liga
    // `resetExistingPasswords`. Nunca no fluxo de troca pessoal, que precisa
    // validar a senha atual — isso é da função `initial-password-change`.
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return { error: error.message };
    return { ok: true };
  },
};

/** RPCs executadas COM O TOKEN DO SOLICITANTE: a RLS e o `app.is_admin()` valem. */
function dbPortFor(accessToken: string): DbPort {
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    async importUsers(rows, commit) {
      const { data, error } = await asCaller.rpc('admin_import_users', {
        p_rows: rows,
        p_commit: commit,
      });
      return error ? { error: error.message } : { data };
    },
    async requirePasswordChange(userIds) {
      const { data, error } = await asCaller.rpc('admin_require_password_change', {
        p_user_ids: userIds,
      });
      return error ? { error: error.message } : { data };
    },
    async activateConfirmedUsers() {
      const { data, error } = await asCaller.rpc('admin_activate_confirmed_users');
      return error ? { error: error.message } : { data };
    },
  };
}

const callerPort: CallerPort = {
  async resolveCaller(accessToken) {
    // Cliente com o token do SOLICITANTE: a RLS decide o que ele enxerga.
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !userData?.user) return null;

    // O papel vem da MESMA projeção que o app usa, sob a RLS do solicitante.
    const { data: profile } = await asCaller
      .from('ui_users').select('role').eq('id', userData.user.id).single();
    return { id: userData.user.id, role: (profile?.role as string | null) ?? null };
  },
};

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');

  // 1) PREFLIGHT — primeira coisa do handler, sem tocar em nada mais.
  if (isPreflight(req.method)) {
    const { status, headers } = preflightResponse(origin);
    return new Response(null, { status, headers });
  }

  // 2) Metodo. Agora COM cabecalhos CORS, senao o navegador esconderia o erro.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não suportado.' }), {
      status: 405, headers: jsonHeaders(origin),
    });
  }

  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const accessToken = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : null;
    const body = await req.json().catch(() => ({}));

    const result = await handleProvisionUsers(
      { accessToken, rows: body?.rows, options: body?.options },
      {
        auth: authPort,
        caller: callerPort,
        db: dbPortFor(accessToken ?? ''),
        hasServiceRole: SERVICE_ROLE_KEY !== '',
      },
    );
    return new Response(JSON.stringify(result), {
      status: 200, headers: jsonHeaders(origin),
    });
  } catch (e) {
    const status = e instanceof HandlerError ? e.status : 500;
    // Só a mensagem controlada sai; stack e detalhe de provedor ficam no servidor.
    const message = e instanceof HandlerError ? e.message : 'Falha interna.';
    return new Response(JSON.stringify({ error: message }), {
      status, headers: jsonHeaders(origin),
    });
  }
});
