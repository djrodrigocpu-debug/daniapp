/**
 * `save_indicator_result` (0020) em banco REAL (PGlite/PG18) — Fatia 6C.
 *
 * O que está sendo fechado: até 0019 NÃO existia caminho operacional para criar
 * `indicator_results`/`measurements` — `update_indicator_result` só atualiza
 * linha preexistente. Aqui provamos criação, atualização sem duplicação,
 * atomicidade resultado+medição, validações e escopo — e o vínculo canônico do
 * plano operacional da Gestão Assistida (evaluation_id NULO, operação por UUID).
 *
 * Dados 100% SINTÉTICOS (§23). A fixture indDef/indVer é o indicador fictício
 * `IND-FIC` (%/higher_better/meta 80) com uma medição pré-existente em 2099-01.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

async function makeScenario(): Promise<TestDb> {
  const db = await createTestDb();
  await seedScenario(db);
  return db;
}

const PERIOD = '2099-02'; // livre na fixture — a medição semeada é 2099-01

interface ResultDto {
  id: string;
  operationId: string;
  indicatorId: string;
  period: string;
  target: number;
  actual: number;
  previousActual: number;
  diagnosis: string | null;
  observation: string | null;
}

function callSave(db: TestDb, userId: string, input: Record<string, unknown>) {
  return db.asUser(userId, async (tx) => {
    const rows = await tx.query<{ dto: ResultDto }>(
      `select public.save_indicator_result($1::jsonb) as dto`,
      [JSON.stringify(input)],
    );
    return rows[0].dto;
  });
}

describe('save_indicator_result cria e atualiza o resultado de ponta a ponta', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('cria o PRIMEIRO resultado e a medição na versão vigente, atomicamente', async () => {
    const dto = await callSave(db, ID.uGcA, {
      operationId: ID.opA, indicatorId: ID.indDef, period: PERIOD, actual: 72.5,
    });
    expect(dto.operationId).toBe(ID.opA);
    expect(dto.indicatorId).toBe(ID.indDef);
    expect(dto.period).toBe(PERIOD);
    expect(dto.actual).toBe(72.5);          // decimal preservado
    expect(dto.target).toBe(80);            // meta ausente = meta da versão vigente
    expect(dto.previousActual).toBe(0);

    const counts = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ results: number; meas: number; meas_actual: string }>(
        `select
           (select count(*)::int from public.indicator_results
             where operation_id = $1 and indicator_id = $2 and period = $3)  as results,
           (select count(*)::int from public.measurements
             where operation_id = $1 and indicator_version_id = $4 and period = $3) as meas,
           (select actual_value::text from public.measurements
             where operation_id = $1 and indicator_version_id = $4 and period = $3) as meas_actual`,
        [ID.opA, ID.indDef, PERIOD, ID.indVer],
      ));
    expect(counts[0].results).toBe(1);
    expect(counts[0].meas).toBe(1);
    expect(Number(counts[0].meas_actual)).toBe(72.5);
  });

  it('leitura após escrita devolve o valor correto pela MESMA fonte da tela', async () => {
    const rows = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ actual: string; target: string }>(
        `select actual::text, target::text from public.indicator_results
          where operation_id = $1 and indicator_id = $2 and period = $3`,
        [ID.opA, ID.indDef, PERIOD],
      ));
    expect(rows.length).toBe(1);
    expect(Number(rows[0].actual)).toBe(72.5);
  });

  it('ATUALIZA o resultado existente sem duplicar e move previous_actual', async () => {
    const dto = await callSave(db, ID.uGcA, {
      operationId: ID.opA, indicatorId: ID.indDef, period: PERIOD, actual: 91, target: 85,
    });
    expect(dto.actual).toBe(91);
    expect(dto.target).toBe(85);
    expect(dto.previousActual).toBe(72.5);  // o realizado anterior vira histórico

    const counts = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ results: number; meas: number }>(
        `select
           (select count(*)::int from public.indicator_results
             where operation_id = $1 and indicator_id = $2 and period = $3) as results,
           (select count(*)::int from public.measurements
             where operation_id = $1 and indicator_version_id = $4 and period = $3) as meas`,
        [ID.opA, ID.indDef, PERIOD, ID.indVer],
      ));
    expect(counts[0].results).toBe(1);      // nenhuma duplicação
    expect(counts[0].meas).toBe(1);         // medição do período atualizada, não duplicada
  });

  it('zero é valor VÁLIDO e é preservado — nunca vira default', async () => {
    const dto = await callSave(db, ID.uGcA, {
      operationId: ID.opA, indicatorId: ID.indDef, period: '2099-03', actual: 0, target: 0,
    });
    expect(dto.actual).toBe(0);
    expect(dto.target).toBe(0);
  });

  it('período ausente usa o mês corrente do servidor', async () => {
    const dto = await callSave(db, ID.uGcA, {
      operationId: ID.opA, indicatorId: ID.indDef, actual: 10,
    });
    expect(dto.period).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it('operação inexistente é recusada', async () => {
    const erro = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.save_indicator_result($1::jsonb)`,
        [JSON.stringify({ operationId: '00000000-0000-0000-0000-00000000dead', indicatorId: ID.indDef, actual: 1 })]));
    expect(erro.message).toMatch(/operacao inexistente/);
  });

  it('operationId que não é UUID é recusado — nunca coagido', async () => {
    const erro = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.save_indicator_result($1::jsonb)`,
        [JSON.stringify({ operationId: 'PERF_OP', indicatorId: ID.indDef, actual: 1 })]));
    expect(erro.message).toMatch(/operationId invalido/);
  });

  it('indicador inexistente é recusado', async () => {
    const erro = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.save_indicator_result($1::jsonb)`,
        [JSON.stringify({ operationId: ID.opA, indicatorId: '00000000-0000-0000-0000-00000000beef', actual: 1 })]));
    expect(erro.message).toMatch(/indicador inexistente/);
  });

  it('acesso fora do escopo é recusado (GC da outra operação)', async () => {
    const erro = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.save_indicator_result($1::jsonb)`,
        [JSON.stringify({ operationId: ID.opA, indicatorId: ID.indDef, actual: 1 })]));
    expect(erro.message).toMatch(/fora do escopo/);
  });

  it('valor não numérico ou ausente é recusado e NADA é gravado (atomicidade)', async () => {
    const before = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ r: number; m: number }>(
        `select (select count(*)::int from public.indicator_results) r,
                (select count(*)::int from public.measurements) m`));

    await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.save_indicator_result($1::jsonb)`,
        [JSON.stringify({ operationId: ID.opA, indicatorId: ID.indDef, period: '2099-04', actual: 'muito bom' })]));
    await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.save_indicator_result($1::jsonb)`,
        [JSON.stringify({ operationId: ID.opA, indicatorId: ID.indDef, period: '2099-04' })]));
    await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.save_indicator_result($1::jsonb)`,
        [JSON.stringify({ operationId: ID.opA, indicatorId: ID.indDef, period: '2099-04', actual: 5, target: 'x' })]));
    await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.save_indicator_result($1::jsonb)`,
        [JSON.stringify({ operationId: ID.opA, indicatorId: ID.indDef, period: '2099/04', actual: 5 })]));

    const after = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ r: number; m: number }>(
        `select (select count(*)::int from public.indicator_results) r,
                (select count(*)::int from public.measurements) m`));
    expect(after[0]).toEqual(before[0]);   // nem resultado, nem medição órfã
  });

  it('anon não executa a função', async () => {
    await db.asAnon((tx) =>
      tx.expectError(`select public.save_indicator_result($1::jsonb)`,
        [JSON.stringify({ operationId: ID.opA, indicatorId: ID.indDef, actual: 1 })]));
  });
});

describe('plano operacional da Gestão Assistida usa vínculo canônico', () => {
  let db: TestDb;
  beforeAll(async () => { db = await makeScenario(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('evaluationId vazio vira evaluation_id NULO com operação por UUID', async () => {
    const dto = await db.asUser(ID.uGcA, async (tx) => {
      const rows = await tx.query<{ plan: { id: string; evaluationId: string; operationId: string; themeId: string } }>(
        `select public.save_action_plan($1::jsonb) as plan`,
        [JSON.stringify({
          operationId: ID.opA, evaluationId: '', themeId: ID.indDef,
          problem: 'Indicador fic abaixo da meta', action: 'Plano sintetico', owner: 'GC fic',
          dueDate: '2099-03-15', priority: 'high', status: 'not_started',
        })],
      );
      return rows[0].plan;
    });
    expect(dto.operationId).toBe(ID.opA);
    expect(dto.evaluationId).toBe('');      // projeção de NULL

    const raw = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ evaluation_id: string | null; theme_code: string }>(
        `select evaluation_id, theme_code from public.action_plans where id = $1`, [dto.id]));
    expect(raw[0].evaluation_id).toBeNull();          // nenhum texto em coluna UUID
    expect(raw[0].theme_code).toBe(ID.indDef);        // vínculo por UUID canônico do indicador

    // Reaparece na MESMA coleção corporativa que a tela consome.
    const view = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ id: string; evaluationId: string }>(
        `select "id", "evaluationId" from public.ui_action_plans where "id" = $1`, [dto.id]));
    expect(view.length).toBe(1);
    expect(view[0].evaluationId).toBe('');
  });

  it('salvar novamente com o MESMO id atualiza — clique repetido não duplica', async () => {
    const before = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.action_plans where operation_id = $1`, [ID.opA]));

    const first = await db.asUser(ID.uGcA, async (tx) => {
      const rows = await tx.query<{ plan: { id: string } }>(
        `select public.save_action_plan($1::jsonb) as plan`,
        [JSON.stringify({
          operationId: ID.opA, evaluationId: '', themeId: ID.indDef,
          problem: 'P', action: 'A', owner: 'O', dueDate: '2099-03-20', priority: 'medium', status: 'not_started',
        })],
      );
      return rows[0].plan;
    });
    await db.asUser(ID.uGcA, (tx) =>
      tx.query(`select public.save_action_plan($1::jsonb)`,
        [JSON.stringify({
          id: first.id, operationId: ID.opA, evaluationId: '', themeId: ID.indDef,
          problem: 'P2', action: 'A2', owner: 'O', dueDate: '2099-03-21', priority: 'medium', status: 'not_started',
        })]));

    const after = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.action_plans where operation_id = $1`, [ID.opA]));
    expect(after[0].n).toBe(before[0].n + 1);        // um único plano novo
  });

  it('plano de AVALIAÇÃO continua funcionando com evaluation_id preenchido', async () => {
    const dto = await db.asUser(ID.uGcA, async (tx) => {
      const rows = await tx.query<{ plan: { id: string; evaluationId: string } }>(
        `select public.save_action_plan($1::jsonb) as plan`,
        [JSON.stringify({
          operationId: ID.opA, evaluationId: ID.evalA, themeId: 'I01',
          problem: 'Nao conformidade fic', action: 'Corrigir', owner: 'GC fic',
          dueDate: '2099-03-25', priority: 'high', status: 'not_started',
        })],
      );
      return rows[0].plan;
    });
    expect(dto.evaluationId).toBe(ID.evalA);
    const raw = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ evaluation_id: string | null }>(
        `select evaluation_id from public.action_plans where id = $1`, [dto.id]));
    expect(raw[0].evaluation_id).toBe(ID.evalA);
  });
});
