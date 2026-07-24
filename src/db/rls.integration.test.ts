/**
 * Testes de RLS em banco REAL, autenticando como cada perfil (Anexo B/D — T01/T02/T17).
 *
 * NÃO são funções puras que "simulam" autorização: cada bloco entra numa transação
 * como o papel `authenticated` com o claim JWT do usuário e deixa o PostgreSQL
 * decidir. Cobrem isolamento entre GCs, escopo de coordenador/regional, admin-only
 * em indicadores e a proibição de autoaprovação.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

describe('RLS por perfil (banco real)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
  }, 30_000);
  afterAll(async () => { await db.close(); });

  // ---- GC A: vê só o próprio; não vê o do GC B (T01) ----
  it('GC A lê apenas a sua operação', async () => {
    const rows = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ id: string }>(`select id from public.operations`));
    expect(rows.map((r) => r.id)).toEqual([ID.opA]);
  });

  it('GC A NÃO lê a operação do GC B', async () => {
    const rows = await db.asUser(ID.uGcA, (tx) =>
      tx.query(`select id from public.operations where id='${ID.opB}'`));
    expect(rows).toEqual([]);
  });

  it('GC B lê apenas a sua operação (isolamento recíproco)', async () => {
    const rows = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ id: string }>(`select id from public.operations`));
    expect(rows.map((r) => r.id)).toEqual([ID.opB]);
  });

  it('GC A NÃO altera indicador (admin-only, D-05)', async () => {
    const e = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`insert into public.indicator_definitions (code,name) values ('X','Y')`));
    expect(String(e.message)).toMatch(/row-level security|policy|permission/i);
  });

  it('GC A NÃO enxerga o usuário administrador (users self-read)', async () => {
    const rows = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ id: string }>(`select id from public.users`));
    expect(rows.map((r) => r.id)).toEqual([ID.uGcA]);
  });

  it('GC A NÃO aprova a própria avaliação (T02, sem autoaprovação)', async () => {
    const e = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(
        `insert into public.validations (evaluation_id,validator_user_id,decision,reason)
         values ('${ID.evalA}','${ID.uGcA}','approved','ok')`));
    expect(e).toBeInstanceOf(Error);
  });

  // ---- Coordenador: só o seu escopo; valida quem não é ele mesmo ----
  it('Coordenador 1 lê a operação da sua coordenadoria e não a de C2', async () => {
    const rows = await db.asUser(ID.uCoord1, (tx) =>
      tx.query<{ id: string }>(`select id from public.operations order by id`));
    expect(rows.map((r) => r.id)).toEqual([ID.opA]);
  });

  it('Coordenador 2 NÃO lê a operação da coordenadoria 1', async () => {
    const rows = await db.asUser(ID.uCoord2, (tx) =>
      tx.query(`select id from public.operations where id='${ID.opA}'`));
    expect(rows).toEqual([]);
  });

  it('Coordenador 1 PODE validar a avaliação do GC A (escopo + autor diferente)', async () => {
    const rows = await db.asUser(ID.uCoord1, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.validations (evaluation_id,validator_user_id,decision,reason)
         values ('${ID.evalA}','${ID.uCoord1}','returned','ajustar item') returning id`));
    expect(rows).toHaveLength(1);
  });

  it('Coordenador 2 NÃO valida avaliação fora do seu escopo', async () => {
    const e = await db.asUser(ID.uCoord2, (tx) =>
      tx.expectError(
        `insert into public.validations (evaluation_id,validator_user_id,decision,reason)
         values ('${ID.evalA}','${ID.uCoord2}','approved','x')`));
    expect(e).toBeInstanceOf(Error);
  });

  // ---- Regional: abrangência da região, sem poderes administrativos ----
  it('Regional lê operações de ambas as coordenadorias da sua região', async () => {
    const rows = await db.asUser(ID.uReg, (tx) =>
      tx.query<{ id: string }>(`select id from public.operations order by id`));
    expect(rows.map((r) => r.id).sort()).toEqual([ID.opA, ID.opB].sort());
  });

  it('Regional NÃO cadastra indicador (não é admin)', async () => {
    const e = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`insert into public.indicator_definitions (code,name) values ('Z','W')`));
    expect(e).toBeInstanceOf(Error);
  });

  // ---- Administrador: administra usuários e indicadores ----
  it('Administrador cria definição e versão de indicador', async () => {
    const created = await db.asUser(ID.uAdmin, async (tx) => {
      const def = await tx.query<{ id: string }>(
        `insert into public.indicator_definitions (code,name,lifecycle)
         values ('IND-NEW','Novo','active') returning id`);
      const ver = await tx.query<{ id: string }>(
        `insert into public.indicator_versions (definition_id,version_number,unit,direction,target)
         values ('${def[0].id}',1,'%','higher_better',50) returning id`);
      return { def: def[0].id, ver: ver[0].id };
    });
    expect(created.def).toBeTruthy();
    expect(created.ver).toBeTruthy();
  });

  it('Administrador lê todos os usuários', async () => {
    const rows = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.users`));
    expect(rows[0].n).toBe(7);
  });

  // ---- Usuário sem escopo: autenticado, mas nada é visível ----
  it('Usuário sem escopo NÃO lê operações nem parceiros', async () => {
    const out = await db.asUser(ID.uNoScope, async (tx) => {
      const ops = await tx.query(`select id from public.operations`);
      const partners = await tx.query(`select "id" from public.ui_admin_partners`);
      return { ops, partners };
    });
    expect(out.ops).toEqual([]);
    expect(out.partners).toEqual([]);
  });

  // ---- Anônimo: nada vaza sem login ----
  it('Anônimo (sem JWT) não lê operações', async () => {
    const rows = await db.asAnon((tx) => tx.query(`select id from public.operations`));
    expect(rows).toEqual([]);
  });

  it('Anônimo (sem JWT) não lê a projeção de parceiros', async () => {
    const rows = await db.asAnon((tx) => tx.query(`select "id" from public.ui_admin_partners`));
    expect(rows).toEqual([]);
  });
});
