/**
 * AAPEX 1.3.3 — dados do Relatório Oficial de Auditoria (migration 0035).
 *
 * O que estes testes provam, contra um PostgreSQL real (PGlite) com TODAS as
 * migrations aplicadas:
 *
 *   AUTORIZAÇÃO — anônimo recusado, PUBLIC sem EXECUTE, no escopo autorizado,
 *   fora do escopo recusado, inexistente e fora do escopo com a MESMA resposta,
 *   sem snapshot recusado, não validada recusada.
 *
 *   FONTE — o conteúdo oficial sai do snapshot; nem a resposta viva, nem uma
 *   nova versão do catálogo, nem o adendo mudam o que o relatório devolve.
 *
 *   SIGILO — nada de e-mail, bucket, path interno, URL ou token na saída.
 *
 *   TRILHA — o evento é gravado com ator real, sem dado sensível e sem
 *   duplicidade no toque duplo.
 *
 * A avaliação é levada até "aprovada" pelo FLUXO OFICIAL (start → save →
 * evidência real → plano → submit → validate), nunca por INSERT direto em
 * `official_snapshots`: um snapshot fabricado à mão provaria o teste, não o
 * produto.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, type TestDb } from './testing/harness';
import { seedScenario, anexarEvidencia, ID } from './testing/fixtures';

/** Justificativa longa de verdade — a mesma classe de texto que o PDF quebra. */
const JUSTIFICATIVA_LONGA =
  'O tema não se aplica a esta operação porque a praça não possui carteira de ' +
  'clientes empresariais ativa no período avaliado, conforme conferência da ' +
  'base cadastral realizada em conjunto com a coordenação regional, e portanto ' +
  'não há população elegível para a medição prevista no critério.';

const OBSERVACAO_LONGA =
  'Durante a auditoria foram conferidos os relatórios de produção, o funil de ' +
  'oportunidades e a rotina comercial da operação. A equipe demonstra domínio ' +
  'do portfólio, porém a cadência de acompanhamento individual ainda não está ' +
  'formalizada, o que compromete a previsibilidade do resultado no fechamento.';

interface Cenario {
  evaluationId: string;
  snapshotId: string;
}

/** Leva uma avaliação de opA até APROVADA pelo caminho oficial. */
async function auditoriaValidada(db: TestDb): Promise<Cenario> {
  // Dois itens além do I01 do fixture: um para o "não aplicável" com
  // justificativa e outro sem exigência de evidência.
  await db.exec(`
    insert into public.audit_items (template_version_id, code, title, pillar, weight, frequency, required, evidence_required) values
      ('${ID.templateV1}','I02','Item sem evidencia','Pilar Dois',4,'weekly',true,false),
      ('${ID.templateV1}','I03','Item nao aplicavel','Pilar Tres',3,'weekly',true,false);
  `);

  const evaluationId = (await db.asUser(ID.uGcA, (tx) =>
    tx.query<{ e: { id: string } }>(
      `select public.start_evaluation($1,'weekly',null) as e`, [ID.opA])))[0].e.id;

  await db.asUser(ID.uGcA, async (tx) => {
    await tx.query(`select public.save_evaluation_answer($1,'I01',$2::jsonb)`,
      [evaluationId, JSON.stringify({ status: 'green', measuredValue: '92% da meta', observation: OBSERVACAO_LONGA })]);
    await tx.query(`select public.save_evaluation_answer($1,'I02',$2::jsonb)`,
      [evaluationId, JSON.stringify({ status: 'red', measuredValue: '48% da meta', observation: 'Cadência semanal não executada.' })]);
    await tx.query(`select public.save_evaluation_answer($1,'I03',$2::jsonb)`,
      [evaluationId, JSON.stringify({ status: 'not_applicable', notApplicableReason: JUSTIFICATIVA_LONGA })]);
  });

  // Evidência FÍSICA pelo fluxo de três passos da 0028 (I01 exige).
  await anexarEvidencia(db, {
    userId: ID.uGcA, evaluationId, themeId: 'I01',
    name: 'Relatório de produção 2099.pdf', mimeType: 'application/pdf', sizeBytes: 204_800,
  });

  // Item vermelho exige plano de ação vinculado.
  await db.asUser(ID.uGcA, (tx) =>
    tx.query(`select public.save_action_plan($1::jsonb)`, [JSON.stringify({
      operationId: ID.opA, evaluationId, themeId: 'I02',
      problem: 'Cadência não executada', rootCause: 'Agenda não protegida',
      action: 'Reinstituir a reunião semanal de pipeline com ata',
      owner: 'Liderança da operação', dueDate: '2099-03-31', priority: 'high',
      expectedEvidence: 'Atas das quatro semanas', status: 'not_started',
    })]));

  await db.asUser(ID.uGcA, (tx) =>
    tx.query(`select public.submit_evaluation($1)`, [evaluationId]));

  await db.asUser(ID.uCoord1, (tx) =>
    tx.query(`select public.validate_evaluation($1,'approved','Aprovado com ressalva na cadência comercial.')`,
      [evaluationId]));

  const snapshotId = (await db.query<{ id: string }>(
    `select id from public.official_snapshots where evaluation_id = $1`, [evaluationId]))[0].id;

  return { evaluationId, snapshotId };
}

describe('0035 — get_official_audit_report_data', () => {
  let db: TestDb;
  let cenario: Cenario;
  const relatorio = (userId: string) => db.asUser(userId, (tx) =>
    tx.query<{ d: any }>(`select public.get_official_audit_report_data($1) as d`, [cenario.evaluationId]))
    .then((r) => r[0].d);

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    cenario = await auditoriaValidada(db);
  }, 120_000);

  afterAll(async () => { await db?.close(); });

  // -------------------------------------------------------------------------
  // Autorização
  // -------------------------------------------------------------------------
  it('recusa o anônimo e não concede EXECUTE a PUBLIC nem a anon', async () => {
    await db.asAnon(async (tx) => {
      const erro = await tx.expectError(
        `select public.get_official_audit_report_data($1)`, [cenario.evaluationId]);
      expect(erro.message).toMatch(/permission denied|autenticacao obrigatoria/i);
    });

    const acl = await db.query<{ pub: boolean; anon: boolean; auth: boolean }>(`
      select
        has_function_privilege('public','public.get_official_audit_report_data(uuid)','execute')        as pub,
        has_function_privilege('anon','public.get_official_audit_report_data(uuid)','execute')          as anon,
        has_function_privilege('authenticated','public.get_official_audit_report_data(uuid)','execute') as auth
    `);
    expect(acl[0].pub).toBe(false);
    expect(acl[0].anon).toBe(false);
    expect(acl[0].auth).toBe(true);
  });

  it('fixa search_path e SECURITY DEFINER nas duas RPCs e nos helpers', async () => {
    const fns = await db.query<{ nome: string; cfg: string[] | null; definer: boolean }>(`
      select p.proname as nome, p.proconfig as cfg, p.prosecdef as definer
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname in ('get_official_audit_report_data','log_official_audit_report_export',
                           'official_report_snapshot_id','user_role_code')
         and n.nspname in ('public','app')
    `);
    expect(fns).toHaveLength(4);
    for (const f of fns) {
      expect(f.definer, `${f.nome} deveria ser security definer`).toBe(true);
      expect((f.cfg ?? []).join(',')).toContain('search_path=public, app');
    }
  });

  it('entrega o MESMO conteúdo oficial ao GC, ao Coordenador e ao Administrador', async () => {
    const gc = await relatorio(ID.uGcA);
    expect(gc.official.partnerName).toBe('Parceiro A');
    expect(gc.snapshotId).toBe(cenario.snapshotId);

    // `current.readAt` é volátil por definição; o resto do oficial é idêntico.
    expect(JSON.stringify((await relatorio(ID.uCoord1)).official)).toBe(JSON.stringify(gc.official));
    expect(JSON.stringify((await relatorio(ID.uAdmin)).official)).toBe(JSON.stringify(gc.official));
  });

  it('responde a mesma coisa para fora do escopo e para inexistente', async () => {
    const foraDoEscopo = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.get_official_audit_report_data($1)`, [cenario.evaluationId]));
    const inexistente = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.get_official_audit_report_data($1)`,
        ['00000000-0000-0000-0000-0000000fffff']));
    expect(foraDoEscopo.message).toMatch(/inexistente ou fora do escopo/);
    expect(foraDoEscopo.message).toBe(inexistente.message);
  });

  it('recusa avaliação não validada e avaliação aprovada sem snapshot', async () => {
    // `evalA` do fixture está em 'submitted'.
    await db.asUser(ID.uGcA, async (tx) => {
      const erro = await tx.expectError(
        `select public.get_official_audit_report_data($1)`, [ID.evalA]);
      expect(erro.message).toMatch(/ainda nao foi validada/);
    });

    // Estado impossível pelo caminho oficial; forçado como superuser só para
    // provar que a RPC não devolve relatório vazio quando o snapshot falta.
    const orfa = (await db.query<{ id: string }>(`
      insert into public.evaluations (operation_id, template_version_id, author_user_id, status, score, frequency)
      values ('${ID.opA}','${ID.templateV1}','${ID.uGcA}','approved',80,'weekly') returning id`))[0].id;
    await db.asUser(ID.uGcA, async (tx) => {
      const erro = await tx.expectError(`select public.get_official_audit_report_data($1)`, [orfa]);
      expect(erro.message).toMatch(/snapshot oficial nao encontrado/);
    });
    await db.exec(`delete from public.evaluations where id = '${orfa}'`);
  });

  // -------------------------------------------------------------------------
  // O snapshot é a fonte
  // -------------------------------------------------------------------------
  it('reproduz o payload congelado do snapshot, resposta por resposta', async () => {
    const d = await relatorio(ID.uGcA);
    const payload = (await db.query<{ payload: any }>(
      `select payload from public.official_snapshots where id = $1`, [cenario.snapshotId]))[0].payload;

    const doPayload = [...payload.answers].sort((a: any, b: any) => a.themeId.localeCompare(b.themeId));
    expect(d.official.answers.map((a: any) => a.code)).toEqual(doPayload.map((a: any) => a.themeId));
    d.official.answers.forEach((a: any, i: number) => {
      expect(a.status).toBe(doPayload[i].status);
      expect(a.observation).toBe(doPayload[i].observation ?? '');
      expect(a.measuredValue).toBe(doPayload[i].measuredValue ?? '');
      expect(a.notApplicableReason).toBe(doPayload[i].notApplicableReason ?? '');
    });

    // Ordem do catálogo, e o score é o do snapshot — não recalculado.
    const codigos = d.official.answers.map((a: any) => a.code);
    expect(codigos).toEqual([...codigos].sort());
    const snapshot = (await db.query<{ score: string }>(
      `select score from public.official_snapshots where id = $1`, [cenario.snapshotId]))[0];
    expect(d.official.score).toBe(Number(snapshot.score));
  });

  it('a divergência entre resposta viva e snapshot é impedida na origem', async () => {
    // Não há como adulterar a resposta de uma avaliação aprovada: os gatilhos
    // de 0003 recusam UPDATE e DELETE, e a própria avaliação só pode caminhar
    // para 'superseded'. Esta garantia é o que torna o relatório reemissível
    // com o mesmo conteúdo meses depois.
    await expect(db.exec(`
      update public.evaluation_answers set observation = 'ADULTERADO'
       where evaluation_id = '${cenario.evaluationId}'`)).rejects.toThrow(/rascunho\/devolvida/);
    await expect(db.exec(`
      update public.evaluations set score = 1 where id = '${cenario.evaluationId}'`))
      .rejects.toThrow(/aprovada e imutavel/);
  });

  it('não segue nova versão do catálogo nem se abala com o adendo', async () => {
    const antes = await relatorio(ID.uGcA);

    // Uma versão 2 do template, com o MESMO código e outro título.
    const v2 = (await db.query<{ id: string }>(`
      insert into public.audit_template_versions (template_id, version_number)
      values ('${ID.template}', 2) returning id`))[0].id;
    await db.exec(`
      insert into public.audit_items (template_version_id, code, title, pillar, weight, frequency, required, evidence_required)
      values ('${v2}','I01','TITULO REESCRITO NA V2','Pilar Reescrito',99,'weekly',true,true)`);

    const comV2 = await relatorio(ID.uGcA);
    const i01 = comV2.official.answers.find((a: any) => a.code === 'I01');
    expect(i01.title).toBe('Item vermelho');
    expect(i01.pillar).toBe('Pilar');
    expect(i01.weight).toBe(5);
    expect(JSON.stringify(comV2.official)).not.toContain('REESCRITO');

    // Adendo: única transição admitida a partir de 'approved'.
    await db.exec(
      `update public.evaluations set status = 'superseded' where id = '${cenario.evaluationId}'`);
    expect(JSON.stringify((await relatorio(ID.uGcA)).official)).toBe(JSON.stringify(antes.official));
    await db.exec(
      `update public.evaluations set status = 'approved' where id = '${cenario.evaluationId}'`);
  });

  it('preserva o não aplicável, a justificativa e as pessoas por nome funcional', async () => {
    const d = await relatorio(ID.uGcA);
    const na = d.official.answers.find((a: any) => a.code === 'I03');
    expect(na.status).toBe('not_applicable');
    expect(na.notApplicableReason).toBe(JUSTIFICATIVA_LONGA);

    expect(d.official.evaluatorName).toBe('GC A Fic');
    expect(d.official.evaluatorRole).toBe('channel_manager');
    expect(d.official.validatorName).toBe('Coord1 Fic');
    expect(d.official.validatorRole).toBe('coordinator');
  });

  // -------------------------------------------------------------------------
  // Evidências, planos e sigilo
  // -------------------------------------------------------------------------
  it('indexa a evidência por nome seguro, sem bucket nem caminho', async () => {
    const d = await relatorio(ID.uGcA);
    expect(d.official.evidenceIndex).toHaveLength(1);
    const ev = d.official.evidenceIndex[0];
    expect(ev.code).toBe('I01');
    expect(ev.name).toMatch(/^[A-Za-z0-9._-]+$/);   // saneado: sem espaço, sem barra
    expect(ev.mimeType).toBe('application/pdf');
    expect(Number(ev.sizeBytes)).toBe(204_800);
    expect(ev.confirmed).toBe(true);
    expect(Object.keys(ev)).not.toContain('path');
    expect(Object.keys(ev)).not.toContain('bucket');
  });

  it('entrega os planos como conteúdo ATUAL, datado, com atraso derivado de hoje', async () => {
    const d = await relatorio(ID.uGcA);
    expect(d.current.readAt).toBeTruthy();
    expect(d.current.actionPlans).toHaveLength(1);
    expect(d.current.actionPlans[0].code).toBe('I02');
    expect(d.current.actionPlans[0].status).toBe('not_started');
    expect(d.current.actionPlans[0].overdue).toBe(false);   // prazo em 2099
    // E o plano NÃO está dentro do bloco oficial.
    expect(Object.keys(d.official)).not.toContain('actionPlans');

    await db.exec(`
      update public.action_plans set due_date = current_date - 5
       where evaluation_id = '${cenario.evaluationId}'`);
    expect((await relatorio(ID.uGcA)).current.actionPlans[0].overdue).toBe(true);
    await db.exec(`
      update public.action_plans set due_date = date '2099-03-31'
       where evaluation_id = '${cenario.evaluationId}'`);
  });

  it('não devolve e-mail, bucket, path interno, URL nem token', async () => {
    const texto = JSON.stringify(await relatorio(ID.uGcA));
    expect(texto).not.toContain('@');
    expect(texto).not.toContain('evidencias/');
    expect(texto).not.toMatch(/https?:\/\//);
    expect(texto).not.toMatch(/\btoken\b/i);
    expect(texto).not.toMatch(/\bsha256\b/i);
    expect(texto).not.toContain('.example');
  });
});

describe('0035 — log_official_audit_report_export', () => {
  let db: TestDb;
  let cenario: Cenario;
  const CODIGO = 'a'.repeat(64);

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    cenario = await auditoriaValidada(db);
  }, 120_000);

  afterAll(async () => { await db?.close(); });

  it('não concede EXECUTE a PUBLIC nem a anon', async () => {
    const acl = await db.query<{ pub: boolean; anon: boolean }>(`
      select
        has_function_privilege('public','public.log_official_audit_report_export(uuid,uuid,text,text)','execute') as pub,
        has_function_privilege('anon','public.log_official_audit_report_export(uuid,uuid,text,text)','execute')   as anon
    `);
    expect(acl[0].pub).toBe(false);
    expect(acl[0].anon).toBe(false);
  });

  it('registra com ator real, sem dado sensível, e não duplica no toque duplo', async () => {
    const primeiro = (await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ r: any }>(`select public.log_official_audit_report_export($1,$2,'1.3.3',$3) as r`,
        [cenario.evaluationId, cenario.snapshotId, CODIGO])))[0].r;
    expect(primeiro.logged).toBe(true);

    const log = (await db.query<any>(`
      select actor_user_id, event, object_type, object_id, result, metadata
        from public.audit_logs where event = 'evaluation.report_exported'`))[0];
    expect(log.actor_user_id).toBe(ID.uGcA);
    expect(log.object_type).toBe('evaluation');
    expect(log.object_id).toBe(cenario.evaluationId);
    expect(log.result).toBe('success');
    expect(log.metadata.snapshotId).toBe(cenario.snapshotId);
    expect(log.metadata.reportVersion).toBe('1.3.3');
    expect(log.metadata.integrityCode).toBe(CODIGO);

    // Nada de conteúdo do relatório na trilha.
    const texto = JSON.stringify(log.metadata);
    expect(texto).not.toContain('@');
    expect(texto).not.toContain('Parceiro A');
    expect(texto).not.toContain(JUSTIFICATIVA_LONGA);
    expect(texto).not.toMatch(/%PDF/);

    // Toque duplo: mesma pessoa, mesmo conteúdo, uma linha só.
    const segundo = (await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ r: any }>(`select public.log_official_audit_report_export($1,$2,'1.3.3',$3) as r`,
        [cenario.evaluationId, cenario.snapshotId, CODIGO])))[0].r;
    expect(segundo.logged).toBe(false);
    expect(segundo.reason).toBe('duplicate');
    expect(Number((await db.query<{ n: string }>(
      `select count(*) as n from public.audit_logs where event = 'evaluation.report_exported'`))[0].n))
      .toBe(1);
  });

  it('recusa quem está fora do escopo, sem escrever na trilha', async () => {
    await db.asUser(ID.uGcB, async (tx) => {
      const erro = await tx.expectError(
        `select public.log_official_audit_report_export($1,$2,'1.3.3',$3)`,
        [cenario.evaluationId, cenario.snapshotId, CODIGO]);
      expect(erro.message).toMatch(/inexistente ou fora do escopo/);
    });
    expect(Number((await db.query<{ n: string }>(
      `select count(*) as n from public.audit_logs where event = 'evaluation.report_exported'`))[0].n))
      .toBe(1);
  });

  it('recusa snapshot divergente, código inválido e avaliação não validada', async () => {
    await db.asUser(ID.uGcA, async (tx) => {
      expect((await tx.expectError(
        `select public.log_official_audit_report_export($1,$2,'1.3.3',$3)`,
        [cenario.evaluationId, '00000000-0000-0000-0000-0000000fffff', 'b'.repeat(64)])).message)
        .toMatch(/snapshot divergente/);

      expect((await tx.expectError(
        `select public.log_official_audit_report_export($1,$2,'1.3.3',$3)`,
        [cenario.evaluationId, cenario.snapshotId, 'nao-e-um-hash'])).message)
        .toMatch(/codigo de integridade invalido/);

      expect((await tx.expectError(
        `select public.log_official_audit_report_export($1,null,'1.3.3',$2)`,
        [ID.evalA, 'c'.repeat(64)])).message)
        .toMatch(/ainda nao foi validada/);
    });
  });
});
