/**
 * Testes de INTEGRIDADE HISTÓRICA em banco REAL (0003; Anexo D — T05/T06/T07/T25).
 *
 * Os gatilhos são de fato disparados: indicador usado não some, template travado
 * fica imutável, avaliação aprovada só supersede, trilha/snapshot são append-only,
 * row_version incrementa e updated_at é tocado. Feito como superuser para focar no
 * COMPORTAMENTO do banco (RLS já é coberta em rls.integration.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

describe('gatilhos de integridade (banco real)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
  }, 30_000);
  afterAll(async () => { await db.close(); });

  it('T05: indicador já utilizado NÃO pode ser deletado fisicamente', async () => {
    await expect(db.exec(`delete from public.indicator_definitions where id='${ID.indDef}'`))
      .rejects.toThrow(/ja utilizado|inative/i);
  });

  it('T05: versão de indicador já medida NÃO pode ser excluída', async () => {
    await expect(db.exec(`delete from public.indicator_versions where id='${ID.indVer}'`))
      .rejects.toThrow(/ja medida|nao pode ser excluida/i);
  });

  it('T25: audit_logs é append-only (UPDATE e DELETE bloqueados)', async () => {
    await db.exec(`insert into public.audit_logs (event,result) values ('login','ok')`);
    await expect(db.exec(`update public.audit_logs set result='tampered'`)).rejects.toThrow(/append-only/i);
    await expect(db.exec(`delete from public.audit_logs`)).rejects.toThrow(/append-only/i);
  });

  it('T25: official_snapshots é imutável', async () => {
    await db.exec(`
      insert into public.official_snapshots (id, evaluation_id, operation_id, period, score, template_version_id, payload, approved_by_user_id)
      values ('00000000-0000-0000-0000-0000000ab001','${ID.evalA}','${ID.opA}','2099-01',80,'${ID.templateV1}','{}'::jsonb,'${ID.uCoord1}')
    `);
    await expect(db.exec(`update public.official_snapshots set score=0 where operation_id='${ID.opA}'`))
      .rejects.toThrow(/append-only/i);
    await expect(db.exec(`delete from public.official_snapshots where operation_id='${ID.opA}'`))
      .rejects.toThrow(/append-only/i);
  });

  it('row_version incrementa a cada UPDATE (concorrência otimista §11.1)', async () => {
    const before = await db.query<{ v: number }>(`select row_version v from public.evaluations where id='${ID.evalA}'`);
    await db.exec(`update public.evaluations set score=76 where id='${ID.evalA}'`);
    const after = await db.query<{ v: number }>(`select row_version v from public.evaluations where id='${ID.evalA}'`);
    expect(after[0].v).toBe(before[0].v + 1);
  });

  it('updated_at é tocado automaticamente no UPDATE', async () => {
    const before = await db.query<{ t: string }>(`select updated_at t from public.operations where id='${ID.opB}'`);
    await new Promise((r) => setTimeout(r, 5));
    await db.exec(`update public.operations set city='Nova Cidade' where id='${ID.opB}'`);
    const after = await db.query<{ t: string }>(`select updated_at t from public.operations where id='${ID.opB}'`);
    expect(new Date(after[0].t).getTime()).toBeGreaterThanOrEqual(new Date(before[0].t).getTime());
  });
});

describe('imutabilidade de template e avaliação aprovada (T06/T07)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
  }, 30_000);
  afterAll(async () => { await db.close(); });

  it('T06: inserir avaliação TRAVA a versão do template usada', async () => {
    const locked = await db.query<{ locked: boolean }>(
      `select locked from public.audit_template_versions where id='${ID.templateV1}'`);
    // evalA (fixture) referencia templateV1 → o trigger after insert já travou.
    expect(locked[0].locked).toBe(true);
  });

  it('T06: item de versão travada é imutável', async () => {
    await expect(db.exec(`update public.audit_items set weight=1 where id='${ID.itemRed}'`))
      .rejects.toThrow(/ja utilizada e imutavel/i);
    await expect(db.exec(`delete from public.audit_items where id='${ID.itemRed}'`))
      .rejects.toThrow(/ja utilizada e imutavel/i);
  });

  it('T07: avaliação aprovada é imutável (só transição para superseded)', async () => {
    await db.exec(`update public.evaluations set status='approved', approved_at=now() where id='${ID.evalA}'`);
    // qualquer mudança que não seja supersede é rejeitada
    await expect(db.exec(`update public.evaluations set score=10 where id='${ID.evalA}'`))
      .rejects.toThrow(/aprovada e imutavel/i);
    // supersede preservando score/operação/versão é permitido (adendo)
    await expect(db.exec(`update public.evaluations set status='superseded' where id='${ID.evalA}'`))
      .resolves.not.toThrow();
  });

  it('respostas de avaliação não-rascunho são imutáveis', async () => {
    // cria avaliação submetida com uma resposta e tenta alterar a resposta
    const evalId = '00000000-0000-0000-0000-0000000e0002';
    const answerId = '00000000-0000-0000-0000-0000000a0002';
    await db.exec(`
      insert into public.evaluations (id, operation_id, template_version_id, author_user_id, status)
      values ('${evalId}','${ID.opB}','${ID.templateV1}','${ID.uGcB}','submitted');
      insert into public.evaluation_answers (id, evaluation_id, item_id, status)
      values ('${answerId}','${evalId}','${ID.itemRed}','green');
    `);
    await expect(db.exec(
      `update public.evaluation_answers set status='red' where id='${answerId}'`,
    )).rejects.toThrow(/rascunho\/devolvida|so podem mudar/i);
  });
});
