/**
 * Governança do workflow de planos + justificativa de "Não aplicável" em banco
 * REAL (PGlite/PG18) — migrations 0024/0025.
 *
 * Prova o que o typecheck não prova:
 *   - PARIDADE entre a tabela TypeScript (stateMachine) e a SQL
 *     (app.action_transition_allowed), e entre as traduções UI<->banco;
 *   - papel/segregação/terminal impostos NO SERVIDOR (RPC e trigger), inclusive
 *     contra escrita direta forjada permitida pela RLS;
 *   - estados de espera persistem SEPARADOS e sobrevivem à releitura;
 *   - legado: done continua Concluído e blocked continua Aguardando área
 *     interna — nada é reinterpretado;
 *   - portão de justificativa do não aplicável no envio + snapshot oficial.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';
import { canTransitionAction } from '../domain/workflow/stateMachine';
import { dbToUiActionStatus, uiToDbActionStatus } from '../domain/workflow/actionPlanWorkflow';
import { isValidNotApplicableReason } from '../domain/scoring/notApplicable';
import { ActionStatus as DbActionStatus } from '../domain/model';

const ALL_DB: DbActionStatus[] = [
  'open', 'in_progress', 'waiting_partner', 'blocked', 'done', 'validated', 'overdue', 'cancelled_justified',
];

async function makeScenario(): Promise<TestDb> {
  const db = await createTestDb();
  await seedScenario(db);
  return db;
}

/** Cria um plano em opA como o usuário dado, via RPC real. */
async function createPlan(db: TestDb, userId: string): Promise<string> {
  const rows = await db.asUser(userId, (tx) =>
    tx.query<{ plan: { id: string } }>(`select public.save_action_plan($1::jsonb) as plan`, [
      JSON.stringify({
        operationId: ID.opA, themeId: 'I01', problem: 'Problema fic', rootCause: 'Causa fic',
        action: 'Acao fic', owner: 'Resp fic', dueDate: '2099-12-31', priority: 'high',
        expectedEvidence: 'Evidencia fic', status: 'not_started',
      }),
    ]));
  return rows[0].plan.id;
}

async function setStatus(db: TestDb, userId: string, planId: string, status: string) {
  return db.asUser(userId, (tx) =>
    tx.query<{ plan: Record<string, unknown> }>(
      `select public.update_action_status($1,$2) as plan`, [planId, status]));
}

// ===========================================================================
// PARIDADE TypeScript × SQL
// ===========================================================================
describe('paridade da máquina e das traduções (TS × 0025)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('app.action_transition_allowed ≡ canTransitionAction para TODOS os pares', async () => {
    for (const from of ALL_DB) {
      for (const to of ALL_DB) {
        const [row] = await db.query<{ allowed: boolean }>(
          `select app.action_transition_allowed($1::app.action_status,$2::app.action_status) as allowed`,
          [from, to]);
        expect(`${from}->${to}:${row.allowed}`).toBe(`${from}->${to}:${canTransitionAction(from, to).ok}`);
      }
    }
  });

  it('app.action_status_to_ui ≡ dbToUiActionStatus', async () => {
    for (const from of ALL_DB) {
      const [row] = await db.query<{ ui: string }>(
        `select app.action_status_to_ui($1::app.action_status) as ui`, [from]);
      expect(`${from}:${row.ui}`).toBe(`${from}:${dbToUiActionStatus[from]}`);
    }
  });

  it('app.action_status_to_db ≡ uiToDbActionStatus (e recusa vocabulário desconhecido)', async () => {
    for (const ui of Object.keys(uiToDbActionStatus) as Array<keyof typeof uiToDbActionStatus>) {
      const [row] = await db.query<{ db: string }>(`select app.action_status_to_db($1) as db`, [ui]);
      expect(`${ui}:${row.db}`).toBe(`${ui}:${uiToDbActionStatus[ui]}`);
    }
    await expect(db.query(`select app.action_status_to_db('forjado')`)).rejects.toThrow(/status desconhecido/);
  });

  it('app.na_reason_is_valid ≡ isValidNotApplicableReason', async () => {
    const samples = ['', '   ', '..........', 'curta', 'Justificativa valida de verdade.', '---- ____ ....', 'a'.repeat(10)];
    for (const s of samples) {
      const [row] = await db.query<{ ok: boolean }>(`select app.na_reason_is_valid($1) as ok`, [s]);
      expect(`${JSON.stringify(s)}:${row.ok}`).toBe(`${JSON.stringify(s)}:${isValidNotApplicableReason(s)}`);
    }
  });
});

// ===========================================================================
// WORKFLOW REAL VIA RPC — papéis, segregação, terminal, esperas distintas
// ===========================================================================
describe('workflow do plano no servidor (RPC + trigger)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('plano novo nasce not_started com autoria do autenticado (nunca do payload)', async () => {
    const planId = await createPlan(db, ID.uGcA);
    const [row] = await db.query<{ status: string; created_by: string }>(
      `select status::text, created_by from public.action_plans where id = $1`, [planId]);
    expect(row.status).toBe('open');
    expect(row.created_by).toBe(ID.uGcA);
  });

  it('esperas persistem SEPARADAS e sobrevivem à releitura (waiting_partner ≠ blocked)', async () => {
    const planId = await createPlan(db, ID.uGcA);
    await setStatus(db, ID.uGcA, planId, 'in_progress');
    await setStatus(db, ID.uGcA, planId, 'waiting_partner');
    let [row] = await db.query<{ status: string; ui: string }>(
      `select status::text, app.action_status_to_ui(status) as ui from public.action_plans where id=$1`, [planId]);
    expect(row.status).toBe('waiting_partner');
    expect(row.ui).toBe('waiting_partner');

    await setStatus(db, ID.uGcA, planId, 'waiting_internal');
    [row] = await db.query(
      `select status::text, app.action_status_to_ui(status) as ui from public.action_plans where id=$1`, [planId]);
    expect(row.status).toBe('blocked'); // compatibilidade legada preservada
    expect(row.ui).toBe('waiting_internal');
  });

  it('não iniciado NÃO pula para concluído; vencido NÃO é escolha manual; mesmo status é no-op', async () => {
    const planId = await createPlan(db, ID.uGcA);
    await db.asUser(ID.uGcA, (tx) => tx.expectError(`select public.update_action_status($1,'completed')`, [planId]));
    await db.asUser(ID.uGcA, (tx) => tx.expectError(`select public.update_action_status($1,'overdue')`, [planId]));
    const res = await setStatus(db, ID.uGcA, planId, 'not_started'); // no-op idempotente
    expect((res[0].plan as { status: string }).status).toBe('not_started');
  });

  it('GC conclui mas NÃO valida; Coordenação valida plano de outro e a trilha persiste', async () => {
    const planId = await createPlan(db, ID.uGcA);
    await setStatus(db, ID.uGcA, planId, 'in_progress');
    await setStatus(db, ID.uGcA, planId, 'completed');

    await db.asUser(ID.uGcA, (tx) => tx.expectError(`select public.update_action_status($1,'validated')`, [planId]));

    const res = await setStatus(db, ID.uCoord1, planId, 'validated');
    const dto = res[0].plan as { status: string; validatorName: string; validatedAt: string };
    expect(dto.status).toBe('validated');
    expect(dto.validatorName).toBe('Coord1 Fic'); // nome funcional, sem UUID
    expect(dto.validatedAt).toBeTruthy();

    const [row] = await db.query<{ status: string; validated_by: string; validated_at: string }>(
      `select status::text, validated_by, validated_at::text from public.action_plans where id=$1`, [planId]);
    expect(row.status).toBe('validated');
    expect(row.validated_by).toBe(ID.uCoord1);
    expect(row.validated_at).toBeTruthy();
  });

  it('GC enxerga o nome do validador pela projeção mesmo sob RLS de users', async () => {
    const planId = await createPlan(db, ID.uGcA);
    await setStatus(db, ID.uGcA, planId, 'in_progress');
    await setStatus(db, ID.uGcA, planId, 'completed');
    await setStatus(db, ID.uReg, planId, 'validated'); // Regional também valida
    const rows = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ validatorName: string; validatedAt: string; status: string }>(
        `select "validatorName","validatedAt","status" from public.ui_action_plans where "id"=$1`, [planId]));
    expect(rows[0].status).toBe('validated');
    expect(rows[0].validatorName).toBe('Regional Fic');
    expect(rows[0].validatedAt).toBeTruthy();
  });

  it('Administração valida plano de outro usuário', async () => {
    const planId = await createPlan(db, ID.uGcA);
    await setStatus(db, ID.uGcA, planId, 'in_progress');
    await setStatus(db, ID.uGcA, planId, 'completed');
    const res = await setStatus(db, ID.uAdmin, planId, 'validated');
    expect((res[0].plan as { status: string }).status).toBe('validated');
  });

  it('criador não valida o próprio plano, mesmo com papel validador', async () => {
    const planId = await createPlan(db, ID.uCoord1); // coordenador cria em opA
    await setStatus(db, ID.uCoord1, planId, 'in_progress');
    await setStatus(db, ID.uCoord1, planId, 'completed');
    const e = await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`select public.update_action_status($1,'validated')`, [planId]));
    expect(String(e)).toMatch(/quem criou o plano/);
    const res = await setStatus(db, ID.uAdmin, planId, 'validated'); // outro validador pode
    expect((res[0].plan as { status: string }).status).toBe('validated');
  });

  it('validado é TERMINAL: não reabre, não edita, não muda', async () => {
    const planId = await createPlan(db, ID.uGcA);
    await setStatus(db, ID.uGcA, planId, 'in_progress');
    await setStatus(db, ID.uGcA, planId, 'completed');
    await setStatus(db, ID.uCoord1, planId, 'validated');

    await db.asUser(ID.uCoord1, (tx) => tx.expectError(`select public.update_action_status($1,'in_progress')`, [planId]));
    await db.asUser(ID.uAdmin, (tx) => tx.expectError(`select public.update_action_status($1,'completed')`, [planId]));
    // Edição de conteúdo também é recusada.
    await db.asUser(ID.uGcA, (tx) => tx.expectError(`select public.save_action_plan($1::jsonb)`, [
      JSON.stringify({ id: planId, operationId: ID.opA, themeId: 'I01', action: 'Nova acao', dueDate: '2099-12-31', priority: 'high' }),
    ]));
  });

  it('escrita direta FORJADA pela RLS é recusada pelo trigger (GC tentando validated)', async () => {
    const planId = await createPlan(db, ID.uGcA);
    await setStatus(db, ID.uGcA, planId, 'in_progress');
    await setStatus(db, ID.uGcA, planId, 'completed');
    const e = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`update public.action_plans set status='validated' where id=$1`, [planId]));
    expect(String(e)).toMatch(/coordenacao, regional ou administracao/);
    // E forjar a trilha sem transição também é recusado.
    await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`update public.action_plans set validated_by='${ID.uGcA}', validated_at=now() where id=$1`, [planId]));
    const [row] = await db.query<{ status: string }>(`select status::text from public.action_plans where id=$1`, [planId]);
    expect(row.status).toBe('done'); // nada mudou
  });

  it('trigger também barra autovalidação em escrita direta de validador', async () => {
    const planId = await createPlan(db, ID.uCoord1);
    await setStatus(db, ID.uCoord1, planId, 'in_progress');
    await setStatus(db, ID.uCoord1, planId, 'completed');
    const e = await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`update public.action_plans set status='validated' where id=$1`, [planId]));
    expect(String(e)).toMatch(/quem criou o plano/);
  });

  it('legado: done permanece Concluído e blocked permanece Aguardando área interna; sem autoria, validação bloqueada', async () => {
    // Registros antigos inseridos sem JWT (como uma migração/carga histórica).
    await db.exec(`
      insert into public.action_plans (id, operation_id, description, due_date, priority, status, created_by)
      values ('00000000-0000-0000-0000-00000000ad01','${ID.opA}','Legado done','2099-01-01','high','done', null),
             ('00000000-0000-0000-0000-00000000ad02','${ID.opA}','Legado blocked','2099-01-01','high','blocked', null);
    `);
    const rows = await db.asUser(ID.uCoord1, (tx) =>
      tx.query<{ id: string; status: string }>(
        `select "id","status" from public.ui_action_plans where "id" in ('00000000-0000-0000-0000-00000000ad01','00000000-0000-0000-0000-00000000ad02') order by "id"`));
    expect(rows.map((r) => r.status)).toEqual(['completed', 'waiting_internal']); // done NÃO virou validated
    const e = await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`select public.update_action_status('00000000-0000-0000-0000-00000000ad01','validated')`));
    expect(String(e)).toMatch(/sem autoria registrada/);
  });

  it('edição de conteúdo via save_action_plan NÃO muda status (mudança é exclusiva da RPC de status)', async () => {
    const planId = await createPlan(db, ID.uGcA);
    await setStatus(db, ID.uGcA, planId, 'in_progress');
    await db.asUser(ID.uGcA, (tx) => tx.query(`select public.save_action_plan($1::jsonb)`, [
      JSON.stringify({ id: planId, operationId: ID.opA, themeId: 'I01', action: 'Acao editada', dueDate: '2099-12-31', priority: 'low', status: 'completed' }),
    ]));
    const [row] = await db.query<{ status: string; action_text: string }>(
      `select status::text, action_text from public.action_plans where id=$1`, [planId]);
    expect(row.action_text).toBe('Acao editada');
    expect(row.status).toBe('in_progress'); // payload de status foi ignorado
  });
});

// ===========================================================================
// NÃO APLICÁVEL — portão de envio, persistência, snapshot
// ===========================================================================
describe('justificativa de não aplicável no servidor (0024/0025)', () => {
  let db: TestDb;
  let evalId: string;
  beforeAll(async () => {
    db = await makeScenario();
    const rows = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: { id: string } }>(`select public.start_evaluation($1,'weekly',$2) as ev`, [ID.opB, ID.uGcB]));
    evalId = rows[0].ev.id;
  }, 30_000);
  afterAll(async () => { await db.close(); });

  it('envio bloqueado: item não aplicável sem justificativa (e com justificativa inútil)', async () => {
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.save_evaluation_answer($1,'I01','{"status":"not_applicable"}'::jsonb)`, [evalId]));
    let e = await db.asUser(ID.uGcB, (tx) => tx.expectError(`select public.submit_evaluation($1)`, [evalId]));
    expect(String(e)).toMatch(/nao aplicavel sem justificativa/);

    for (const inutil of ['   ', '..........', 'curta', '---- ____ ..']) {
      await db.asUser(ID.uGcB, (tx) =>
        tx.query(`select public.save_evaluation_answer($1,'I01',$2::jsonb)`, [evalId, JSON.stringify({ notApplicableReason: inutil })]));
      e = await db.asUser(ID.uGcB, (tx) => tx.expectError(`select public.submit_evaluation($1)`, [evalId]));
      expect(String(e)).toMatch(/nao aplicavel sem justificativa/);
    }
  });

  it('justificativa é trimada, persiste, entra na projeção e libera o envio', async () => {
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.save_evaluation_answer($1,'I01',$2::jsonb)`, [
        evalId, JSON.stringify({ notApplicableReason: '  A loja não opera este segmento.  ' })]));
    const [raw] = await db.query<{ not_applicable_reason: string }>(
      `select not_applicable_reason from public.evaluation_answers where evaluation_id=$1`, [evalId]);
    expect(raw.not_applicable_reason).toBe('A loja não opera este segmento.');

    const rows = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ answers: Array<Record<string, unknown>> }>(
        `select "answers" from public.ui_evaluations where "id"=$1`, [evalId]));
    expect(rows[0].answers[0].notApplicableReason).toBe('A loja não opera este segmento.');

    const sub = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: { status: string } }>(`select public.submit_evaluation($1) as ev`, [evalId]));
    expect(sub[0].ev.status).toBe('submitted');
  });

  it('a justificativa entra no SNAPSHOT oficial na aprovação', async () => {
    await db.asUser(ID.uCoord2, (tx) =>
      tx.query(`select public.validate_evaluation($1,'approved','ok')`, [evalId]));
    const [snap] = await db.query<{ payload: { answers: Array<Record<string, unknown>> } }>(
      `select payload from public.official_snapshots where evaluation_id=$1`, [evalId]);
    expect(snap.payload.answers[0].notApplicableReason).toBe('A loja não opera este segmento.');
  });
});
