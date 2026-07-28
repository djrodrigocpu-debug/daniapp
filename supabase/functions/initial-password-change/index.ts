/**
 * Edge Function `initial-password-change` — troca da senha temporária no
 * primeiro acesso.
 *
 * Entrypoint fino: lê o ambiente, monta as portas e delega para `handler.ts`
 * (onde mora a lógica testada). Roda EXCLUSIVAMENTE no servidor.
 *
 * Deploy (NÃO executado automaticamente):
 *   supabase functions deploy initial-password-change
 * Requer no ambiente: SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.
 *
 * VERSÃO DO SDK FIXADA em 2.102.0, e não `@2`. A troca depende de
 * `updateUser({ current_password })`, que só existe a partir dessa versão — um
 * import flutuante poderia, num redeploy futuro, cair numa versão que ignora o
 * campo e trocaria a senha SEM validar a atual.
 *
 * NÃO REQUER: SMTP, template ou redirect. Nenhuma mensagem é enviada em nenhum
 * caminho: `inviteUserByEmail` e `resetPasswordForEmail` não são importados.
 */
// @ts-nocheck — este arquivo roda em Deno, fora do tsconfig do app.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import { AuthPort, ChangeError, DbPort, handleInitialPasswordChange } from './handler.ts';
import { isPreflight, jsonHeaders, preflightResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Cliente sob o JWT do PRÓPRIO usuário: a RLS e o GoTrue tratam-no como ele. */
function comoUsuario(accessToken: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cliente privilegiado: usado SÓ para concluir o onboarding, nunca para senha. */
const servidor = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authPort: AuthPort = {
  async resolveCaller(accessToken) {
    // O token vai EXPLÍCITO. `getUser()` sem argumento procura uma sessão
    // carregada no cliente, e este cliente não tem nenhuma — só o cabeçalho.
    const { data, error } = await comoUsuario(accessToken).auth.getUser(accessToken);
    if (error || !data?.user?.id) return null;
    return { id: data.user.id, email: (data.user.email ?? '').toLowerCase() };
  },

  /**
   * PROVA a senha atual e só então troca. Duas decisões aqui vieram de erros
   * observados no ambiente real, não de preferência:
   *
   * 1) A PROVA É UMA AUTENTICAÇÃO, feita aqui. A versão anterior mandava
   *    `current_password` no update e confiava que o provedor conferiria. Este
   *    projeto NÃO exige reautenticação no update: uma troca com senha atual
   *    ERRADA foi aceita com 200. Ou seja, a garantia dependia de um botão de
   *    configuração que ninguém no código controla — e que estava desligado.
   *    Tentar autenticar com a senha informada não depende de configuração
   *    alguma: ou a senha vale, ou não vale.
   *
   * 2) A TROCA VAI PELO ENDPOINT, não pelo SDK. `auth.updateUser` exige sessão
   *    carregada no cliente; com apenas o cabeçalho `Authorization` ele falha
   *    antes de sair da função, e a falha chegava classificada como erro
   *    genérico do provedor. Na prática, a troca NUNCA funcionava.
   */
  async updateOwnPassword(accessToken, email, currentPassword, newPassword) {
    const prova = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ email, password: currentPassword }),
    });
    // Corpo descartado: ele traz tokens, e nada aqui precisa deles.
    if (!prova.ok) return { ok: false, invalidCurrent: true };

    const troca = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ password: newPassword }),
    });
    return troca.ok ? { ok: true } : { ok: false, invalidCurrent: false };
  },
};

const dbPort: DbPort = {
  async isChangeRequired(accessToken) {
    const { data, error } = await comoUsuario(accessToken).rpc('password_change_status');
    if (error) return false;
    return Boolean((data as { required?: boolean } | null)?.required);
  },
  async completeForUser(userId) {
    // `service_role`: `authenticated` não tem EXECUTE nesta RPC, justamente
    // para que ninguém encerre o próprio gate sem passar por aqui.
    const { error } = await servidor.rpc('service_complete_initial_password_change', {
      p_user_id: userId,
    });
    return { ok: !error };
  },
};

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');

  if (isPreflight(req.method)) {
    const { status, headers } = preflightResponse(origin);
    return new Response(null, { status, headers });
  }
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
    // O corpo carrega SOMENTE as duas senhas. Nenhum identificador é lido daqui:
    // e-mail e uuid vêm do token validado.
    const body = await req.json().catch(() => ({}));

    const result = await handleInitialPasswordChange(
      {
        accessToken,
        currentPassword: body?.currentPassword,
        newPassword: body?.newPassword,
      },
      { auth: authPort, db: dbPort, hasServiceRole: SERVICE_ROLE_KEY !== '' },
    );
    return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders(origin) });
  } catch (e) {
    const status = e instanceof ChangeError ? e.status : 500;
    // Só a mensagem controlada sai. O corpo NUNCA é registrado nem devolvido —
    // ele contém as duas senhas.
    const message = e instanceof ChangeError ? e.message : 'Falha interna.';
    const code = e instanceof ChangeError ? e.code : 'internal';
    return new Response(JSON.stringify({ error: message, code }), {
      status, headers: jsonHeaders(origin),
    });
  }
});
