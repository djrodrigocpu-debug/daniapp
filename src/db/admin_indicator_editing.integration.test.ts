/**
 * `admin_update_indicator` e `admin_delete_indicator` (0022) em banco REAL
 * (PGlite/PG18).
 *
 * O QUE ESTÁ SENDO FECHADO. Até 0021 o botão "Excluir" do Admin devolvia HTTP
 * 409 para QUALQUER indicador: a RPC apagava só a definição, e a FK das versões
 * não tem cascade. Como toda definição nasce com a versão 1, nunca existiu um
 * indicador excluível. Aqui provamos que o caminho limpo agora funciona E que as
 * recusas de D-05/T05 continuam valendo — as duas coisas, porque "passou a
 * apagar" sem "continua recusando o que foi medido" seria uma regressão pior que
 * o defeito original.
 *
 * Também provamos a correção de identidade/rótulo, que simplesmente não existia.
 *
 * Dados 100% SINTÉTICOS (§23). `IND-FIC` da fixture já tem medição em 2099-01 —
 * é o caso "já medido". Os indicadores temporários deste teste nascem aqui.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

interface IndicatorDto {
  id: string;
  code: string;
  name: string;
  lifecycle: string;
}

/** Cria um indicador pelo caminho canônico e devolve o UUID gerado. */
async function criarIndicador(db: TestDb, code: string, name: string): Promise<string> {
  const dto = await db.asUser(ID.uAdmin, async (tx) => {
    const rows = await tx.query<{ dto: IndicatorDto }>(
      `select public.admin_create_indicator($1, $2, $3::jsonb) as dto`,
      [code, name, JSON.stringify({ unit: '%', direction: 'higher_better', target: 50, yellowTolerance: 10, weight: 1 })],
    );
    return rows[0].dto;
  });
  return dto.id;
}

async function contarPorDefinicao(db: TestDb, indicatorId: string) {
  const rows = await db.query<{ defs: number; vers: number }>(
    `select
       (select count(*)::int from public.indicator_definitions where id = $1) as defs,
       (select count(*)::int from public.indicator_versions where definition_id = $1) as vers`,
    [indicatorId],
  );
  return rows[0];
}

describe('admin_delete_indicator apaga versões e definição em uma transação', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); await seedScenario(db); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('exclui indicador SEM uso — o caso que devolvia 409 mesmo estando limpo', async () => {
    const id = await criarIndicador(db, 'TMP-DEL-OK', 'Temporario excluivel');
    expect(await contarPorDefinicao(db, id)).toEqual({ defs: 1, vers: 1 });

    await db.asUser(ID.uAdmin, (tx) => tx.query(`select public.admin_delete_indicator($1)`, [id]));

    expect(await contarPorDefinicao(db, id)).toEqual({ defs: 0, vers: 0 });
  });

  it('exclui indicador com MAIS DE UMA versão — nenhuma versão fica órfã', async () => {
    const id = await criarIndicador(db, 'TMP-DEL-V2', 'Temporario com duas versoes');
    await db.asUser(ID.uAdmin, (tx) =>
      tx.query(`select public.admin_add_indicator_version($1, $2::jsonb)`, [
        id,
        JSON.stringify({ unit: '%', direction: 'lower_better', target: 5, yellowTolerance: 20, weight: 3 }),
      ]),
    );
    expect(await contarPorDefinicao(db, id)).toEqual({ defs: 1, vers: 2 });

    await db.asUser(ID.uAdmin, (tx) => tx.query(`select public.admin_delete_indicator($1)`, [id]));

    expect(await contarPorDefinicao(db, id)).toEqual({ defs: 0, vers: 0 });
  });

  it('RECUSA excluir indicador já medido e não apaga nada (D-05/T05)', async () => {
    const erro = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select public.admin_delete_indicator($1)`, [ID.indDef]),
    );
    expect(erro.message).toMatch(/ja medido/i);
    expect(erro.message).toMatch(/inative/i);

    // A definição e a versão medida seguem intactas.
    expect(await contarPorDefinicao(db, ID.indDef)).toEqual({ defs: 1, vers: 1 });
  });

  it('RECUSA excluir indicador com resultado lançado, mesmo sem medição', async () => {
    const id = await criarIndicador(db, 'TMP-DEL-RES', 'Temporario com resultado');
    await db.exec(`
      insert into public.indicator_results (operation_id, indicator_id, period, target, actual)
      values ('${ID.opA}', '${id}', '2099-03', 50, 41);
    `);

    const erro = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select public.admin_delete_indicator($1)`, [id]),
    );
    expect(erro.message).toMatch(/resultado/i);
    expect(await contarPorDefinicao(db, id)).toEqual({ defs: 1, vers: 1 });
  });

  it('RECUSA exclusão para quem não é administrador', async () => {
    const id = await criarIndicador(db, 'TMP-DEL-RLS', 'Temporario protegido');
    const erro = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.admin_delete_indicator($1)`, [id]),
    );
    expect(erro.message).toMatch(/administrador/i);
    expect(await contarPorDefinicao(db, id)).toEqual({ defs: 1, vers: 1 });
  });
});

describe('admin_update_indicator corrige identidade e rótulo sem versionar', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); await seedScenario(db); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('corrige código e nome, normaliza o código e NÃO cria versão nova', async () => {
    const id = await criarIndicador(db, 'TMP-UPD', 'Nome errado');
    const antes = await contarPorDefinicao(db, id);

    const dto = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: IndicatorDto }>(
        `select public.admin_update_indicator($1, $2, $3) as dto`,
        [id, '  tmp-upd-ok  ', '  Nome certo  '],
      );
      return rows[0].dto;
    });

    expect(dto.code).toBe('TMP-UPD-OK');
    expect(dto.name).toBe('Nome certo');
    expect(await contarPorDefinicao(db, id)).toEqual(antes); // versões inalteradas
  });

  it('RECUSA código já usado por outro indicador, nomeando o código', async () => {
    const id = await criarIndicador(db, 'TMP-UPD-A', 'A');
    await criarIndicador(db, 'TMP-UPD-B', 'B');

    const erro = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select public.admin_update_indicator($1, $2, $3)`, [id, 'TMP-UPD-B', 'A']),
    );
    expect(erro.message).toMatch(/TMP-UPD-B/);
  });

  it('RECUSA código vazio e nome vazio', async () => {
    const id = await criarIndicador(db, 'TMP-UPD-VAZIO', 'Preenchido');
    await db.asUser(ID.uAdmin, async (tx) => {
      expect((await tx.expectError(`select public.admin_update_indicator($1, $2, $3)`, [id, '   ', 'Nome'])).message)
        .toMatch(/obrigatorios/i);
      expect((await tx.expectError(`select public.admin_update_indicator($1, $2, $3)`, [id, 'TMP-X', '  '])).message)
        .toMatch(/obrigatorios/i);
    });
  });

  it('indicador já medido: recusa trocar o CÓDIGO, mas aceita corrigir o NOME', async () => {
    const erro = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select public.admin_update_indicator($1, $2, $3)`, [ID.indDef, 'IND-OUTRO', 'Indicador Fic']),
    );
    expect(erro.message).toMatch(/ja medido/i);

    const dto = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: IndicatorDto }>(
        `select public.admin_update_indicator($1, $2, $3) as dto`,
        [ID.indDef, 'IND-FIC', 'Indicador Ficticio Corrigido'],
      );
      return rows[0].dto;
    });
    expect(dto.code).toBe('IND-FIC');
    expect(dto.name).toBe('Indicador Ficticio Corrigido');
  });

  it('RECUSA edição para quem não é administrador', async () => {
    const id = await criarIndicador(db, 'TMP-UPD-RLS', 'Protegido');
    const erro = await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`select public.admin_update_indicator($1, $2, $3)`, [id, 'TMP-HACK', 'Hack']),
    );
    expect(erro.message).toMatch(/administrador/i);
  });

  it('a nova versão HONRA a vigência enviada — antes ela caía em now() calada', async () => {
    const id = await criarIndicador(db, 'TMP-VIG', 'Vigencia');
    await db.asUser(ID.uAdmin, (tx) =>
      tx.query(`select public.admin_add_indicator_version($1, $2::jsonb)`, [
        id,
        JSON.stringify({ unit: '%', direction: 'higher_better', target: 9, yellowTolerance: 1, weight: 1, effectiveFrom: '2099-06-15' }),
      ]),
    );
    const rows = await db.query<{ dia: string }>(
      `select to_char(effective_from, 'YYYY-MM-DD') as dia
         from public.indicator_versions where definition_id = $1 and version_number = 2`,
      [id],
    );
    expect(rows[0].dia).toBe('2099-06-15');
  });

  it('vigência inválida é RECUSADA em vez de virar now()', async () => {
    const id = await criarIndicador(db, 'TMP-VIG-RUIM', 'Vigencia ruim');
    const erro = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select public.admin_add_indicator_version($1, $2::jsonb)`, [
        id,
        JSON.stringify({ unit: '%', direction: 'higher_better', target: 9, yellowTolerance: 1, weight: 1, effectiveFrom: '15/06/2099' }),
      ]),
    );
    expect(erro.message).toMatch(/vigencia invalida/i);
  });

  it('RECUSA indicador inexistente', async () => {
    const erro = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select public.admin_update_indicator($1, $2, $3)`, [
        '00000000-0000-0000-0000-0000000000ff', 'TMP-NAO', 'Nao existe',
      ]),
    );
    expect(erro.message).toMatch(/inexistente/i);
  });
});
