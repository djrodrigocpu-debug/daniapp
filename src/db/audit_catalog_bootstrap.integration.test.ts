/**
 * Migration 0019 — bootstrap do catálogo de auditoria, contra Postgres REAL
 * (PGlite) com as migrations 0001..0019 aplicadas.
 *
 * O catálogo aqui NÃO é fixture inventada: é o conteúdo canônico do produto
 * (seed 0001_seed_catalog.sql = src/data/catalog.ts, códigos T01–T24). Os
 * testes provam idempotência, ordem estável, detecção de conflito de conteúdo
 * e que `start_evaluation` passa a funcionar num banco SEM nenhum outro
 * template — exatamente o cenário que bloqueou o runtime no staging.
 *
 * Identidades de usuário/estrutura usadas no teste 6 são SINTÉTICAS (§23).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb, TestDb } from './testing/harness';

const MIGRATION_0019 = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0019_audit_catalog_bootstrap.sql'),
  'utf8',
);

/** Frequências do catálogo canônico: 16 semanais + 8 mensais = 24. */
const WEEKLY_CODES = ['T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T11', 'T14', 'T17', 'T18', 'T19', 'T20', 'T21', 'T22', 'T24'];

const U_ADMIN = '00000000-0000-0000-0000-0000000061a1';
const OP = '00000000-0000-0000-0000-0000000061e1';

describe('audit catalog bootstrap (0019)', () => {
  let db: TestDb;

  const contagens = () => db.query<{
    templates: number; versions: number; items: number;
    evaluations: number; users: number; operations: number; scopes: number; onboarding: number;
  }>(`select
        (select count(*)::int from public.audit_templates where code = 'AACE-CHECKLIST') as "templates",
        (select count(*)::int from public.audit_template_versions v
           join public.audit_templates t on t.id = v.template_id
          where t.code = 'AACE-CHECKLIST') as "versions",
        (select count(*)::int from public.audit_items ai
           join public.audit_template_versions v on v.id = ai.template_version_id
           join public.audit_templates t on t.id = v.template_id
          where t.code = 'AACE-CHECKLIST') as "items",
        (select count(*)::int from public.evaluations) as "evaluations",
        (select count(*)::int from public.users) as "users",
        (select count(*)::int from public.operations) as "operations",
        (select count(*)::int from public.user_scopes) as "scopes",
        (select count(*)::int from app.user_password_onboarding) as "onboarding"
     `).then((r) => r[0]);

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db.close(); });

  beforeEach(async () => { await db.reset(); });

  it('8/9 — aplicar a migration cria SÓ o catálogo: nada de avaliação, usuário, parceiro, escopo ou onboarding', async () => {
    const c = await contagens();
    expect(c.templates).toBe(1);
    expect(c.versions).toBe(1);
    expect(c.items).toBe(24);
    expect(c.evaluations).toBe(0);
    expect(c.users).toBe(0);
    expect(c.operations).toBe(0);
    expect(c.scopes).toBe(0);
    expect(c.onboarding).toBe(0);
  });

  it('1/2/3/4 — reexecução integral é idempotente: nenhum nível duplica', async () => {
    const antes = await contagens();
    await db.exec(MIGRATION_0019);
    await db.exec(MIGRATION_0019);
    const depois = await contagens();
    expect(depois).toEqual(antes);
    expect(depois.templates).toBe(1);
    expect(depois.versions).toBe(1);
    expect(depois.items).toBe(24);
  });

  it('5 — a ordem dos itens é estável: T01..T24 por código, a mesma de ui_evaluations', async () => {
    const rows = await db.query<{ code: string }>(
      `select ai.code from public.audit_items ai
         join public.audit_template_versions v on v.id = ai.template_version_id
         join public.audit_templates t on t.id = v.template_id
        where t.code = 'AACE-CHECKLIST'
        order by ai.code`);
    const esperado = Array.from({ length: 24 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);
    expect(rows.map((r) => r.code)).toEqual(esperado);
  });

  it('6 — start_evaluation encontra o catálogo num banco SEM outro template', async () => {
    // Cenário mínimo sintético — deliberadamente SEM seedScenario, para que o
    // único template existente seja o do bootstrap 0019.
    await db.exec(`
      insert into auth.users (id, email) values ('${U_ADMIN}','admin.sintetico@fic.example');
      insert into public.users (id, display_name, corporate_email, status) values
        ('${U_ADMIN}','Admin Sintetico','admin.sintetico@fic.example','active');
      insert into public.user_scopes (user_id, role) values ('${U_ADMIN}','admin');
      insert into public.organizations (id, name) values ('00000000-0000-0000-0000-0000000061a0','Org Sintetica');
      insert into public.regions (id, organization_id, name) values
        ('00000000-0000-0000-0000-0000000061b0','00000000-0000-0000-0000-0000000061a0','Regiao Sintetica');
      insert into public.units (id, region_id, name) values
        ('00000000-0000-0000-0000-0000000061c0','00000000-0000-0000-0000-0000000061b0','Unidade Sintetica');
      insert into public.coordinations (id, region_id, name) values
        ('00000000-0000-0000-0000-0000000061d0','00000000-0000-0000-0000-0000000061b0','Coord Sintetica');
      insert into public.operations (id, unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id) values
        ('${OP}','00000000-0000-0000-0000-0000000061c0','00000000-0000-0000-0000-0000000061d0',
         'Parceiro Sintetico','Escritorio Sintetico','0','PR','${U_ADMIN}');
    `);

    const criada = await db.asUser(U_ADMIN, (tx) =>
      tx.query<{ ev: { id: string; answers: Array<{ themeId: string }> } }>(
        `select public.start_evaluation($1, 'weekly', $2) as ev`, [OP, U_ADMIN]));
    const ev = criada[0].ev;
    expect(ev.id).toBeTruthy();
    // As respostas em branco nasceram dos 16 itens SEMANAIS do catálogo, já na
    // ordem por código projetada por ui_evaluations.
    expect(ev.answers.map((a) => a.themeId)).toEqual(WEEKLY_CODES);
  });

  it('7 — conteúdo divergente sob a mesma identidade ABORTA a migration nomeando o item', async () => {
    await db.exec(`
      update public.audit_items set title = 'Titulo Divergente'
       where code = 'T07' and template_version_id in (
         select v.id from public.audit_template_versions v
           join public.audit_templates t on t.id = v.template_id
          where t.code = 'AACE-CHECKLIST');
    `);
    await expect(db.exec(MIGRATION_0019)).rejects.toThrow(/catálogo divergente.*T07/);
  });

  it('7b — título divergente do TEMPLATE também é conflito, não atualização', async () => {
    await db.exec(`update public.audit_templates set title = 'Outro Titulo' where code = 'AACE-CHECKLIST';`);
    await expect(db.exec(MIGRATION_0019)).rejects.toThrow(/catálogo divergente.*template/);
  });

  it('ui_evidences existe, é consultável e nasce vazia', async () => {
    const rows = await db.query<{ n: number }>(`select count(*)::int as n from public.ui_evidences`);
    expect(rows[0].n).toBe(0);
  });
});
