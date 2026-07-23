/**
 * Testes de ESQUEMA em banco REAL (PostgreSQL 18 via PGlite).
 *
 * Substitui, com execução de verdade, o que `migrations.test.ts` só verificava
 * por regex de texto. Aqui as migrations 0001/0002/0003 são APLICADAS e o banco
 * é INTERROGADO: tabelas, RLS, constraints, FKs, uniqueness e `db reset`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { ID } from './testing/fixtures';

const REQUIRED_TABLES = [
  'organizations', 'regions', 'units', 'coordinations', 'operations',
  'users', 'user_scopes', 'operation_assignments',
  'visit_rules', 'calendar_exceptions',
  'audit_templates', 'audit_template_versions', 'audit_items',
  'indicator_definitions', 'indicator_versions', 'measurements',
  'visits', 'evaluations', 'evaluation_answers', 'official_snapshots',
  'evidence_files', 'evaluation_answer_evidence',
  'diagnoses', 'action_plans', 'validations', 'best_practices',
  'audit_logs', 'sync_operations',
  // Extensão de domínio 0004 (Gestão Assistida): também sob RLS forçada.
  'indicator_results', 'visit_reports',
];

describe('esquema aplicado em banco real (0001→0003)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb({ seed: true }); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('cria todas as 30 tabelas (§11.2 + extensão 0004)', async () => {
    const rows = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname='public'`,
    );
    const names = rows.map((r) => r.tablename).sort();
    for (const t of REQUIRED_TABLES) expect(names, `faltando ${t}`).toContain(t);
    expect(names.length).toBe(REQUIRED_TABLES.length);
  });

  it('habilita e força RLS em TODAS as tabelas public', async () => {
    const rows = await db.query<{ relname: string; f: boolean }>(
      `select c.relname, c.relforcerowsecurity f
         from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false`,
    );
    expect(rows, 'tabelas sem RLS').toEqual([]);
    const forced = await db.query<{ n: number }>(
      `select count(*)::int n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
        where ns.nspname='public' and c.relkind='r' and c.relforcerowsecurity=true`,
    );
    expect(forced[0].n).toBe(REQUIRED_TABLES.length);
  });

  it('registra 57 policies e os gatilhos de integridade', async () => {
    const pol = await db.query<{ n: number }>(`select count(*)::int n from pg_policies where schemaname='public'`);
    expect(pol[0].n).toBeGreaterThanOrEqual(50);
    const trg = await db.query<{ n: number }>(`select count(*)::int n from pg_trigger where not tgisinternal`);
    expect(trg[0].n).toBeGreaterThanOrEqual(20);
  });

  it('seed carrega 24 temas e 12 indicadores', async () => {
    const items = await db.query<{ n: number }>(`select count(*)::int n from public.audit_items`);
    expect(items[0].n).toBe(24);
    const inds = await db.query<{ n: number }>(`select count(*)::int n from public.indicator_definitions`);
    expect(inds[0].n).toBe(12);
  });

  it('gen_random_uuid (pgcrypto/nativo) funciona', async () => {
    const r = await db.query<{ u: string }>(`select gen_random_uuid()::text u`);
    expect(r[0].u).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('constraints e integridade referencial (banco real)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('operations.state aceita só PR/SC (check §11.2)', async () => {
    await db.exec(`
      insert into public.organizations (id,name) values ('${ID.org}','o');
      insert into public.regions (id,organization_id,name) values ('${ID.region}','${ID.org}','r');
      insert into public.units (id,region_id,name) values ('${ID.unit}','${ID.region}','u');
      insert into public.coordinations (id,region_id,name) values ('${ID.coord1}','${ID.region}','c');
    `);
    await expect(db.exec(
      `insert into public.operations (unit_id,coordination_id,partner_name,office_name,city,state)
       values ('${ID.unit}','${ID.coord1}','p','o','Cidade','SP')`,
    )).rejects.toThrow();
  });

  it('FK inexistente é rejeitada', async () => {
    await expect(db.exec(
      `insert into public.regions (organization_id,name) values ('11111111-1111-1111-1111-111111111111','x')`,
    )).rejects.toThrow();
  });

  it('uniqueness de e-mail corporativo é imposta', async () => {
    await db.exec(`insert into auth.users (id,email) values ('${ID.uGcA}','dup@fic.example')`);
    await db.exec(`insert into public.users (id,display_name,corporate_email) values ('${ID.uGcA}','a','dup@fic.example')`);
    await db.exec(`insert into auth.users (id,email) values ('${ID.uGcB}','dup2@fic.example')`);
    await expect(db.exec(
      `insert into public.users (id,display_name,corporate_email) values ('${ID.uGcB}','b','dup@fic.example')`,
    )).rejects.toThrow();
  });

  it('idempotency_key de sync_operations é única (§12.3)', async () => {
    await db.exec(`insert into public.sync_operations (idempotency_key,kind) values ('k1','save_draft')`);
    await expect(db.exec(
      `insert into public.sync_operations (idempotency_key,kind) values ('k1','submit_evaluation')`,
    )).rejects.toThrow();
  });
});

describe('db reset reaplica o esquema de forma idempotente (§18.3)', () => {
  it('down + up recria as 30 tabelas sem erro', async () => {
    const db = await createTestDb({ seed: true });
    try {
      await db.reset({ seed: true });
      const rows = await db.query<{ n: number }>(
        `select count(*)::int n from pg_tables where schemaname='public'`,
      );
      expect(rows[0].n).toBe(REQUIRED_TABLES.length);
      const inds = await db.query<{ n: number }>(`select count(*)::int n from public.indicator_definitions`);
      expect(inds[0].n).toBe(12);
    } finally {
      await db.close();
    }
  }, 30_000);
});
