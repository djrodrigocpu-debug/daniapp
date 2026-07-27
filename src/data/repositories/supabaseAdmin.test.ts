/**
 * Adapters Supabase de administração — exercitados por MOCK do SupabaseClient.
 *
 * Estes testes NÃO provam que o backend real funciona: provam apenas o contrato
 * que o cliente emite (quais RPCs, com quais argumentos) e como ele traduz as
 * respostas. A validação contra um Supabase provisionado continua pendente.
 *
 * Também FIXAM as limitações conhecidas do caminho remoto — atualização parcial
 * e ausência de atomicidade —, para que uma futura correção quebre o teste em
 * vez de passar despercebida. Dados 100% sintéticos (§23).
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
  };
  return { client: client as unknown as SupabaseClient, rpcCalls, tableReads };
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

describe('SupabaseAdminUsersRepository.importUsers', () => {
  it('simulação não dispara nenhuma RPC de escrita', async () => {
    const { client, rpcCalls } = fakeClient({ tables: { ui_users: { data: [] } } });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, false);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.mode).toBe('simulate');
    expect(rpcCalls).toHaveLength(0);
  });

  it('confirmação cria os novos via admin_create_user', async () => {
    const { client, rpcCalls } = fakeClient({
      tables: { ui_users: { data: [] } },
      rpc: { admin_create_user: (p) => ({ data: { id: `U-${(p.p_input as User).email}` } }) },
    });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, true);

    expect(rpcCalls.map((c) => c.name)).toEqual(['admin_create_user', 'admin_create_user']);
    expect(res.ok && res.value.counters.inserted).toBe(2);
    expect(res.ok && res.value.counters.errors).toBe(0);
  });

  it('LIMITAÇÃO FIXADA: existente só tem o PAPEL atualizado, e o relatório avisa', async () => {
    const existente: User = {
      id: 'U-ana', name: 'Nome Antigo', email: 'ana@sint.example',
      role: 'channel_manager', region: 'AREA ANTIGA', avatarInitials: 'NA', active: true,
    };
    const { client, rpcCalls } = fakeClient({
      tables: { ui_users: { data: [existente] } },
      rpc: { admin_set_user_role: () => ({ data: { id: 'U-ana' } }), admin_create_user: (p) => ({ data: { id: 'U-novo' } }) },
    });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, true);

    const roleCall = rpcCalls.find((c) => c.name === 'admin_set_user_role')!;
    expect(roleCall.params).toEqual({ p_user_id: 'U-ana', p_role: 'coordinator' });
    // Nenhuma RPC carrega o nome novo nem a nova área — não existe para isso.
    expect(JSON.stringify(rpcCalls)).not.toContain('Nome Antigo');
    if (res.ok) {
      const linha = res.value.rows.find((r) => r.email === 'ana@sint.example')!;
      expect(linha.action).toBe('update');
      expect(linha.warnings.join(' ')).toMatch(/Somente o perfil foi atualizado no servidor/);
    }
  });

  it('LIMITAÇÃO FIXADA: falha no meio do lote deixa estado PARCIAL (não é atômico)', async () => {
    const { client, rpcCalls } = fakeClient({
      tables: { ui_users: { data: [] } },
      rpc: {
        admin_create_user: (p) => ((p.p_input as User).email === 'bruno@sint.example'
          ? { error: { message: 'apenas administrador' } }
          : { data: { id: 'U-ana' } }),
      },
    });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, true);

    expect(res.ok).toBe(true);
    if (res.ok) {
      // A linha 1 JÁ FOI GRAVADA no servidor e não há rollback.
      expect(rpcCalls).toHaveLength(2);
      expect(res.value.rows[0].userId).toBe('U-ana');
      expect(res.value.rows[1].status).toBe('error');
      expect(res.value.rows[1].messages.join(' ')).toMatch(/apenas administrador/);
      expect(res.value.counters.errors).toBe(1);
    }
  });

  it('LIMITAÇÃO FIXADA: o vínculo GC→coordenador não é enviado ao servidor', async () => {
    const { client, rpcCalls } = fakeClient({
      tables: { ui_users: { data: [] } },
      rpc: { admin_create_user: () => ({ data: { id: 'U-x' } }) },
    });
    await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, true);

    // Nenhum argumento enviado carrega coordinatorId: não existe RPC de escopo.
    expect(JSON.stringify(rpcCalls)).not.toContain('coordinatorId');
  });

  it('falha ao listar usuários aborta sem escrever', async () => {
    const { client, rpcCalls } = fakeClient({ tables: { ui_users: { error: { message: 'permission denied' } } } });
    const res = await new SupabaseAdminUsersRepository(client).importUsers(USER_ROWS, true);

    expect(res.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it('lote acima do limite é rejeitado antes de qualquer chamada', async () => {
    const many: UserImportRow[] = Array.from({ length: 201 }, (_, i) => ({
      index: i + 1, name: `P${i}`, email: `p${i}@sint.example`, role: 'channel_manager', region: 'COORD NORTE',
    }));
    const { client, rpcCalls, tableReads } = fakeClient({});
    const res = await new SupabaseAdminUsersRepository(client).importUsers(many, true);

    expect(res.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
    expect(tableReads).toHaveLength(0);
  });
});
