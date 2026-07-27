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
 *   POST { emails: string[] }  + Authorization: Bearer <token do Administrador>
 *   200  { ok, counters, rows: [{ email, state, authUserId, message? }] }
 *   401/403/400/500 { error }
 */
// @ts-nocheck — este arquivo roda em Deno, fora do tsconfig do app.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AuthAdminPort, CallerPort, HandlerError, handleInviteUsers } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
  async inviteUserByEmail(email) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
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
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não suportado.' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const accessToken = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : null;
    const body = await req.json().catch(() => ({}));

    const result = await handleInviteUsers(
      { accessToken, emails: body?.emails },
      { auth: authPort, caller: callerPort, hasServiceRole: SERVICE_ROLE_KEY !== '' },
    );
    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const status = e instanceof HandlerError ? e.status : 500;
    // Só a mensagem controlada sai; stack e detalhe de provedor ficam no servidor.
    const message = e instanceof HandlerError ? e.message : 'Falha interna.';
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { 'Content-Type': 'application/json' },
    });
  }
});
