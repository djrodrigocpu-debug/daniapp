/**
 * Adapters Supabase de administração — exercitados por MOCK do SupabaseClient.
 *
 * Estes testes NÃO provam que o backend real funciona: provam apenas o contrato
 * que o cliente emite (quais RPCs/Functions, com quais argumentos) e como ele
 * traduz as respostas. O comportamento do SQL em si é provado contra Postgres
 * real em src/db/admin_import_users.integration.test.ts.
 *
 * Para usuários, o foco é a ORQUESTRAÇÃO das três fases do onboarding
 * (simular → convidar → confirmar) e a garantia de que um convite incompleto
 * jamais chega ao commit. Dados 100% sintéticos (§23).
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAdminPartnersRepository } from './PartnersRepository';
import { SupabaseAdminUsersRepository } from './AdminRepository';
import { DEFAULT_ORGANIZATION_NAME, DEFAULT_REGION_NAME, ImportRow } from '../../domain/partners/types';
import { UserImportRow } from '../../domain/users/types';
import { User } from '../../types';

interface RpcCall { name: string; params: Record<string, unknown> }

interface FakeOptions {
  tables?: Record<string, { data?: unknown; error?: unknown }>;
  rpc?: Record<string, (params: Record<string, unknown>) => { data?: unknown; error?: unknown }>;
  functions?: Record<string, (body: Record<string, unknown>) => { data?: unknown; error?: unknown }>;
}

/** Thenable que também aceita .order(), como o query builder do supabase-js. */
function queryResult(result: { data?: unknown; error?: unknown }) {
  const thenable = {
    order: () => thenable,
    then: (resolve: (value: unknown) => void) => resolve({ data: result.data ?? null, error: result.error ?? null }),
  };
  return thenable;
}

function fakeClient(options: FakeOptions) {
  const rpcCalls: RpcCall[] = [];
  const tableReads: string[] = [];
  const fnCalls: Array<{ name: string; body: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      tableReads.push(table);
      return { select: () => queryResult(options.tables?.[table] ?? { data: [] }) };
    },
    rpc(name: string, params: Record<string, unknown>) {
      rpcCalls.push({ name, params });
      const handler = options.rpc?.[name];
      return queryResult(handler ? handler(params) : { data: null, error: { message: `RPC ${name} não mockada` } });
    },
    functions: {
      async invoke(name: string, opts: { body: Record<string, unknown> }) {
        fnCalls.push({ name, body: opts.body });
        const handler = options.functions?.[name];
        const r = handler ? handler(opts.body) : { error: { message: `Function ${name} não mockada` } };
        return { data: r.data ?? null, error: r.error ?? null };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, rpcCalls, tableReads, fnCalls };
}

const COORDINATOR: User = {
  id: 'U-coord', name: 'Coord Sintetica', email: 'coord@sint.example',
  role: 'coordinator', region: 'COORD NORTE', avatarInitials: 'CS', active: true,
};

/** Linha como o parser entrega a planilha do canal: sem org/região/coordenador. */
const bareRow = (over: Partial<ImportRow> = {}): ImportRow => ({
  index: 1, unitName: 'RPS', coordinationName: 'COORD NORTE', partnerName: 'ALFA SINT LTDA',
  officeName: 'PS - ALFA - 0001', city: 'Cidade N', state: 'PR', managerEmail: 'gc@sint.example',
  ...over,
});

const emptyReport = { mode: 'simulate', counters: {}, toCreate: {}, rows: [] };

describe('SupabaseAdminPartnersRepository.importPartners', () => {
  it('preenche Organização e Região com os padrões documentados antes da RPC', async () => {
    const { client, rpcCalls } = fakeClient({
      tables: { ui_users: { data: [COORDINATOR] } },
      rpc: { admin_import_partners: () => ({ data: emptyReport }) },
    });
    await new SupabaseAdminPartnersRepository(client).importPartners([bareRow()], false);

    const sent = (rpcCalls[0].params.p_rows as ImportRow[])[0];
    expect(rpcCalls[0].name).toBe('admin_import_partners');
    expect(sent.organizationName).toBe(DEFAULT_ORGANIZATION_NAME);
    expect(sent.regionName).toBe(DEFAULT_REGION_NAME);
    expect(rpcCalls[0].params.p_commit).toBe(false);
  });

  it('resolve o e-mail do coordenador pela coordenação consultando ui_users', async () => {
    const { client, rpcCalls, tableReads } = fakeClient({
      tables: { ui_users: { data: [COORDINATOR] } },
      rpc: { admin_import_partners: () => ({ data: emptyReport }) },
    });
    await new SupabaseAdminPartnersRepository(client).importPartners([bareRow()], true);

    expect(tableReads).toContain('ui_users');
    expect((rpcCalls[0].params.p_rows as ImportRow[])[0].coordinatorEmail).toBe('coord@sint.example');
    expect(rpcCalls[0].params.p_commit).toBe(true);
  });

  it('não consulta ui_users quando a planilha já traz o e-mail do coordenador', async () => {
    const { client, tableReads } = fakeClient({
      rpc: { admin_import_partners: () => ({ data: emptyReport }) },
    });
    await new SupabaseAdminPartnersRepository(client)
      .importPartners([bareRow({ coordinatorEmail: 'outro@sint.example' })], false);

    expect(tableReads).not.toContain('ui_users');
  });

  it('coordenação sem coordenador ativo vai SEM e-mail — o servidor recusa a linha, o cliente não chuta', async () => {
    const { client, rpcCalls } = fakeClient({
      tables: { ui_users: { data: [COORDINATOR] } },
      rpc: { admin_import_partners: () => ({ data: emptyReport }) },
    });
    await new SupabaseAdminPartnersRepository(client)
      .importPartners([bareRow({ coordinationName: 'COORD SEM DONO' })], false);

    expect((rpcCalls[0].params.p_rows as ImportRow[])[0].coordinatorEmail).toBeUndefined();
  });

  it('ambiguidade (dois coordenadores na mesma área) também não escolhe nenhum', async () => {
    const gemeo: User = { ...COORDINATOR, id: 'U-coord2', email: 'coord2@sint.example' };
    const { client, rpcCalls } = fakeClient({
      tables: { ui_users: { data: [COORDINATOR, gemeo] } },
      rpc: { admin_import_partners: () => ({ data: emptyReport }) },
    });
    await new SupabaseAdminPartnersRepository(client).importPartners([bareRow()], false);

    expect((rpcCalls[0].params.p_rows as ImportRow[])[0].coordinatorEmail).toBeUndefined();
  });

  it('falha ao ler ui_users aborta ANTES de chamar a RPC', async () => {
    const { client, rpcCalls } = fakeClient({
      tables: { ui_users: { error: { message: 'permission denied' } } },
      rpc: { admin_import_partners: () => ({ data: emptyReport }) },
    });
    const res = await new SupabaseAdminPartnersRepository(client).importPartners([bareRow()], true);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/Falha ao carregar usuários/);
    expect(rpcCalls).toHaveLength(0);
  });

  it('propaga a mensagem de erro da RPC', async () => {
    const { client } = fakeClient({
      tables: { ui_users: { data: [COORDINATOR] } },
      rpc: { admin_import_partners: () => ({ error: { message: 'apenas administrador' } }) },
    });
    const res = await new SupabaseAdminPartnersRepository(client).importPartners([bareRow()], true);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe('apenas administrador');
  });
});

describe('SupabaseAdminPartnersRepository — leitura e CRUD', () => {
  it('listAll lê a view ui_admin_partners', async () => {
    const { client, tableReads } = fakeClient({ tables: { ui_admin_partners: { data: [{ id: 'O1' }] } } });
    const res = await new SupabaseAdminPartnersRepository(client).listAll();
    expect(tableReads).toEqual(['ui_admin_partners']);
    expect(res.ok && res.value).toHaveLength(1);
  });

  it('create separa os warnings do DTO devolvido pela RPC', async () => {
    const { client, rpcCalls } = fakeClient({
      rpc: { admin_create_operation: () => ({ data: { id: 'O1', officeName: 'X', warnings: ['sem GC'] } }) },
    });
    const res = await new SupabaseAdminPartnersRepository(client)
      .create({ partnerName: 'P', officeName: 'X', city: 'C', state: 'PR' });

    expect(rpcCalls[0].name).toBe('admin_create_operation');
    expect(res.ok && res.value.warnings).toEqual(['sem GC']);
    expect(res.ok && 'warnings' in res.value.partner).toBe(false);
  });
});

// ---------------------------------------------------------------------------

const USER_ROWS: UserImportRow[] = [
  { index: 1, name: 'Ana Sintetica', email: 'ana@sint.example', role: 'coordinator', region: 'COORD NORTE' },
  { index: 2, name: 'Bruno Sintetico', email: 'bruno@sint.example', role: 'channel_manager', region: 'COORD NORTE' },
];

/** Relatório como a RPC 0010 devolve. */
const rpcReport = (over: Record<string, unknown> = {}) => ({
  mode: 'simulate',
  applied: false,
  counters: { total: 2, inserted: 2, updated: 0, errors: 0, pendingAuth: 0 },
  pendingAuth: [],
  rows: [],
  ...over,
});

describe('SupabaseAdminUsersRepository.importUsers — provisionamento sem convite', () => {
  it('simulação chama só a RPC em modo simulate e não provisiona ninguém', async () => {
    const { client, rpcCalls, fnCalls } = fakeClient({
      rpc: { admin_import_users: () => ({ data: rpcReport({ pendingAuth: ['ana@sint.example'] }) }) },
    });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, false);

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('admin_import_users');
    expect(rpcCalls[0].params.p_commit).toBe(false);
    expect(fnCalls).toHaveLength(0);
    expect(res.ok && res.value.pendingAuth).toEqual(['ana@sint.example']);
  });

  it('confirmação delega o commit inteiro à Edge Function admin-provision-users', async () => {
    const { client, rpcCalls, fnCalls } = fakeClient({
      rpc: { admin_import_users: () => ({ data: rpcReport({ pendingAuth: ['ana@sint.example'] }) }) },
      functions: {
        'admin-provision-users': () => ({
          data: {
            ok: true,
            counters: { total: 2, created: 1, alreadyExisting: 1, failed: 0, activated: 1 },
            rows: [
              { email: 'ana@sint.example', state: 'created', authUserId: 'auth-ana' },
              { email: 'bruno@sint.example', state: 'already_exists', authUserId: 'auth-bruno' },
            ],
            report: rpcReport({ mode: 'commit', applied: true }),
          },
        }),
      },
    });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, true);

    // O convite NÃO existe mais no caminho: só a função de provisionamento.
    expect(fnCalls.map((c) => c.name)).toEqual(['admin-provision-users']);
    // As LINHAS completas vão para a função (é ela que precisa da senha inicial).
    expect((fnCalls[0].body.rows as UserImportRow[]).map((r) => r.email))
      .toEqual(['ana@sint.example', 'bruno@sint.example']);
    // O cliente emite apenas a simulação; o commit acontece dentro da função.
    expect(rpcCalls.map((c) => c.params.p_commit)).toEqual([false]);
    expect(res.ok && res.value.applied).toBe(true);
  });

  it('provisionamento incompleto ABORTA — nada é gravado', async () => {
    const { client, rpcCalls } = fakeClient({
      rpc: { admin_import_users: () => ({ data: rpcReport({ pendingAuth: ['ana@sint.example', 'bruno@sint.example'] }) }) },
      functions: {
        'admin-provision-users': () => ({
          data: {
            ok: false,
            counters: { total: 2, created: 1, alreadyExisting: 0, failed: 1, activated: 0 },
            rows: [
              { email: 'ana@sint.example', state: 'created', authUserId: 'auth-ana' },
              { email: 'bruno@sint.example', state: 'failed', authUserId: null, message: 'rate limit' },
            ],
            report: null,
          },
        }),
      },
    });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, true);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toMatch(/Provisionamento incompleto \(1 de 2\)/);
      expect(res.error.message).toMatch(/Nada foi gravado/);
      expect(res.error.message).toMatch(/bruno@sint\.example: rate limit/);
    }
    // Só a simulação rodou: NENHUM commit foi emitido pelo cliente.
    expect(rpcCalls.map((c) => c.params.p_commit)).toEqual([false]);
  });

  it('falha da Edge Function em si também impede o commit', async () => {
    const { client, rpcCalls } = fakeClient({
      rpc: { admin_import_users: () => ({ data: rpcReport({ pendingAuth: ['ana@sint.example'] }) }) },
      functions: { 'admin-provision-users': () => ({ error: { message: 'function not found' } }) },
    });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, true);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe('function not found');
    expect(rpcCalls.map((c) => c.params.p_commit)).toEqual([false]);
  });

  it('a senha inicial atravessa até a função, mas some do relatório devolvido', async () => {
    const SENHA = 'Aacex2026Prov';
    const comSenha: UserImportRow[] = USER_ROWS.map((r) => ({ ...r, initialPassword: SENHA }));
    const { client, fnCalls } = fakeClient({
      rpc: { admin_import_users: () => ({ data: rpcReport({ pendingAuth: ['ana@sint.example'] }) }) },
      functions: {
        'admin-provision-users': () => ({
          data: {
            ok: true,
            counters: { total: 2, created: 2, alreadyExisting: 0, failed: 0, activated: 2 },
            rows: [],
            report: rpcReport({ mode: 'commit', applied: true }),
          },
        }),
      },
    });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(comSenha, true);

    // Vai no corpo da requisição (é o único jeito de o servidor criar a conta)...
    expect(JSON.stringify(fnCalls[0].body)).toContain(SENHA);
    // ...e NÃO volta em nada que a tela vá exibir ou persistir.
    expect(JSON.stringify(res)).not.toContain(SENHA);
  });

  it('erro da RPC propaga a mensagem do servidor', async () => {
    const { client } = fakeClient({
      rpc: { admin_import_users: () => ({ error: { message: 'apenas administrador' } }) },
    });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, false);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe('apenas administrador');
  });

  it('lote acima do limite é rejeitado antes de qualquer chamada', async () => {
    const many: UserImportRow[] = Array.from({ length: 201 }, (_, i) => ({
      index: i + 1, name: 'P' + i, email: 'p' + i + '@sint.example', role: 'channel_manager', region: 'COORD NORTE',
    }));
    const { client, rpcCalls, fnCalls } = fakeClient({});
    const res = await new SupabaseAdminUsersRepository(client).importUsers(many, true);

    expect(res.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
    expect(fnCalls).toHaveLength(0);
  });
});

describe('SupabaseAdminUsersRepository.create — cadastro avulso usa o provisionamento', () => {
  const input = { name: 'Solo Sintetico', email: 'Solo@Sint.Example', role: 'coordinator' as const, region: 'COORD NORTE' };

  it('NÃO chama a RPC depreciada admin_create_user nem o convite', async () => {
    const { client, rpcCalls, fnCalls } = fakeClient({
      rpc: {
        admin_import_users: () => ({
          data: rpcReport({
            counters: { total: 1, inserted: 1, updated: 0, errors: 0, pendingAuth: 1 },
            pendingAuth: ['solo@sint.example'],
          }),
        }),
      },
      functions: {
        'admin-provision-users': () => ({
          data: {
            ok: true,
            counters: { total: 1, created: 1, alreadyExisting: 0, failed: 0, activated: 1 },
            rows: [{ email: 'solo@sint.example', state: 'created', authUserId: 'auth-solo' }],
            report: rpcReport({
              mode: 'commit',
              applied: true,
              counters: { total: 1, inserted: 1, updated: 0, errors: 0, pendingAuth: 0 },
              rows: [{ index: 1, name: 'Solo Sintetico', email: 'solo@sint.example', role: 'coordinator', status: 'ok', action: 'insert', userId: 'auth-solo', messages: [], warnings: [] }],
            }),
          },
        }),
      },
    });
    const res = await new SupabaseAdminUsersRepository(client).create(input);

    expect(rpcCalls.map((c) => c.name)).toEqual(['admin_import_users']);
    expect(rpcCalls.map((c) => c.name)).not.toContain('admin_create_user');
    expect(fnCalls.map((c) => c.name)).toEqual(['admin-provision-users']);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.email).toBe('solo@sint.example');
      // Nasce ATIVO: a identidade é criada com e-mail já confirmado e a RPC de
      // ativação roda em seguida — não há mais espera por clique em convite.
      expect(res.value.active).toBe(true);
    }
  });

  it('lote recusado pelo servidor vira erro com o motivo da linha', async () => {
    const { client } = fakeClient({
      rpc: { admin_import_users: () => ({ data: rpcReport({ pendingAuth: ['solo@sint.example'] }) }) },
      functions: {
        'admin-provision-users': () => ({
          data: {
            ok: false,
            counters: { total: 1, created: 0, alreadyExisting: 0, failed: 1, activated: 0 },
            rows: [{ email: 'solo@sint.example', state: 'failed', authUserId: null, message: 'Coordenacao inexistente: COORD NORTE' }],
            report: null,
          },
        }),
      },
    });
    const res = await new SupabaseAdminUsersRepository(client).create(input);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/Coordenacao inexistente: COORD NORTE/);
  });
});
