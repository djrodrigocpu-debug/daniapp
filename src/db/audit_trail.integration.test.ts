/**
 * Trilha de auditoria (D-01) — migration 0029.
 *
 * Depois de 30 dias de simulação com avaliações criadas, enviadas, devolvidas e
 * aprovadas, planos abertos e validados e usuários provisionados,
 * `public.audit_logs` continuava com ZERO linhas: a tabela existia e era
 * imutável, mas ninguém escrevia nela.
 *
 * Estes testes cobrem as duas metades do problema. A primeira é óbvia — o
 * evento passa a existir. A segunda é a que faz a trilha valer alguma coisa:
 * ela precisa ser verdadeira (ator real, entidade real), inforjável, imutável,
 * sem duplicata, sem log de sucesso para transação recusada, e sem carregar
 * dado sensível.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, anexarEvidencia, ID } from './testing/fixtures';

interface Log {
  actor: string | null;
  event: string;
  object_type: string | null;
  object_id: string | null;
  result: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Zera a trilha para que cada bloco conte só os seus eventos — a montagem do
 * cenário já cria usuários, escopos e Parceiros, que agora são auditados.
 *
 * A tabela é append-only por gatilho, então a limpeza desabilita
 * NOMINALMENTE o gatilho de exclusão e o religa em seguida. Nunca
 * `disable trigger all` nem `user`: isso derrubaria também a proteção contra
 * alteração, que não tem motivo nenhum para sair do ar.
 */
async function limparTrilha(db: TestDb): Promise<void> {
  await db.exec(`
    alter table public.audit_logs disable trigger trg_audit_no_delete;
    delete from public.audit_logs;
    alter table public.audit_logs enable trigger trg_audit_no_delete;
  `);
}

async function logs(db: TestDb, evento?: string): Promise<Log[]> {
  return db.query<Log>(
    `select actor_user_id::text as actor, event, object_type, object_id, result, metadata
       from public.audit_logs
      ${evento ? 'where event = $1' : ''}
      order by id`,
    evento ? [evento] : [],
  );
}

async function avaliacaoPronta(db: TestDb): Promise<string> {
  const draft = (await db.asUser(ID.uGcB, (tx) =>
    tx.query<{ ev: { id: string } }>(`select public.start_evaluation($1,$2,$3) as ev`,
      [ID.opB, 'weekly', ID.uGcB])))[0].ev;
  await db.asUser(ID.uGcB, (tx) =>
    tx.query(`select public.save_evaluation_answer($1,$2,$3::jsonb)`,
      [draft.id, 'I01', JSON.stringify({ status: 'green' })]));
  await anexarEvidencia(db, { userId: ID.uGcB, evaluationId: draft.id, themeId: 'I01' });
  return draft.id;
}

describe('audit_logs — o ciclo de vida da avaliação fica registrado', () => {
  let db: TestDb;
  let evalId: string;

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await limparTrilha(db); // ignora o que a montagem do cenário gerou
    evalId = await avaliacaoPronta(db);
  }, 30_000);
  afterAll(async () => { await db.close(); });

  it('criar a avaliação registra o evento, com ator e operação reais', async () => {
    const criados = await logs(db, 'evaluation.created');
    expect(criados).toHaveLength(1);
    expect(criados[0].actor).toBe(ID.uGcB);            // o usuário que agiu
    expect(criados[0].object_type).toBe('evaluation');
    expect(criados[0].object_id).toBe(evalId);         // a entidade real
    expect(criados[0].metadata?.operationId).toBe(ID.opB);
  });

  it('salvar resposta e anexar evidência NÃO viram evento de avaliação (sem ruído)', async () => {
    // Já houve save_evaluation_answer e um anexo na montagem; se cada UPDATE
    // virasse log, a trilha ficaria impossível de ler.
    const eventos = (await logs(db)).map((l) => l.event);
    expect(eventos.filter((e) => e === 'evaluation.created')).toHaveLength(1);
    expect(eventos.filter((e) => e.startsWith('evaluation.'))).toHaveLength(1);
  });

  it('enviar, devolver e aprovar registram um evento cada, com a transição', async () => {
    await db.asUser(ID.uGcB, (tx) => tx.query(`select public.submit_evaluation($1)`, [evalId]));
    const enviada = await logs(db, 'evaluation.submitted');
    expect(enviada).toHaveLength(1);
    expect(enviada[0].actor).toBe(ID.uGcB);
    expect(enviada[0].metadata).toMatchObject({ from: 'draft', to: 'submitted' });

    await db.asUser(ID.uCoord2, (tx) =>
      tx.query(`select public.validate_evaluation($1,$2,$3)`, [evalId, 'returned', 'ajustar I01']));
    const devolvida = await logs(db, 'evaluation.returned');
    expect(devolvida).toHaveLength(1);
    // O ator é o VALIDADOR, não o autor: é o registro de quem decidiu.
    expect(devolvida[0].actor).toBe(ID.uCoord2);

    await db.asUser(ID.uGcB, (tx) => tx.query(`select public.submit_evaluation($1)`, [evalId]));
    await db.asUser(ID.uCoord2, (tx) =>
      tx.query(`select public.validate_evaluation($1,$2,$3)`, [evalId, 'approved', 'ok']));
    const aprovada = await logs(db, 'evaluation.approved');
    expect(aprovada).toHaveLength(1);
    expect(aprovada[0].actor).toBe(ID.uCoord2);

    // Dois envios legítimos (o primeiro e o reenvio após devolução).
    expect(await logs(db, 'evaluation.submitted')).toHaveLength(2);
  });

  it('o snapshot oficial é registrado sem carregar o conteúdo da avaliação', async () => {
    const snap = await logs(db, 'snapshot.created');
    expect(snap).toHaveLength(1);
    expect(snap[0].metadata?.evaluationId).toBe(evalId);
    expect(snap[0].metadata?.operationId).toBe(ID.opB);
    // `payload` tem a avaliação inteira e não pode vazar para a trilha.
    expect(JSON.stringify(snap[0].metadata)).not.toContain('answers');
  });

  it('transação recusada não deixa log de sucesso', async () => {
    const antes = (await logs(db, 'evaluation.submitted')).length;
    // A avaliação está aprovada: o envio é recusado pela guarda da 0027.
    await db.asUser(ID.uGcB, (tx) => tx.expectError(`select public.submit_evaluation($1)`, [evalId]));
    expect((await logs(db, 'evaluation.submitted')).length).toBe(antes);
  });

  it('todo log gravado é de fato consumado (result = success)', async () => {
    const todos = await logs(db);
    expect(todos.length).toBeGreaterThan(0);
    expect(todos.every((l) => l.result === 'success')).toBe(true);
  });
});

describe('audit_logs — plano de ação, indicadores e administração', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await limparTrilha(db);
  }, 30_000);
  afterAll(async () => { await db.close(); });

  it('plano de ação criado e mudança de estado ficam registrados', async () => {
    const draft = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: { id: string } }>(`select public.start_evaluation($1,$2,$3) as ev`,
        [ID.opB, 'weekly', ID.uGcB])))[0].ev;
    const plano = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ p: { id: string } }>(`select public.save_action_plan($1::jsonb) as p`, [JSON.stringify({
        operationId: ID.opB, evaluationId: draft.id, themeId: 'I01', problem: 'p', rootCause: 'c',
        action: 'agir', owner: 'GC B', dueDate: '2099-01-31', priority: 'high',
        expectedEvidence: 'e', status: 'not_started',
      })])))[0].p;

    const criado = await logs(db, 'action_plan.created');
    expect(criado).toHaveLength(1);
    expect(criado[0].actor).toBe(ID.uGcB);
    expect(criado[0].object_id).toBe(plano.id);
    expect(criado[0].metadata?.operationId).toBe(ID.opB);

    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.update_action_status($1,$2)`, [plano.id, 'in_progress']));
    const mudou = await logs(db, 'action_plan.status_changed');
    expect(mudou).toHaveLength(1);
    // A trilha registra o estado CANÔNICO do banco ('open'), não o rótulo da
    // tela ('não iniciado'): é o valor que qualquer auditoria futura vai cruzar.
    expect(mudou[0].metadata).toMatchObject({ from: 'open', to: 'in_progress' });
  });

  it('resultado de indicador registra operação, indicador e período', async () => {
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.save_indicator_result($1::jsonb)`, [JSON.stringify({
        operationId: ID.opB, indicatorId: ID.indDef, period: '2099-02', target: 80, actual: 90,
      })]));
    const criado = await logs(db, 'indicator_result.created');
    expect(criado).toHaveLength(1);
    expect(criado[0].actor).toBe(ID.uGcB);
    expect(criado[0].metadata).toMatchObject({ operationId: ID.opB, indicatorId: ID.indDef, period: '2099-02' });
  });

  it('provisionar usuário e conceder escopo ficam registrados sem nome nem e-mail', async () => {
    const novo = '00000000-0000-0000-0000-0000000019a1';
    await db.exec(`
      insert into auth.users (id, email) values ('${novo}','novo.sintetico@fic.example');
      insert into public.users (id, display_name, corporate_email, status)
        values ('${novo}','Fulano Sintetico','novo.sintetico@fic.example','active');
      insert into public.user_scopes (user_id, role, region_id, active)
        values ('${novo}','regional','${ID.region}',true);
    `);

    const provisionado = await logs(db, 'user.provisioned');
    expect(provisionado).toHaveLength(1);
    expect(provisionado[0].object_id).toBe(novo);

    const escopo = await logs(db, 'user.scope_granted');
    expect(escopo).toHaveLength(1);
    expect(escopo[0].metadata).toMatchObject({ userId: novo, role: 'regional' });

    // A trilha identifica por UUID; nome e e-mail não entram nela.
    const tudo = JSON.stringify(await logs(db));
    expect(tudo).not.toContain('Fulano Sintetico');
    expect(tudo).not.toContain('novo.sintetico@fic.example');
    expect(tudo).not.toContain('@fic.example');
  });

  it('mudança de papel é registrada com a transição', async () => {
    await db.exec(`update public.user_scopes set role = 'coordinator'
                    where user_id = '00000000-0000-0000-0000-0000000019a1'`);
    const mudou = await logs(db, 'user.scope_changed');
    expect(mudou).toHaveLength(1);
    expect(mudou[0].metadata).toMatchObject({ roleFrom: 'regional', roleTo: 'coordinator' });
  });

  it('Parceiro AACE criado e alterado ficam registrados', async () => {
    const op = '00000000-0000-0000-0000-0000000019e1';
    // Parceiro ativo exige Gerente de Canal (constraint operations_active_requires_gc).
    await db.exec(`insert into public.operations
                     (id, unit_id, coordination_id, partner_name, office_name, city, state,
                      channel_manager_user_id, active)
                   values ('${op}','${ID.unit}','${ID.coord1}',
                           'Parceiro Sintetico','Loja Sintetica','Cidade Ficticia','PR',
                           '${ID.uGcA}',true)`);
    expect(await logs(db, 'operation.created')).toHaveLength(1);

    await db.exec(`update public.operations set active = false where id = '${op}'`);
    const alterado = await logs(db, 'operation.updated');
    expect(alterado).toHaveLength(1);
    expect(alterado[0].metadata).toMatchObject({ activeFrom: true, activeTo: false });
  });

  it('mudança no catálogo de indicadores é registrada', async () => {
    await db.exec(`update public.indicator_definitions set lifecycle = 'inactive' where id = '${ID.indDef}'`);
    const alterado = await logs(db, 'indicator_definition.updated');
    expect(alterado).toHaveLength(1);
    expect(alterado[0].metadata).toMatchObject({ lifecycleFrom: 'active', lifecycleTo: 'inactive' });
  });
});

describe('audit_logs — a trilha não aceita ser forjada nem apagada', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await limparTrilha(db);
  }, 30_000);
  afterAll(async () => { await db.close(); });

  it('usuário comum não insere log — nem em nome próprio', async () => {
    const erro = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `insert into public.audit_logs (actor_user_id, event) values (auth.uid(), 'evento.inventado')`));
    expect(erro).toBeInstanceOf(Error);
  });

  it('não dá para atribuir uma ação a outra pessoa', async () => {
    // Era exatamente isto que a policy `with check (true)` permitia.
    const erro = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `insert into public.audit_logs (actor_user_id, event) values ($1, 'evaluation.approved')`,
      [ID.uCoord2]));
    expect(erro).toBeInstanceOf(Error);
  });

  it('anônimo não escreve', async () => {
    const erro = await db.asAnon((tx) => tx.expectError(
      `insert into public.audit_logs (event) values ('evento.anonimo')`));
    expect(erro).toBeInstanceOf(Error);
  });

  it('o ator gravado é o do JWT, não o que o cliente diria', async () => {
    // Caminho legítimo: a ação empresarial. O ator não é escolhido em lugar nenhum.
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.start_evaluation($1,$2,$3)`, [ID.opB, 'weekly', ID.uGcB]));
    const criado = await logs(db, 'evaluation.created');
    expect(criado).toHaveLength(1);
    expect(criado[0].actor).toBe(ID.uGcB);
  });

  // NOTA sobre estes dois: até a 1.3.1 eles só podiam afirmar que o log
  // continuava intacto. O `revoke insert, update, delete` que a 0029 aplica em
  // `audit_logs` não valia dentro do harness, porque ele reconcedia privilégio
  // de tabela DEPOIS das migrations, e a tentativa apenas não casava com linha
  // nenhuma (a tabela não tem policy de UPDATE nem de DELETE). A 1.3.2 passou
  // esses grants para DEFAULT PRIVILEGES antes das migrations — como no Supabase
  // real —, então agora o revoke vale aqui também e a recusa é a de verdade.
  it('usuário comum não consegue alterar log existente', async () => {
    const erro = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `update public.audit_logs set event = 'adulterado' where event = 'evaluation.created'`));
    expect(erro.message).toMatch(/permission denied for table audit_logs/);

    expect(await logs(db, 'adulterado')).toHaveLength(0);
    expect(await logs(db, 'evaluation.created')).toHaveLength(1);
  });

  it('usuário comum não consegue apagar log existente', async () => {
    const erro = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `delete from public.audit_logs where event = 'evaluation.created'`));
    expect(erro.message).toMatch(/permission denied for table audit_logs/);

    expect(await logs(db, 'evaluation.created')).toHaveLength(1);
  });

  it('a imutabilidade vale inclusive para quem tem privilégio de tabela', async () => {
    // `trg_audit_no_update` / `trg_audit_no_delete` (0003) não são policy: são
    // gatilho, e por isso pegam até a escrita fora da RLS.
    await expect(db.exec(`update public.audit_logs set event = 'adulterado'`)).rejects.toThrow();
    await expect(db.exec(`delete from public.audit_logs`)).rejects.toThrow();
  });

  it('a leitura continua restrita: o GC vê o que ele mesmo fez, não a trilha alheia', async () => {
    const doGc = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.audit_logs`));
    const doAdmin = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.audit_logs`));
    expect(doGc[0].n).toBeGreaterThan(0);
    expect(doAdmin[0].n).toBeGreaterThanOrEqual(doGc[0].n);

    const deOutro = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.audit_logs where actor_user_id = $1`,
        [ID.uGcB]));
    expect(deOutro[0].n).toBe(0);
  });
});
