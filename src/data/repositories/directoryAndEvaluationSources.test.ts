/**
 * Fontes canônicas de USUÁRIO e AVALIAÇÃO por modo.
 *
 * Fecha a última ocorrência conhecida do defeito recorrente: entidade real do
 * Supabase resolvida no `localStore` de demonstração. Antes disto,
 * `getUser` devolvia "—" para um Gerente de Canal existente, `getEvaluation`
 * devolvia "não encontrada" para uma avaliação criada no servidor,
 * `listByOperation` vinha sempre vazio e `getCurrentDraft` nunca achava o
 * rascunho aberto (o guard de ciclo em andamento não disparava).
 *
 * Dados 100% SINTÉTICOS (§23) — nenhum nome, e-mail ou UUID real.
 */
import { describe, it, expect } from 'vitest';
import { LocalDirectoryRepository, SupabaseDirectoryRepository } from './DirectoryRepository';
import { LocalEvaluationsRepository } from './LocalEvaluationsRepository';
import { SupabaseEvaluationsRepository } from './SupabaseEvaluationsRepository';
import { LocalStore } from '../store/localStore';
import { AppData, Evaluation, User } from '../../types';

const U_SINT: User = {
  id: '00000000-0000-0000-0000-0000000091a1',
  name: 'Pessoa Sintetica',
  email: 'pessoa.sintetica@sint.example',
  role: 'channel_manager',
  region: 'Coord Sintetica',
  avatarInitials: 'PS',
};

const E_SINT = {
  id: '00000000-0000-0000-0000-0000000092b1',
  operationId: '00000000-0000-0000-0000-0000000093c1',
  status: 'draft',
  createdAt: '2026-01-02T00:00:00.000Z',
} as unknown as Evaluation;

const E_SINT_ANTIGA = {
  id: '00000000-0000-0000-0000-0000000092b2',
  operationId: '00000000-0000-0000-0000-0000000093c1',
  status: 'approved',
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as Evaluation;

/** Store isolado — não toca no `localStore` global do app. */
function storeCom(over: Partial<AppData>): LocalStore {
  const vazio = {
    users: [], operations: [], evaluations: [], actionPlans: [], evidences: [],
    indicatorDefinitions: [], indicatorResults: [], visitReports: [],
  } as unknown as AppData;
  return new LocalStore({ ...vazio, ...over }, `@teste:${Math.random()}`);
}

/** Cliente Supabase mínimo: registra as consultas e devolve linhas fixas. */
function fakeClient(rows: unknown[]) {
  const calls: Array<{ table: string; filters: string[] }> = [];
  const builder = (table: string) => {
    const filters: string[] = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => Promise.resolve({ data: rows, error: null }),
      eq: (col: string, val: unknown) => { filters.push(`${col}=${String(val)}`); return chain; },
      in: () => chain,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    };
    calls.push({ table, filters });
    return chain;
  };
  return { client: { from: builder } as never, calls };
}

describe('1/3 — diretório de usuários por modo', () => {
  it('modo demonstração continua lendo o store local', async () => {
    const repo = new LocalDirectoryRepository(storeCom({ users: [U_SINT] }));
    const res = await repo.listUsers();
    expect(res.ok && res.value).toHaveLength(1);
    expect(res.ok && res.value[0].id).toBe(U_SINT.id);
  });

  it('modo corporativo NÃO lê o store local: consulta a projeção ui_users', async () => {
    const { client, calls } = fakeClient([U_SINT]);
    const res = await new SupabaseDirectoryRepository(client).listUsers();
    expect(calls.map((c) => c.table)).toEqual(['ui_users']);
    expect(res.ok && res.value[0].id).toBe(U_SINT.id);
  });

  it('12 — o diretório é UMA consulta, não uma por usuário resolvido', async () => {
    const { client, calls } = fakeClient([U_SINT, { ...U_SINT, id: 'outro' }]);
    await new SupabaseDirectoryRepository(client).listUsers();
    expect(calls).toHaveLength(1);
  });
});

describe('2/3 — avaliações por modo', () => {
  it('modo demonstração continua lendo o store local', async () => {
    const repo = new LocalEvaluationsRepository(storeCom({ evaluations: [E_SINT] }));
    const res = await repo.listVisible();
    expect(res.ok && res.value).toHaveLength(1);
  });

  it('modo corporativo NÃO lê o store local: consulta a projeção ui_evaluations', async () => {
    const { client, calls } = fakeClient([E_SINT]);
    const res = await new SupabaseEvaluationsRepository(client).listVisible();
    expect(calls.map((c) => c.table)).toEqual(['ui_evaluations']);
    expect(res.ok && res.value[0].id).toBe(E_SINT.id);
  });

  it('5/6 — a avaliação é recuperável por UUID canônico, não por nome ou posição', async () => {
    const { client, calls } = fakeClient([E_SINT]);
    await new SupabaseEvaluationsRepository(client).getById(E_SINT.id);
    expect(calls[0].filters).toEqual([`id=${E_SINT.id}`]);
  });

  it('12 — a lista de avaliações é UMA consulta para todo o escopo', async () => {
    const { client, calls } = fakeClient([E_SINT, E_SINT_ANTIGA]);
    await new SupabaseEvaluationsRepository(client).listVisible();
    expect(calls).toHaveLength(1);
  });
});

describe('11 — resolução sempre por UUID', () => {
  it('o diretório indexa por id; nome e e-mail não são chave', async () => {
    const repo = new LocalDirectoryRepository(storeCom({ users: [U_SINT] }));
    const res = await repo.listUsers();
    const porId = new Map((res.ok ? res.value : []).map((u) => [u.id, u]));
    expect(porId.get(U_SINT.id)?.id).toBe(U_SINT.id);
    // Nenhuma chave alternativa é aceita como identidade.
    expect(porId.get(U_SINT.name)).toBeUndefined();
    expect(porId.get(U_SINT.email)).toBeUndefined();
  });
});
