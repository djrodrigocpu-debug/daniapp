/**
 * Edge Function `admin-provision-users` — núcleo exercitado por MOCK.
 *
 * Prova autorização, provisionamento sem e-mail, idempotência e sigilo da senha
 * inicial. NÃO prova o GoTrue real: a Auth Admin API e as RPCs são injetadas.
 * Dados 100% fictícios (§23); nenhuma senha real é usada.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AuthAdminPort,
  CallerPort,
  DbPort,
  HandlerDeps,
  HandlerError,
  ProvisionRequestRow,
  handleProvisionUsers,
} from '../../../supabase/functions/admin-provision-users/handler';

const ADMIN_TOKEN = 'token-admin-fic';
const GC_TOKEN = 'token-gc-fic';
const SENHA = 'Aacex2026Prov';

function linha(over: Partial<ProvisionRequestRow> & { email: string }): ProvisionRequestRow {
  return {
    index: 1,
    name: 'Pessoa Sintetica',
    role: 'channel_manager',
    region: 'PR CAPITAL',
    initialPassword: SENHA,
    ...over,
  };
}

interface FakeOptions {
  existentes?: Record<string, string>;
  pendingAuth?: string[];
  falhaAoCriar?: Record<string, string>;
  lancaAoCriar?: string[];
  lancaAoIndexar?: boolean;
  erroSimulacao?: string;
  erroCommit?: string;
  erroAtivacao?: string;
  promoted?: number;
  hasServiceRole?: boolean;
  callers?: Record<string, { id: string; role: string | null }>;
}

function deps(options: FakeOptions = {}) {
  const criados: string[] = [];
  const senhasRecebidas: string[] = [];
  const chamadasImport: Array<{ rows: unknown[]; commit: boolean }> = [];
  const ativacoes: number[] = [];
  const existentes = { ...(options.existentes ?? {}) };

  const auth: AuthAdminPort = {
    findExistingIdentities: vi.fn(async (emails: string[]) => {
      if (options.lancaAoIndexar) throw new Error('paginacao falhou');
      const m = new Map<string, string>();
      for (const e of emails) if (existentes[e]) m.set(e, existentes[e]);
      return m;
    }),
    createUser: vi.fn(async (email: string, password: string) => {
      senhasRecebidas.push(password);
      if (options.lancaAoCriar?.includes(email)) throw new Error('boom-provedor');
      const erro = options.falhaAoCriar?.[email];
      if (erro) return { error: erro };
      criados.push(email);
      const id = `auth-${email}`;
      existentes[email] = id;
      return { id };
    }),
  };

  const db: DbPort = {
    importUsers: vi.fn(async (rows: unknown[], commit: boolean) => {
      chamadasImport.push({ rows, commit });
      if (!commit && options.erroSimulacao) return { error: options.erroSimulacao };
      if (commit && options.erroCommit) return { error: options.erroCommit };
      return {
        data: {
          mode: commit ? 'commit' : 'simulate',
          applied: commit,
          pendingAuth: commit ? [] : (options.pendingAuth ?? []),
          rows: [],
        },
      };
    }),
    activateConfirmedUsers: vi.fn(async () => {
      if (options.erroAtivacao) return { error: options.erroAtivacao };
      ativacoes.push(1);
      return { data: { promoted: options.promoted ?? 0, active: 0, stillInvited: 0 } };
    }),
  };

  const caller: CallerPort = {
    async resolveCaller(token) {
      const tabela = options.callers ?? {
        [ADMIN_TOKEN]: { id: 'u-admin', role: 'admin' },
        [GC_TOKEN]: { id: 'u-gc', role: 'channel_manager' },
      };
      return tabela[token] ?? null;
    },
  };

  return {
    auth,
    db,
    caller,
    hasServiceRole: options.hasServiceRole ?? true,
    criados,
    senhasRecebidas,
    chamadasImport,
    ativacoes,
  } satisfies HandlerDeps & Record<string, unknown>;
}

const call = (rows: unknown, token: string | null, d: HandlerDeps) =>
  handleProvisionUsers({ accessToken: token, rows }, d);

describe('admin-provision-users — autorização', () => {
  it('token ausente ou inválido é recusado com 401', async () => {
    const d = deps();
    await expect(call([linha({ email: 'a@sint.test' })], null, d)).rejects.toMatchObject({ status: 401 });
    await expect(call([linha({ email: 'a@sint.test' })], 'invalido', d)).rejects.toMatchObject({ status: 401 });
    expect(d.criados).toEqual([]);
  });

  it('solicitante sem papel de Administrador é recusado com 403', async () => {
    const d = deps();
    await expect(call([linha({ email: 'a@sint.test' })], GC_TOKEN, d)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('Apenas Administrador'),
    });
    expect(d.criados).toEqual([]);
  });

  it('sem service role no ambiente recusa antes de tudo', async () => {
    const d = deps({ hasServiceRole: false });
    await expect(call([linha({ email: 'a@sint.test' })], ADMIN_TOKEN, d)).rejects.toMatchObject({ status: 500 });
    expect(d.chamadasImport).toEqual([]);
  });

  it('perfil sem conta de acesso é recusado (parceiro não é usuário)', async () => {
    const d = deps();
    await expect(
      call([linha({ email: 'parceiro@sint.test', role: 'partner' })], ADMIN_TOKEN, d),
    ).rejects.toBeInstanceOf(HandlerError);
    expect(d.criados).toEqual([]);
    expect(d.chamadasImport).toEqual([]);
  });
});

describe('admin-provision-users — criação sem e-mail', () => {
  it('cria identidade com e-mail e senha, e ativa os perfis', async () => {
    const d = deps({ pendingAuth: ['nova@sint.test'], promoted: 1 });
    const res = await call([linha({ email: 'nova@sint.test' })], ADMIN_TOKEN, d);

    expect(res.ok).toBe(true);
    expect(res.counters).toEqual({ total: 1, created: 1, alreadyExisting: 0, failed: 0, activated: 1 });
    expect(d.auth.createUser).toHaveBeenCalledWith('nova@sint.test', SENHA);
    expect(d.criados).toEqual(['nova@sint.test']);
    expect(d.ativacoes).toHaveLength(1);
  });

  it('a porta de Auth NÃO expõe convite — inviteUserByEmail não existe', () => {
    const d = deps();
    expect((d.auth as unknown as Record<string, unknown>).inviteUserByEmail).toBeUndefined();
    expect(Object.keys(d.auth).sort()).toEqual(['createUser', 'findExistingIdentities']);
  });

  it('simula antes de criar: a simulação roda com commit=false e vem primeiro', async () => {
    const d = deps({ pendingAuth: ['nova@sint.test'] });
    await call([linha({ email: 'nova@sint.test' })], ADMIN_TOKEN, d);

    expect(d.chamadasImport[0].commit).toBe(false);
    expect(d.chamadasImport[1].commit).toBe(true);
    expect(d.chamadasImport).toHaveLength(2);
  });

  it('simulação recusada não cria identidade alguma', async () => {
    const d = deps({ erroSimulacao: 'coordenacao inexistente' });
    await expect(call([linha({ email: 'nova@sint.test' })], ADMIN_TOKEN, d)).rejects.toMatchObject({
      status: 400,
    });
    expect(d.criados).toEqual([]);
    expect(d.auth.createUser).not.toHaveBeenCalled();
  });

  it('usuário novo sem senha inicial vira failed e impede o commit', async () => {
    const d = deps({ pendingAuth: ['nova@sint.test'] });
    const res = await call(
      [{ index: 1, name: 'X', email: 'nova@sint.test', role: 'admin', region: '' }],
      ADMIN_TOKEN,
      d,
    );

    expect(res.ok).toBe(false);
    expect(res.rows[0]).toMatchObject({ state: 'failed', authUserId: null });
    // Só a simulação rodou; nada foi comitado.
    expect(d.chamadasImport.every((c) => c.commit === false)).toBe(true);
    expect(d.ativacoes).toHaveLength(0);
  });
});

describe('admin-provision-users — idempotência', () => {
  it('identidade existente é reaproveitada, sem recriar e sem trocar a senha', async () => {
    const d = deps({ existentes: { 'ja@sint.test': 'auth-ja' }, pendingAuth: ['ja@sint.test'] });
    const res = await call([linha({ email: 'ja@sint.test' })], ADMIN_TOKEN, d);

    expect(res.ok).toBe(true);
    expect(res.rows[0]).toEqual({ email: 'ja@sint.test', state: 'already_exists', authUserId: 'auth-ja' });
    expect(d.auth.createUser).not.toHaveBeenCalled();
    expect(d.senhasRecebidas).toEqual([]); // a senha da planilha foi ignorada
  });

  it('reexecutar o mesmo lote não duplica identidade', async () => {
    const primeira = deps({ pendingAuth: ['a@sint.test', 'b@sint.test'] });
    const r1 = await call(
      [linha({ email: 'a@sint.test' }), linha({ email: 'b@sint.test', index: 2 })],
      ADMIN_TOKEN,
      primeira,
    );
    expect(r1.counters).toMatchObject({ created: 2, alreadyExisting: 0 });

    const segunda = deps({
      existentes: { 'a@sint.test': 'auth-a@sint.test', 'b@sint.test': 'auth-b@sint.test' },
      pendingAuth: [],
    });
    const r2 = await call(
      [linha({ email: 'a@sint.test' }), linha({ email: 'b@sint.test', index: 2 })],
      ADMIN_TOKEN,
      segunda,
    );

    expect(r2.ok).toBe(true);
    expect(r2.counters).toMatchObject({ created: 0, alreadyExisting: 2, failed: 0 });
    expect(segunda.criados).toEqual([]);
    expect(r2.rows.map((r) => r.authUserId)).toEqual(['auth-a@sint.test', 'auth-b@sint.test']);
  });

  it('o índice do Auth é consultado uma única vez por requisição', async () => {
    const d = deps({ pendingAuth: [] });
    const lote = Array.from({ length: 30 }, (_, i) => linha({ email: `u${i}@sint.test`, index: i + 1 }));
    await call(lote, ADMIN_TOKEN, d);

    expect(d.auth.findExistingIdentities).toHaveBeenCalledTimes(1);
  });

  it('falha ao paginar o Auth aborta antes de criar qualquer identidade', async () => {
    const d = deps({ lancaAoIndexar: true, pendingAuth: ['nova@sint.test'] });
    await expect(call([linha({ email: 'nova@sint.test' })], ADMIN_TOKEN, d)).rejects.toThrow();

    expect(d.auth.createUser).not.toHaveBeenCalled();
    expect(d.criados).toEqual([]);
    expect(d.chamadasImport.every((c) => c.commit === false)).toBe(true);
  });

  it('falha do provedor em uma linha impede o commit de TODAS', async () => {
    const d = deps({
      pendingAuth: ['boa@sint.test', 'ruim@sint.test'],
      falhaAoCriar: { 'ruim@sint.test': 'rate limit' },
    });
    const res = await call(
      [linha({ email: 'boa@sint.test' }), linha({ email: 'ruim@sint.test', index: 2 })],
      ADMIN_TOKEN,
      d,
    );

    expect(res.ok).toBe(false);
    expect(res.counters).toMatchObject({ created: 1, failed: 1, activated: 0 });
    expect(d.chamadasImport.every((c) => c.commit === false)).toBe(true);
    expect(d.ativacoes).toHaveLength(0);
  });

  it('exceção do provedor não vaza detalhe interno', async () => {
    const d = deps({ pendingAuth: ['x@sint.test'], lancaAoCriar: ['x@sint.test'] });
    const res = await call([linha({ email: 'x@sint.test' })], ADMIN_TOKEN, d);

    expect(res.rows[0].message).toBe('Falha ao criar a identidade.');
    expect(JSON.stringify(res)).not.toContain('boom-provedor');
  });
});

describe('admin-provision-users — sigilo da senha inicial', () => {
  it('a senha NUNCA atravessa a fronteira do Postgres', async () => {
    const d = deps({ pendingAuth: ['nova@sint.test'] });
    await call([linha({ email: 'nova@sint.test' })], ADMIN_TOKEN, d);

    for (const chamada of d.chamadasImport) {
      const serial = JSON.stringify(chamada.rows);
      expect(serial).not.toContain(SENHA);
      expect(serial).not.toContain('initialPassword');
    }
  });

  it('`active` ATRAVESSA até a RPC — é a senha que fica para trás', async () => {
    const d = deps({ pendingAuth: ['nova@sint.test'] });
    await call([linha({ email: 'nova@sint.test', active: false })], ADMIN_TOKEN, d);

    for (const chamada of d.chamadasImport) {
      const enviado = chamada.rows as Array<Record<string, unknown>>;
      expect(enviado[0]).toMatchObject({ email: 'nova@sint.test', active: false });
      expect(enviado[0]).not.toHaveProperty('initialPassword');
    }
  });

  it('`active` ausente na linha não inventa valor: quem decide o default é a RPC', async () => {
    const d = deps({ pendingAuth: ['nova@sint.test'] });
    const { active: _fora, ...semActive } = linha({ email: 'nova@sint.test' });
    await call([semActive], ADMIN_TOKEN, d);

    const enviado = d.chamadasImport[0].rows as Array<Record<string, unknown>>;
    expect(enviado[0]).not.toHaveProperty('active');
  });

  it('a senha NUNCA aparece na resposta', async () => {
    const d = deps({ pendingAuth: ['nova@sint.test'] });
    const res = await call([linha({ email: 'nova@sint.test' })], ADMIN_TOKEN, d);

    const serial = JSON.stringify(res);
    expect(serial).not.toContain(SENHA);
    expect(serial).not.toContain('initialPassword');
    for (const row of res.rows) {
      expect(Object.keys(row).sort()).toEqual(
        row.message ? ['authUserId', 'email', 'message', 'state'] : ['authUserId', 'email', 'state'],
      );
    }
  });

  it('nenhuma mensagem de erro de contrato ecoa a senha', async () => {
    const d = deps();
    const curta = 'Ab1';
    const erro = await call([linha({ email: 'a@sint.test', initialPassword: curta })], ADMIN_TOKEN, d)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(HandlerError);
    expect((erro as Error).message).not.toContain(curta);
  });

  it('recusa senha inicial fraca ou derivada do e-mail', async () => {
    const d = deps();
    const fracas = ['curta1', '1234567890', 'SomenteLetras', 'a@sint.test'];
    for (const senha of fracas) {
      await expect(
        call([linha({ email: 'a@sint.test', initialPassword: senha })], ADMIN_TOKEN, d),
      ).rejects.toBeInstanceOf(HandlerError);
    }
    expect(d.criados).toEqual([]);
  });
});

describe('admin-provision-users — contrato do lote', () => {
  it('recusa corpo inválido, lote vazio e e-mail repetido', async () => {
    const d = deps();
    await expect(call('nao-e-array', ADMIN_TOKEN, d)).rejects.toMatchObject({ status: 400 });
    await expect(call([], ADMIN_TOKEN, d)).rejects.toMatchObject({ status: 400 });
    await expect(
      call([linha({ email: 'a@sint.test' }), linha({ email: 'A@Sint.Test', index: 2 })], ADMIN_TOKEN, d),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('repetido') });
  });

  it('recusa lote acima do limite', async () => {
    const d = deps();
    const grande = Array.from({ length: 201 }, (_, i) => linha({ email: `u${i}@sint.test`, index: i + 1 }));
    await expect(call(grande, ADMIN_TOKEN, d)).rejects.toMatchObject({ status: 400 });
  });
});
