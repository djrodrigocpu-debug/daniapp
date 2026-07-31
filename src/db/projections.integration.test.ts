/**
 * Testes das PROJEÇÕES ui_* e dos RPCs de domínio em banco REAL (PGlite/PG18).
 *
 * Cobre o que o `db push --dry-run` NÃO valida: se as views respeitam a RLS por
 * perfil (security_invoker) e se os RPCs impõem a autorização no servidor
 * (anti-autoaprovação T02, admin-only D-05, escopo T01, travas de envio §7.4).
 *
 * Migrations 0004→0007 são aplicadas pelo harness (descoberta dinâmica).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, anexarEvidencia, ID } from './testing/fixtures';

async function makeScenario(): Promise<TestDb> {
  const db = await createTestDb(); // sem seed de catálogo: 1 template (templateV1)
  await seedScenario(db);
  return db;
}

// ===========================================================================
// VIEWS — a RLS-base é avaliada no papel do usuário (security_invoker)
// ===========================================================================
describe('ui_* respeitam a RLS por perfil (security_invoker)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('ui_operations: GC vê apenas a própria operação', async () => {
    const a = await db.asUser(ID.uGcA, (tx) => tx.query<{ id: string }>(`select "id" from public.ui_operations`));
    expect(a.map((r) => r.id)).toEqual([ID.opA]);
    const b = await db.asUser(ID.uGcB, (tx) => tx.query<{ id: string }>(`select "id" from public.ui_operations`));
    expect(b.map((r) => r.id)).toEqual([ID.opB]);
  });

  it('ui_operations: coordenador vê a operação da sua coordenadoria; admin vê ambas', async () => {
    const c = await db.asUser(ID.uCoord1, (tx) => tx.query<{ id: string }>(`select "id" from public.ui_operations`));
    expect(c.map((r) => r.id)).toEqual([ID.opA]);
    const adm = await db.asUser(ID.uAdmin, (tx) => tx.query<{ id: string }>(`select "id" from public.ui_operations order by "id"`));
    expect(adm.map((r) => r.id).sort()).toEqual([ID.opA, ID.opB].sort());
  });

  it('ui_operations: anônimo não vê nada', async () => {
    const rows = await db.asAnon((tx) => tx.query(`select "id" from public.ui_operations`));
    expect(rows).toEqual([]);
  });

  it('ui_operations: colunas derivadas têm a forma da UI (números JSON, farol)', async () => {
    const [op] = await db.asUser(ID.uGcA, (tx) =>
      tx.query<Record<string, unknown>>(`select * from public.ui_operations where "id"=$1`, [ID.opA]));
    expect(op.partnerName).toBe('Parceiro A');
    expect(op.coordinatorId).toBe(ID.uCoord1);
    expect(op.managerId).toBe(ID.uGcA);
    expect(typeof op.currentScore).toBe('number');
    expect(typeof op.openActions).toBe('number');
    expect(op.status).toBe('not_evaluated'); // sem snapshot ainda
    expect(typeof op.nextAudit).toBe('string');
  });

  it('ui_evaluations: GC autor vê a sua avaliação; outro GC não', async () => {
    const a = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ id: string; operationId: string }>(`select "id","operationId" from public.ui_evaluations`));
    expect(a.map((r) => r.id)).toContain(ID.evalA);
    const b = await db.asUser(ID.uGcB, (tx) => tx.query(`select "id" from public.ui_evaluations`));
    expect(b).toEqual([]);
  });

  it('ui_users: admin vê todos; um GC vê apenas a si', async () => {
    const adm = await db.asUser(ID.uAdmin, (tx) => tx.query<{ id: string }>(`select "id" from public.ui_users`));
    expect(adm.length).toBe(7);
    const self = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ id: string; name: string; role: string }>(`select "id","name","role" from public.ui_users`));
    expect(self.map((r) => r.id)).toEqual([ID.uGcA]);
    expect(self[0].role).toBe('channel_manager');
  });

  it('ui_indicators: usageCount reflete medições reais', async () => {
    const rows = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ code: string; usageCount: number; versions: unknown[] }>(
        `select "code","usageCount","versions" from public.ui_indicators where "code"='IND-FIC'`));
    expect(rows[0].usageCount).toBe(1);
    expect(Array.isArray(rows[0].versions)).toBe(true);
    expect(rows[0].versions.length).toBe(1);
  });
});

// ===========================================================================
// RPCs — ciclo de auditoria e travas de envio
// ===========================================================================
describe('RPCs de auditoria: abrir, responder, travas de envio (§7.4)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('start_evaluation é idempotente e cria respostas em branco', async () => {
    const first = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ start_evaluation: any }>(`select public.start_evaluation($1,$2,$3) as start_evaluation`, [ID.opB, 'weekly', ID.uGcB]));
    const ev1 = first[0].start_evaluation;
    expect(ev1.status).toBe('draft');
    expect(ev1.answers.length).toBe(1); // item I01 (weekly)
    expect(ev1.answers[0].themeId).toBe('I01');

    const second = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ start_evaluation: any }>(`select public.start_evaluation($1,$2,$3) as start_evaluation`, [ID.opB, 'weekly', ID.uGcB]));
    expect(second[0].start_evaluation.id).toBe(ev1.id); // reaproveita, não duplica
  });

  it('start_evaluation fora do escopo é negado', async () => {
    await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.start_evaluation($1,$2,$3)`, [ID.opA, 'weekly', ID.uGcB]));
  });

  it('travas de envio: completude → evidência → plano de ação para item vermelho', async () => {
    const draft = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: any }>(`select public.start_evaluation($1,$2,$3) as ev`, [ID.opB, 'weekly', ID.uGcB])))[0].ev;

    // (a) sem responder → bloqueio por completude
    await db.asUser(ID.uGcB, (tx) => tx.expectError(`select public.submit_evaluation($1)`, [draft.id]));

    // responde vermelho → recalcula nota (red=0)
    const saved = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: any }>(`select public.save_evaluation_answer($1,$2,$3::jsonb) as ev`,
        [draft.id, 'I01', JSON.stringify({ status: 'red' })])))[0].ev;
    expect(saved.score).toBe(0);
    expect(saved.answers[0].status).toBe('red');

    // (b) evidência obrigatória ausente
    await db.asUser(ID.uGcB, (tx) => tx.expectError(`select public.submit_evaluation($1)`, [draft.id]));

    // anexa evidência pelo fluxo oficial: reserva → upload → confirmação (0028)
    await anexarEvidencia(db, {
      userId: ID.uGcB, evaluationId: draft.id, themeId: 'I01', name: 'foto.jpg',
    });

    // (c) item vermelho sem plano de ação
    await db.asUser(ID.uGcB, (tx) => tx.expectError(`select public.submit_evaluation($1)`, [draft.id]));

    // cria plano de ação para o item vermelho
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.save_action_plan($1::jsonb)`, [JSON.stringify({
        operationId: ID.opB, evaluationId: draft.id, themeId: 'I01', problem: 'p', rootCause: 'c',
        action: 'agir', owner: 'GC B', dueDate: '2099-01-31', priority: 'high', expectedEvidence: 'e', status: 'not_started',
      })]));

    // agora o envio passa
    const submitted = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: any }>(`select public.submit_evaluation($1) as ev`, [draft.id])))[0].ev;
    expect(submitted.status).toBe('submitted');
    expect(submitted.submittedAt).toBeTruthy();
  });

  it('não-autor não edita respostas de outra avaliação', async () => {
    await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.save_evaluation_answer($1,$2,$3::jsonb)`,
        [ID.evalA, 'I01', JSON.stringify({ status: 'green' })]));
  });
});

// ===========================================================================
// RPCs — validação (T02: sem autoaprovação; escopo; perfil)
// ===========================================================================
describe('validate_evaluation impõe segregação e escopo (T02)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('autor não valida a própria avaliação', async () => {
    await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));
  });

  it('perfil sem permissão (outro GC) é negado', async () => {
    await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));
  });

  it('coordenador da operação (≠ autor) aprova; snapshot alimenta ui_operations', async () => {
    const res = (await db.asUser(ID.uCoord1, (tx) =>
      tx.query<{ ev: any }>(`select public.validate_evaluation($1,$2,$3) as ev`, [ID.evalA, 'approved', 'ok'])))[0].ev;
    expect(res.status).toBe('approved');

    const snap = await db.query<{ n: number }>(`select count(*)::int n from public.official_snapshots where evaluation_id=$1`, [ID.evalA]);
    expect(snap[0].n).toBe(1);

    const [op] = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ currentScore: number; status: string; lastAudit: string | null }>(
        `select "currentScore","status","lastAudit" from public.ui_operations where "id"=$1`, [ID.opA]));
    expect(Number(op.currentScore)).toBe(75);
    expect(op.status).toBe('yellow'); // 75 → amarelo (§15)
    expect(op.lastAudit).not.toBeNull();
  });
});

// ===========================================================================
// MICROCORREÇÃO 0026 — openActions com waiting_partner + projeção segura de nomes
// ===========================================================================
describe('ui_operations.openActions inclui waiting_partner, exclui done/validated', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  async function openActionsOf(opId: string): Promise<number> {
    const [row] = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ openActions: number }>(`select "openActions" from public.ui_operations where "id"=$1`, [opId]));
    return row.openActions;
  }

  it('waiting_partner conta como ação aberta', async () => {
    await db.exec(`insert into public.action_plans (operation_id, description, due_date, priority, status)
      values ('${ID.opA}','p1','2099-01-01','high','waiting_partner')`);
    expect(await openActionsOf(ID.opA)).toBe(1);
  });

  it('done não conta como ação aberta', async () => {
    await db.exec(`insert into public.action_plans (operation_id, description, due_date, priority, status)
      values ('${ID.opA}','p2','2099-01-01','high','done')`);
    expect(await openActionsOf(ID.opA)).toBe(1); // permanece 1: só o waiting_partner do teste anterior conta
  });

  it('validated não conta como ação aberta', async () => {
    await db.exec(`insert into public.action_plans (operation_id, description, due_date, priority, status)
      values ('${ID.opA}','p3','2099-01-01','high','validated')`);
    expect(await openActionsOf(ID.opA)).toBe(1);
  });
});

describe('ui_operation_people / ui_evaluation_people — nomes funcionais restritos ao escopo (0026)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('coordenador recebe nomes só da própria coordenadoria', async () => {
    const own = await db.asUser(ID.uCoord1, (tx) =>
      tx.query<{ managerName: string; coordinatorName: string; coordinationName: string }>(
        `select * from public.ui_operation_people where "operationId"=$1`, [ID.opA]));
    expect(own).toEqual([{ operationId: ID.opA, managerName: 'GC A Fic', coordinatorName: 'Coord1 Fic', coordinationName: 'Coord 1' }]);

    const other = await db.asUser(ID.uCoord1, (tx) =>
      tx.query(`select * from public.ui_operation_people where "operationId"=$1`, [ID.opB]));
    expect(other).toEqual([]); // fora da sua coordenadoria
  });

  it('regional recebe nomes de todas as operações da sua região', async () => {
    const rows = await db.asUser(ID.uReg, (tx) =>
      tx.query<{ operationId: string }>(`select "operationId" from public.ui_operation_people order by "operationId"`));
    expect(rows.map((r) => r.operationId).sort()).toEqual([ID.opA, ID.opB].sort());
  });

  it('administração recebe nomes do escopo corporativo (operação e avaliador)', async () => {
    const people = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ operationId: string }>(`select "operationId" from public.ui_operation_people order by "operationId"`));
    expect(people.map((r) => r.operationId).sort()).toEqual([ID.opA, ID.opB].sort());

    const [evaluator] = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ evaluatorName: string }>(`select "evaluatorName" from public.ui_evaluation_people where "evaluationId"=$1`, [ID.evalA]));
    expect(evaluator.evaluatorName).toBe('GC A Fic');
  });

  it('perfil fora do escopo não recebe os nomes', async () => {
    const people = await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select * from public.ui_operation_people where "operationId"=$1`, [ID.opA]));
    expect(people).toEqual([]);
    const evaluator = await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select * from public.ui_evaluation_people where "evaluationId"=$1`, [ID.evalA]));
    expect(evaluator).toEqual([]);
  });

  it('a projeção não expõe e-mail nem colunas além do necessário', async () => {
    const [row] = await db.asUser(ID.uCoord1, (tx) =>
      tx.query<Record<string, unknown>>(`select * from public.ui_operation_people where "operationId"=$1`, [ID.opA]));
    expect(Object.keys(row).sort()).toEqual(['coordinationName', 'coordinatorName', 'managerName', 'operationId'].sort());
  });
});

// ===========================================================================
// RPCs — administração (D-05: somente Administrador)
// ===========================================================================
describe('RPCs administrativos exigem is_admin (D-05)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('não-admin não cria indicador', async () => {
    await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.admin_create_indicator($1,$2,$3::jsonb)`,
        ['IND-NEW', 'Novo', JSON.stringify({ unit: '%', direction: 'higher_better', target: 90, yellowTolerance: 10, weight: 5 })]));
  });

  it('admin cria indicador com versão 1', async () => {
    const res = (await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ ind: any }>(`select public.admin_create_indicator($1,$2,$3::jsonb) as ind`,
        ['IND-NEW', 'Novo', JSON.stringify({ unit: '%', direction: 'higher_better', target: 90, yellowTolerance: 10, weight: 5 })])))[0].ind;
    expect(res.code).toBe('IND-NEW');
    expect(res.lifecycle).toBe('active');
    expect(res.versions.length).toBe(1);
  });

  /**
   * Contrato ALTERADO na migration 0011. A função criava um perfil apoiado numa
   * identidade Auth incompleta — o usuário aparecia em ui_users e nunca
   * conseguia autenticar. Agora recusa e aponta o caminho correto; o onboarding
   * real é coberto em src/db/admin_import_users.integration.test.ts.
   */
  it('admin_create_user está depreciada e não cria mais perfil algum', async () => {
    const antes = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.ui_users`));

    const erro = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select public.admin_create_user($1::jsonb)`,
        [JSON.stringify({ name: 'Novo Usuário', email: 'novo@fic.example', role: 'coordinator', region: 'Região Fictícia' })]));
    expect(erro.message).toMatch(/DEPRECIADA/);

    const depois = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.ui_users`));
    expect(depois[0].n).toBe(antes[0].n);
  });

  it('não-admin não altera papel de usuário', async () => {
    await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.admin_set_user_role($1,$2)`, [ID.uGcB, 'admin']));
  });
});
