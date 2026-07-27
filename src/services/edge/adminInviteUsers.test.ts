/**
 * Edge Function `admin-invite-users` — núcleo exercitado por MOCK.
 *
 * Prova autorização, idempotência e recuperação segura. NÃO prova o GoTrue real:
 * a Auth Admin API é injetada. Dados 100% fictícios (§23).
 */
import { describe, it, expect } from 'vitest';
import {
  AuthAdminPort,
  CallerPort,
  HandlerError,
  HandlerDeps,
  handleInviteUsers,
  resolveRedirect,
} from '../../../supabase/functions/admin-invite-users/handler';

const DEFAULT_REDIRECT = 'https://staging.sintetico.test/auth/callback';
const DEEP_LINK = 'aaceexcelencia://auth/callback';

const ADMIN_TOKEN = 'token-admin-fic';
const GC_TOKEN = 'token-gc-fic';

interface FakeOptions {
  existentes?: Record<string, string>;
  falhaAoConvidar?: Record<string, string>;
  lancaAoConvidar?: string[];
  lancaAoConsultar?: string[];
  hasServiceRole?: boolean;
  callers?: Record<string, { id: string; role: string | null }>;
  defaultRedirect?: string;
  allowlist?: string[];
}

function deps(options: FakeOptions = {}): HandlerDeps & { convites: string[]; destinos: string[] } {
  const convites: string[] = [];
  const destinos: string[] = [];
  const existentes = { ...(options.existentes ?? {}) };

  const auth: AuthAdminPort = {
    async findUserByEmail(email) {
      if (options.lancaAoConsultar?.includes(email)) throw new Error('lookup falhou');
      return existentes[email] ? { id: existentes[email] } : null;
    },
    async inviteUserByEmail(email, redirectTo) {
      destinos.push(redirectTo);
      if (options.lancaAoConvidar?.includes(email)) throw new Error('boom');
      const erro = options.falhaAoConvidar?.[email];
      if (erro) return { error: erro };
      convites.push(email);
      const id = `auth-${email}`;
      existentes[email] = id; // convite cria a identidade: reexecução vira no-op
      return { id };
    },
  };

  const caller: CallerPort = {
    async resolveCaller(token) {
      const table = options.callers ?? {
        [ADMIN_TOKEN]: { id: 'u-admin', role: 'admin' },
        [GC_TOKEN]: { id: 'u-gc', role: 'channel_manager' },
      };
      return table[token] ?? null;
    },
  };

  return {
    auth,
    caller,
    hasServiceRole: options.hasServiceRole ?? true,
    redirect: {
      defaultUrl: options.defaultRedirect ?? DEFAULT_REDIRECT,
      allowlist: options.allowlist ?? [DEEP_LINK],
    },
    convites,
    destinos,
  };
}

const call = (emails: unknown, token: string | null, d: HandlerDeps, redirectTo?: unknown) =>
  handleInviteUsers({ accessToken: token, emails, redirectTo }, d);

describe('admin-invite-users', () => {
  it('1 — convida usuário novo e devolve o authUserId', async () => {
    const d = deps();
    const res = await call(['novo@fic.example'], ADMIN_TOKEN, d);

    expect(res.ok).toBe(true);
    expect(res.counters).toEqual({ total: 1, invited: 1, alreadyExisting: 0, failed: 0 });
    expect(res.rows[0]).toEqual({
      email: 'novo@fic.example', state: 'invited', authUserId: 'auth-novo@fic.example',
    });
    expect(d.convites).toEqual(['novo@fic.example']);
  });

  it('2 — usuário Auth já existente é reaproveitado, sem novo convite', async () => {
    const d = deps({ existentes: { 'ja@fic.example': 'auth-ja' } });
    const res = await call(['ja@fic.example'], ADMIN_TOKEN, d);

    expect(res.ok).toBe(true);
    expect(res.rows[0]).toEqual({ email: 'ja@fic.example', state: 'already_exists', authUserId: 'auth-ja' });
    expect(d.convites).toEqual([]); // nada foi reenviado
  });

  it('3 — solicitante sem papel de Administrador é recusado com 403', async () => {
    const d = deps();
    await expect(call(['x@fic.example'], GC_TOKEN, d)).rejects.toMatchObject({
      status: 403, message: expect.stringContaining('Apenas Administrador'),
    });
    expect(d.convites).toEqual([]);
  });

  it('4 — token inválido ou ausente é recusado com 401', async () => {
    const d = deps();
    await expect(call(['x@fic.example'], 'token-invalido', d))
      .rejects.toMatchObject({ status: 401 });
    await expect(call(['x@fic.example'], null, d))
      .rejects.toMatchObject({ status: 401, message: expect.stringContaining('Autenticação obrigatória') });
    expect(d.convites).toEqual([]);
  });

  it('5 — falha da API Auth vira linha failed, sem derrubar o lote', async () => {
    const d = deps({ falhaAoConvidar: { 'ruim@fic.example': 'rate limit exceeded' } });
    const res = await call(['bom@fic.example', 'ruim@fic.example'], ADMIN_TOKEN, d);

    expect(res.ok).toBe(false);
    expect(res.counters).toEqual({ total: 2, invited: 1, alreadyExisting: 0, failed: 1 });
    expect(res.rows[1]).toMatchObject({ state: 'failed', authUserId: null, message: 'rate limit exceeded' });
    expect(res.rows[0].state).toBe('invited'); // o e-mail bom entrou
  });

  it('5b — exceção do provedor não vaza detalhe interno', async () => {
    const d = deps({ lancaAoConvidar: ['explode@fic.example'] });
    const res = await call(['explode@fic.example'], ADMIN_TOKEN, d);

    expect(res.rows[0].state).toBe('failed');
    expect(res.rows[0].message).toBe('Falha ao criar a identidade.');
    expect(JSON.stringify(res)).not.toContain('boom');
  });

  it('6 — reexecutar o mesmo lote é idempotente: nenhum convite repetido', async () => {
    const d = deps();
    const primeira = await call(['a@fic.example', 'b@fic.example'], ADMIN_TOKEN, d);
    const segunda = await call(['a@fic.example', 'b@fic.example'], ADMIN_TOKEN, d);

    expect(primeira.counters).toMatchObject({ invited: 2, alreadyExisting: 0 });
    expect(segunda.counters).toMatchObject({ invited: 0, alreadyExisting: 2, failed: 0 });
    expect(segunda.ok).toBe(true);
    expect(d.convites).toEqual(['a@fic.example', 'b@fic.example']); // só a 1ª rodada
    // O id devolvido é ESTÁVEL entre execuções — o commit SQL pode confiar nele.
    expect(segunda.rows.map((r) => r.authUserId)).toEqual(primeira.rows.map((r) => r.authUserId));
  });

  it('7 — cada authUserId volta associado ao seu próprio e-mail', async () => {
    const d = deps({ existentes: { 'b@fic.example': 'auth-b-preexistente' } });
    const res = await call(['a@fic.example', 'b@fic.example', 'c@fic.example'], ADMIN_TOKEN, d);

    expect(res.rows.map((r) => [r.email, r.authUserId])).toEqual([
      ['a@fic.example', 'auth-a@fic.example'],
      ['b@fic.example', 'auth-b-preexistente'],
      ['c@fic.example', 'auth-c@fic.example'],
    ]);
  });

  it('8 — sem service role no ambiente a função recusa antes de tudo', async () => {
    const d = deps({ hasServiceRole: false });
    await expect(call(['x@fic.example'], ADMIN_TOKEN, d)).rejects.toMatchObject({
      status: 500, message: expect.stringContaining('service role ausente'),
    });
    expect(d.convites).toEqual([]);
  });

  it('9 — lote parcialmente processado é retomável: a 2ª rodada só completa o que faltou', async () => {
    const falha = deps({ lancaAoConvidar: ['c@fic.example'] });
    const primeira = await call(['a@fic.example', 'b@fic.example', 'c@fic.example'], ADMIN_TOKEN, falha);
    expect(primeira.ok).toBe(false);
    expect(primeira.counters).toMatchObject({ invited: 2, failed: 1 });

    // Reexecução no mesmo estado, agora com o provedor saudável.
    const retoma = deps({ existentes: { 'a@fic.example': 'auth-a@fic.example', 'b@fic.example': 'auth-b@fic.example' } });
    const segunda = await call(['a@fic.example', 'b@fic.example', 'c@fic.example'], ADMIN_TOKEN, retoma);

    expect(segunda.ok).toBe(true);
    expect(segunda.counters).toMatchObject({ alreadyExisting: 2, invited: 1, failed: 0 });
    expect(retoma.convites).toEqual(['c@fic.example']); // só o que faltava
  });

  it('10 — a resposta não carrega token, service role nem dado sensível', async () => {
    const d = deps({ existentes: { 'ja@fic.example': 'auth-ja' } });
    const res = await call(['ja@fic.example', 'novo@fic.example'], ADMIN_TOKEN, d);
    const serial = JSON.stringify(res);

    expect(serial).not.toContain(ADMIN_TOKEN);
    expect(serial).not.toContain('service');
    expect(serial).not.toContain('Bearer');
    expect(Object.keys(res)).toEqual(['ok', 'counters', 'rows']);
    for (const row of res.rows) {
      expect(Object.keys(row).sort()).toEqual(['authUserId', 'email', 'state']);
    }
  });

  it('valida o contrato de entrada antes de chamar o Auth', async () => {
    const d = deps();
    await expect(call('nao-e-array', ADMIN_TOKEN, d)).rejects.toBeInstanceOf(HandlerError);
    await expect(call([], ADMIN_TOKEN, d)).rejects.toMatchObject({ status: 400 });
    await expect(call(['sem-arroba'], ADMIN_TOKEN, d)).rejects.toMatchObject({ status: 400 });
    await expect(call([42], ADMIN_TOKEN, d)).rejects.toMatchObject({ status: 400 });
    expect(d.convites).toEqual([]);
  });

  it('e-mail repetido no lote é colapsado, não convidado duas vezes', async () => {
    const d = deps();
    const res = await call(['A@Fic.Example', 'a@fic.example'], ADMIN_TOKEN, d);

    expect(res.counters.total).toBe(1);
    expect(d.convites).toEqual(['a@fic.example']);
  });
});

describe('redirectTo — destino decidido pelo servidor', () => {
  it('1 — sem pedido do cliente, usa o padrão configurado no servidor', async () => {
    const d = deps();
    await call(['novo@fic.example'], ADMIN_TOKEN, d);
    expect(d.destinos).toEqual([DEFAULT_REDIRECT]);
  });

  it('2 — pedido que consta na allowlist é aceito (deep link nativo)', async () => {
    const d = deps();
    await call(['novo@fic.example'], ADMIN_TOKEN, d, DEEP_LINK);
    expect(d.destinos).toEqual([DEEP_LINK]);
  });

  it('3 — redirect malicioso é recusado ANTES de qualquer convite', async () => {
    const d = deps();
    await expect(call(['novo@fic.example'], ADMIN_TOKEN, d, 'https://atacante.example/roubar'))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('não autorizado') });
    expect(d.convites).toEqual([]);
    expect(d.destinos).toEqual([]);
  });

  it('3b — prefixo parecido NÃO passa (sem startsWith)', async () => {
    const d = deps();
    for (const hostil of [
      'https://staging.sintetico.test.atacante.example/auth/callback',
      'https://staging.sintetico.test@atacante.example/auth/callback',
      'http://staging.sintetico.test/auth/callback/../../roubar',
    ]) {
      await expect(call(['novo@fic.example'], ADMIN_TOKEN, d, hostil))
        .rejects.toMatchObject({ status: 400 });
    }
    expect(d.convites).toEqual([]);
  });

  it('3c — a recusa não ecoa a URL enviada pelo cliente', async () => {
    const d = deps();
    const hostil = 'https://atacante.example/marcador-unico-xyz';
    await call(['novo@fic.example'], ADMIN_TOKEN, d, hostil).catch((e) => {
      expect(String(e.message)).not.toContain('marcador-unico-xyz');
    });
  });

  it('4 — ausência da variável no servidor bloqueia a função inteira', async () => {
    const d = deps({ defaultRedirect: '' });
    await expect(call(['novo@fic.example'], ADMIN_TOKEN, d)).rejects.toMatchObject({
      status: 500, message: expect.stringContaining('destino do convite ausente'),
    });
    expect(d.convites).toEqual([]);
  });

  it('5 — query/fragmento e barra final não mudam a decisão', () => {
    const policy = { defaultUrl: DEFAULT_REDIRECT, allowlist: [] as string[] };
    expect(resolveRedirect(`${DEFAULT_REDIRECT}/`, policy)).toBe(DEFAULT_REDIRECT);
    expect(resolveRedirect(`${DEFAULT_REDIRECT}?x=1`, policy)).toBe(DEFAULT_REDIRECT);
    expect(resolveRedirect(`${DEFAULT_REDIRECT}#frag`, policy)).toBe(DEFAULT_REDIRECT);
  });

  it('6 — tipo inválido é recusado', async () => {
    const d = deps();
    await expect(call(['novo@fic.example'], ADMIN_TOKEN, d, 42))
      .rejects.toMatchObject({ status: 400 });
  });

  it('7 — não-administrador é barrado ANTES da checagem de redirect', async () => {
    const d = deps();
    await expect(call(['x@fic.example'], GC_TOKEN, d, 'https://atacante.example'))
      .rejects.toMatchObject({ status: 403 });
  });
});
