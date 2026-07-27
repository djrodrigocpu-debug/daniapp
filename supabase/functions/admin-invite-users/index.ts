/**
 * Edge Function `admin-invite-users` — fase 2 do onboarding corporativo.
 *
 * Entrypoint fino: lê o ambiente, monta as portas e delega para `handler.ts`
 * (que é onde mora a lógica testada). Roda EXCLUSIVAMENTE no servidor.
 *
 * Deploy (NÃO executado automaticamente):
 *   supabase functions deploy admin-invite-users
 * Requer no ambiente da função: SUPABASE_URL, SUPABASE_ANON_KEY e
 * SUPABASE_SERVICE_ROLE_KEY. A service role NUNCA vai para o bundle do app.
 *
 * Contrato:
 *   OPTIONS                    -> 204 com cabecalhos CORS (preflight)
 *   POST { emails: string[] }  + Authorization: Bearer <token do Administrador>
 *   200  { ok, counters, rows: [{ email, state, authUserId, message? }] }
 *   401/403/400/405/500 { error }
 *
 * TODA resposta carrega CORS. O preflight e respondido ANTES de qualquer
 * validacao de metodo, leitura de body, checagem de JWT, verificacao de
 * Administrador ou acesso ao Supabase — era exatamente essa ordem que fazia o
 * OPTIONS receber 405 sem cabecalho e o navegador bloquear o POST.
 */
// @ts-nocheck — este arquivo roda em Deno, fora do tsconfig do app.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AuthAdminPort, CallerPort, HandlerError, handleInviteUsers } from './handler.ts';
import { isPreflight, jsonHeaders, preflightResponse } from './cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Destino do link de convite — decidido AQUI, no servidor. `INVITE_REDIRECT_URL`
// é obrigatória; `INVITE_REDIRECT_ALLOWLIST` (CSV) libera alternativas conhecidas
// (ex.: deep link nativo) sem jamais aceitar URL arbitrária do navegador.
const INVITE_REDIRECT_URL = Deno.env.get('INVITE_REDIRECT_URL') ?? '';
const INVITE_REDIRECT_ALLOWLIST = (Deno.env.get('INVITE_REDIRECT_ALLOWLIST') ?? '')
  .split(',').map((s) => s.trim()).filter((s) => s !== '');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authPort: AuthAdminPort = {
  async findUserByEmail(email) {
    // A Admin API pagina; o filtro por e-mail evita varrer a base inteira.
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw new Error('lookup failed');
    const hit = (data?.users ?? []).find(
      (u: { email?: string }) => (u.email ?? '').toLowerCase() === email,
    );
    return hit ? { id: hit.id } : null;
  },
  async inviteUserByEmail(email, redirectTo) {
    // `redirectTo` ja veio validado contra a allowlist do servidor.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) return { error: error.message };
    return { id: data.user.id };
  },
};

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

    const result = await handleInviteUsers(
      { accessToken, emails: body?.emails, redirectTo: body?.redirectTo },
      {
        auth: authPort,
        caller: callerPort,
        hasServiceRole: SERVICE_ROLE_KEY !== '',
        redirect: { defaultUrl: INVITE_REDIRECT_URL, allowlist: INVITE_REDIRECT_ALLOWLIST },
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
