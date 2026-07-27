/**
 * Permissões do schema `app` em banco REAL (PGlite/PG18) — migration 0008.
 *
 * Regressão do bug de runtime "permission denied for schema app": as views `ui_*`
 * (security_invoker) e as políticas avaliam funções de `app` no papel do usuário,
 * então `authenticated` precisa de USAGE no schema `app` (e EXECUTE nas funções
 * chamadas diretamente). O harness NÃO concede esse USAGE no baseline — quem
 * concede é a 0008 — de modo que este teste comprova a correção de verdade.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

describe('migration 0008 — grants mínimos do schema app', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); await seedScenario(db); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('1) authenticated possui USAGE no schema app', async () => {
    const r = await db.query<{ has_usage: boolean }>(
      `select has_schema_privilege('authenticated','app','USAGE') as has_usage`);
    expect(r[0].has_usage).toBe(true);
  });

  it('5) nenhuma permissão CREATE foi concedida a authenticated no schema app', async () => {
    const r = await db.query<{ has_create: boolean }>(
      `select has_schema_privilege('authenticated','app','CREATE') as has_create`);
    expect(r[0].has_create).toBe(false);
  });

  it('2) authenticated consulta ui_operations sem erro', async () => {
    const rows = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ id: string }>(`select "id" from public.ui_operations order by "id"`));
    expect(rows.length).toBeGreaterThanOrEqual(2); // opA e opB visíveis ao admin
    expect(rows.map((r) => r.id)).toContain(ID.opA);
  });

  it('3) authenticated consulta ui_action_plans sem erro', async () => {
    const rows = await db.asUser(ID.uAdmin, (tx) => tx.query(`select * from public.ui_action_plans`));
    expect(Array.isArray(rows)).toBe(true);
  });

  it('4) authenticated consulta ui_evaluations sem erro', async () => {
    const rows = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ id: string }>(`select "id" from public.ui_evaluations`));
    expect(rows.map((r) => r.id)).toContain(ID.evalA);
  });

  it('6) anon continua sem acesso às views corporativas (sem linhas)', async () => {
    const ops = await db.asAnon((tx) => tx.query(`select * from public.ui_operations`));
    expect(ops).toEqual([]);
    const evals = await db.asAnon((tx) => tx.query(`select * from public.ui_evaluations`));
    expect(evals).toEqual([]);
  });

  it('EXECUTE mínimo: funções app.* chamadas diretas têm execução por authenticated', async () => {
    const r = await db.query<{ f: string; ok: boolean }>(`
      select f, has_function_privilege('authenticated', f, 'EXECUTE') as ok from (values
        ('app.is_admin()'),
        ('app.has_operation_access(uuid)'),
        ('app.can_validate(uuid)'),
        ('app.score_traffic_light(numeric)'),
        ('app.action_status_to_ui(app.action_status)')
      ) as t(f)`);
    for (const row of r) expect(row.ok, `sem EXECUTE em ${row.f}`).toBe(true);
  });
});
