/**
 * Guarda de estado no envio (D-04) — migration 0027.
 *
 * DEFEITO QUE ESTES TESTES TRAVAM. Uma avaliação já `submitted` aceitava
 * `submit_evaluation` de novo, sem devolução prévia, e o reenvio ainda mexia em
 * `submitted_at` e `row_version`. A trava existia na 0006 e sumiu quando a 0025
 * reescreveu a função inteira — `v_status` continuou sendo lido e passou a ser
 * descartado.
 *
 * O que interessa não é só "o segundo envio dá erro": é que a recusa seja
 * INERTE. Por isso cada teste de recusa compara o estado ANTES e DEPOIS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, anexarEvidencia, ID } from './testing/fixtures';

interface EstadoEnvio {
  status: string;
  submitted_at: string | null;
  row_version: number;
}

async function lerEstado(db: TestDb, evalId: string): Promise<EstadoEnvio> {
  const r = await db.query<EstadoEnvio>(
    `select status::text as status, submitted_at::text as submitted_at, row_version
       from public.evaluations where id = $1`,
    [evalId],
  );
  return r[0];
}

/**
 * Descarta a avaliação e o que depende dela, para que o próximo teste comece de
 * um rascunho novo (`start_evaluation` reaproveita avaliação aberta do mesmo
 * período). Roda como superuser: é limpeza de cenário, não parte do contrato.
 */
async function limpar(db: TestDb, evalId: string): Promise<void> {
  await db.exec(`
    delete from public.validations       where evaluation_id = '${evalId}';
    delete from public.official_snapshots where evaluation_id = '${evalId}';
    delete from public.action_plans      where evaluation_id = '${evalId}';
    delete from public.evaluations       where id = '${evalId}';
  `);
}

/** Avaliação de opB, autorada por uGcB, com todos os portões de envio satisfeitos. */
async function avaliacaoPronta(db: TestDb): Promise<string> {
  const draft = (await db.asUser(ID.uGcB, (tx) =>
    tx.query<{ ev: { id: string } }>(`select public.start_evaluation($1,$2,$3) as ev`,
      [ID.opB, 'weekly', ID.uGcB])))[0].ev;
  await db.asUser(ID.uGcB, (tx) =>
    tx.query(`select public.save_evaluation_answer($1,$2,$3::jsonb)`,
      [draft.id, 'I01', JSON.stringify({ status: 'green' })]));
  // Evidência pelo fluxo oficial: reserva → upload → confirmação (0028).
  await anexarEvidencia(db, { userId: ID.uGcB, evaluationId: draft.id, themeId: 'I01' });
  return draft.id;
}

describe('submit_evaluation — guarda de estado (D-04)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
  }, 30_000);
  afterAll(async () => { await db.close(); });

  it('rascunho envia', async () => {
    const id = await avaliacaoPronta(db);
    const ev = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: { status: string } }>(`select public.submit_evaluation($1) as ev`, [id])))[0].ev;
    expect(ev.status).toBe('submitted');
    // Limpa o estado para os testes seguintes não herdarem esta avaliação.
    await limpar(db, id);
  });

  it('enviada NÃO reenvia sem devolução prévia', async () => {
    const id = await avaliacaoPronta(db);
    await db.asUser(ID.uGcB, (tx) => tx.query(`select public.submit_evaluation($1)`, [id]));

    const erro = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.submit_evaluation($1)`, [id]));
    expect(erro.message).toMatch(/rascunho\/devolvida/);
    await limpar(db, id);
  });

  it('a recusa não altera submitted_at nem row_version', async () => {
    const id = await avaliacaoPronta(db);
    await db.asUser(ID.uGcB, (tx) => tx.query(`select public.submit_evaluation($1)`, [id]));
    const antes = await lerEstado(db, id);

    await db.asUser(ID.uGcB, (tx) => tx.expectError(`select public.submit_evaluation($1)`, [id]));

    const depois = await lerEstado(db, id);
    expect(depois.submitted_at).toBe(antes.submitted_at);
    expect(depois.row_version).toBe(antes.row_version);
    expect(depois.status).toBe('submitted');
    await limpar(db, id);
  });

  it('a recusa não produz efeito lateral algum (validação, snapshot, resposta)', async () => {
    const id = await avaliacaoPronta(db);
    await db.asUser(ID.uGcB, (tx) => tx.query(`select public.submit_evaluation($1)`, [id]));

    const contar = async () => (await db.query<{ v: number; s: number; a: number }>(
      `select (select count(*) from public.validations where evaluation_id = $1)::int as v,
              (select count(*) from public.official_snapshots where evaluation_id = $1)::int as s,
              (select count(*) from public.evaluation_answers where evaluation_id = $1)::int as a`,
      [id]))[0];
    const antes = await contar();

    await db.asUser(ID.uGcB, (tx) => tx.expectError(`select public.submit_evaluation($1)`, [id]));

    expect(await contar()).toEqual(antes);
    await limpar(db, id);
  });

  it('toque duplo: a segunda chamada seguida é recusada, não é absorvida em silêncio', async () => {
    // PGlite tem UMA conexão, então não há paralelismo real aqui — o que este
    // teste cobre é o caso do cliente: dois toques em sequência. A corrida de
    // verdade (duas transações simultâneas) é serializada pelo `for update` da
    // 0027 e foi exercitada no staging.
    const id = await avaliacaoPronta(db);
    const primeira = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: { status: string } }>(`select public.submit_evaluation($1) as ev`, [id])))[0].ev;
    const segunda = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.submit_evaluation($1)`, [id]));

    expect(primeira.status).toBe('submitted');
    expect(segunda).toBeInstanceOf(Error);
    const estado = await lerEstado(db, id);
    expect(estado.status).toBe('submitted');
    await limpar(db, id);
  });

  it('devolvida reenvia (o caminho legítimo de volta ao envio)', async () => {
    const id = await avaliacaoPronta(db);
    await db.asUser(ID.uGcB, (tx) => tx.query(`select public.submit_evaluation($1)`, [id]));
    // uCoord2 é o coordenador da coordenadoria de opB e não é o autor.
    await db.asUser(ID.uCoord2, (tx) =>
      tx.query(`select public.validate_evaluation($1,$2,$3)`, [id, 'returned', 'ajustar item I01']));
    expect((await lerEstado(db, id)).status).toBe('returned');

    const ev = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: { status: string } }>(`select public.submit_evaluation($1) as ev`, [id])))[0].ev;
    expect(ev.status).toBe('submitted');
    await limpar(db, id);
  });

  it('aprovada NÃO reenvia', async () => {
    const id = await avaliacaoPronta(db);
    await db.asUser(ID.uGcB, (tx) => tx.query(`select public.submit_evaluation($1)`, [id]));
    await db.asUser(ID.uCoord2, (tx) =>
      tx.query(`select public.validate_evaluation($1,$2,$3)`, [id, 'approved', 'ok']));
    const antes = await lerEstado(db, id);
    expect(antes.status).toBe('approved');

    const erro = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.submit_evaluation($1)`, [id]));
    expect(erro.message).toMatch(/rascunho\/devolvida/);

    const depois = await lerEstado(db, id);
    expect(depois.status).toBe('approved');
    expect(depois.submitted_at).toBe(antes.submitted_at);
    expect(depois.row_version).toBe(antes.row_version);
  });
});
