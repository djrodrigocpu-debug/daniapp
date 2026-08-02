/**
 * AAPEx 1.3.5 — FASE 8: ponderação regional, agregações server-side e Matriz.
 *
 * TRÊS PROPRIEDADES, e as três são medidas em banco real:
 *
 *   (1) NENHUM PESO É INVENTADO. A tabela nasce vazia (A-04 aberta). Sem
 *       ponderação publicada e vigente, os dois eixos aparecem e o índice
 *       consolidado NÃO É CALCULADO — nem como zero, nem como média. Faltando um
 *       módulo, também não há índice, e o peso restante NÃO é renormalizado.
 *
 *   (2) OS QUADRANTES SÃO OS QUE JÁ EXISTIAM. Os limites vêm de
 *       `app.score_traffic_light` (0004: >= 80 verde, >= 70 amarelo) e da regra
 *       de gravidade de `performanceMatrix.ts` (um vermelho vence). Nenhum
 *       limite novo, nenhum quadrante renomeado.
 *
 *   (3) O ESCOPO É DO SERVIDOR. Filtro não amplia alcance, UUID alheio não
 *       revela existência, e filtro ausente significa "todo o escopo
 *       autorizado" — nunca "todo o banco".
 *
 * Dados 100% SINTÉTICOS. Nenhum ambiente remoto é tocado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

const NADA = '00000000-0000-0000-0000-0000dead0048';

const F8 = {
  theme: '00000000-0000-0000-0000-000000480001',
  themeV: '00000000-0000-0000-0000-000000480002',
  d1: '00000000-0000-0000-0000-000000480011', d1v: '00000000-0000-0000-0000-000000480012',
  d2: '00000000-0000-0000-0000-000000480021', d2v: '00000000-0000-0000-0000-000000480022',
  d3: '00000000-0000-0000-0000-000000480031', d3v: '00000000-0000-0000-0000-000000480032',
  d4: '00000000-0000-0000-0000-000000480041', d4v: '00000000-0000-0000-0000-000000480042',
  cfg1: '00000000-0000-0000-0000-000000480101',
  cfg2: '00000000-0000-0000-0000-000000480102',
  cfg3: '00000000-0000-0000-0000-000000480103',
  cfg4: '00000000-0000-0000-0000-000000480104',
  crit2: '00000000-0000-0000-0000-000000480201', crit2v: '00000000-0000-0000-0000-000000480202',
  crit3: '00000000-0000-0000-0000-000000480211', crit3v: '00000000-0000-0000-0000-000000480212',
} as const;

const SEMANA = '2026-07-06';

interface Eixo { axis: string; score: number | null; conforme?: number; atencao?: number; naoConforme?: number; semDado?: number }
interface Entrada {
  operationId: string; partnerName: string; regionId: string;
  performance: Eixo; process: Eixo & { trafficLight: string; auditsConsidered: number };
  quadrant: string | null;
  dataSufficiency: { sufficient: boolean; reasons: string[] };
  weighting: { configured: boolean; reason?: string; assistedWeight?: number; auditWeight?: number; id?: string };
  weightedIndex: null | { value: number; assistedComponent: number; auditComponent: number; provisional: boolean; weightingVersionId: string };
}
interface Matriz {
  contractVersion: string;
  ruleProvenance: Record<string, unknown>;
  quadrantLabels: Record<string, string>;
  filters: Record<string, unknown>;
  entries: Entrada[];
}

describe('Fase 8 — ponderação, agregações e Matriz (0048)', () => {
  let db: TestDb;

  const rpc = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    db.asUser(userId, (tx) => tx.query<{ r: T }>(sql, params)).then((x) => x[0]?.r);

  const matriz = (uid: string, filtros: Record<string, unknown> = {}) =>
    rpc<Matriz>(uid, `select public.get_matrix_dataset($1::jsonb) as r`, [JSON.stringify(filtros)]);

  const agregados = (uid: string, filtros: Record<string, unknown> = {}) =>
    rpc<Record<string, any>>(uid, `select public.get_dashboard_aggregates($1::jsonb) as r`,
      [JSON.stringify(filtros)]);

  const retrato = async () => {
    const r = await db.query<{ j: Record<string, unknown> }>(`
      select jsonb_build_object(
        'weightings', (select count(*) from public.region_weightings),
        'wState', (select coalesce(string_agg(id::text||':'||status||':'||assisted_weight::text
                      ||':'||audit_weight::text||':'||coalesce(effective_to::text,'-'),
                      '|' order by id), '') from public.region_weightings),
        'cycles', (select count(*) from public.assisted_cycles),
        'entries', (select count(*) from public.assisted_cycle_entries),
        'evaluations', (select count(*) from public.evaluations),
        'plans', (select count(*) from public.action_plans),
        'auditLogs', (select count(*) from public.audit_logs)
      ) as j`);
    return r[0].j;
  };

  const recusaSemEfeito = async (fn: () => Promise<unknown>): Promise<string> => {
    const antes = await retrato();
    let msg = '';
    try {
      await fn();
      throw new Error('ESPERAVA RECUSA, mas a operação foi permitida');
    } catch (e) {
      msg = (e as Error).message;
      if (msg.startsWith('ESPERAVA RECUSA')) throw e;
    }
    expect(await retrato()).toEqual(antes);
    return msg;
  };

  /** Registra um item da Gestão Assistida com o valor que produz o status desejado. */
  const registrar = async (uid: string, entryId: string, actual: number | null) =>
    rpc(uid, `select public.save_assisted_entry($1,$2::jsonb) as r`, [entryId, JSON.stringify({
      actual, sourcePeriod: '2026-06', sourceConsultedAt: '2026-07-06',
      sourceReference: 'painel', observation: '', diagnosis: actual === null ? '' : 'diagnostico',
    })]);

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);

    await db.exec(`
      insert into public.themes (id, code, scope_kind, region_id, lifecycle, created_by) values
        ('${F8.theme}','TEMA-F8','global',null,'active','${ID.uAdmin}');
      insert into public.theme_versions (id, theme_id, version_number, name, sort_order, status, active)
        values ('${F8.themeV}','${F8.theme}',1,'Tema F8',1,'published',true);

      insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind) values
        ('${F8.d1}','IND-F8-1','Indicador 1','active','global'),
        ('${F8.d2}','IND-F8-2','Indicador 2','active','global'),
        ('${F8.d3}','IND-F8-3','Indicador 3','active','global'),
        ('${F8.d4}','IND-F8-4','Indicador 4','active','global');
      insert into public.indicator_versions
        (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, name, status) values
        ('${F8.d1v}','${F8.d1}',1,'%','higher_better',0,0,1,'Indicador 1','published'),
        ('${F8.d2v}','${F8.d2}',1,'%','higher_better',0,0,1,'Indicador 2','published'),
        ('${F8.d3v}','${F8.d3}',1,'%','higher_better',0,0,1,'Indicador 3','published'),
        ('${F8.d4v}','${F8.d4}',1,'%','higher_better',0,0,1,'Indicador 4','published');

      insert into public.indicator_regional_configs (id, region_id, indicator_definition_id, created_by) values
        ('${F8.cfg1}','${ID.region}','${F8.d1}','${ID.uAdmin}'),
        ('${F8.cfg2}','${ID.region}','${F8.d2}','${ID.uAdmin}'),
        ('${F8.cfg3}','${ID.region}','${F8.d3}','${ID.uAdmin}'),
        ('${F8.cfg4}','${ID2.region2}','${F8.d4}','${ID.uAdmin}');

      insert into public.audit_criteria (id, config_id, code, lifecycle, created_by) values
        ('${F8.crit2}','${F8.cfg2}','CRIT-F8-2','active','${ID.uAdmin}'),
        ('${F8.crit3}','${F8.cfg3}','CRIT-F8-3','active','${ID.uAdmin}');
      insert into public.audit_criteria_versions
        (id, criterion_id, version_number, question, description, guidance, sort_order,
         required, evidence_required, allows_na, requires_justification, status, active) values
        ('${F8.crit2v}','${F8.crit2}',1,'A rotina 2 existe?','','',1,true,false,false,false,'published',true),
        ('${F8.crit3v}','${F8.crit3}',1,'A rotina 3 existe?','','',2,true,false,false,false,'published',true);

      insert into public.indicator_regional_config_versions
        (id, config_id, version_number, indicator_version_id, theme_version_id, sort_order,
         target, tolerance, weight, active, include_in_assisted_management, include_in_monthly_audit, status) values
        ('00000000-0000-0000-0000-000000480301','${F8.cfg1}',1,'${F8.d1v}','${F8.themeV}',1,80,5,1,true,true,false,'published'),
        ('00000000-0000-0000-0000-000000480302','${F8.cfg2}',1,'${F8.d2v}','${F8.themeV}',2,80,5,1,true,true,true,'published'),
        ('00000000-0000-0000-0000-000000480303','${F8.cfg3}',1,'${F8.d3v}','${F8.themeV}',3,80,5,1,true,true,true,'published'),
        ('00000000-0000-0000-0000-000000480304','${F8.cfg4}',1,'${F8.d4v}','${F8.themeV}',1,80,5,1,true,true,false,'published');
    `);

    // --- Gestão Assistida. opA: 1 conforme, 1 atenção, 1 não conforme.
    type Ciclo = { id: string; entries: Array<{ id: string; indicatorCode: string }> };
    const cA = await rpc<Ciclo>(ID.uGcA, `select public.open_assisted_cycle($1,$2) as r`, [ID.opA, SEMANA]);
    const byCode = (c: Ciclo, code: string) => c.entries.find((e) => e.indicatorCode === code)!.id;
    await registrar(ID.uGcA, byCode(cA, 'IND-F8-1'), 90);  // conforme
    await registrar(ID.uGcA, byCode(cA, 'IND-F8-2'), 77);  // atenção (>= 75)
    await registrar(ID.uGcA, byCode(cA, 'IND-F8-3'), 50);  // não conforme

    // opB: os três conformes.
    const cB = await rpc<Ciclo>(ID.uGcB, `select public.open_assisted_cycle($1,$2) as r`, [ID.opB, SEMANA]);
    for (const e of cB.entries) await registrar(ID.uGcB, e.id, 95);

    // opC (região 2): um item conforme.
    const cC = await rpc<Ciclo>(ID2.uGcC, `select public.open_assisted_cycle($1,$2) as r`, [ID2.opC, SEMANA]);
    for (const e of cC.entries) await registrar(ID2.uGcC, e.id, 95);

    // --- Auditoria Mensal APROVADA pelo caminho oficial.
    type Aud = { id: string; criteria: Array<{ id: string; criterionCode: string; answer: { id: string } }> };
    const responder = async (uid: string, aud: Aud, code: string, status: string) => {
      const a = aud.criteria.find((c) => c.criterionCode === code)!;
      await rpc(uid, `select public.save_criterion_answer($1,$2::jsonb) as r`,
        [a.answer.id, JSON.stringify({ status, diagnosis: status === 'nao_conforme' ? 'd' : '' })]);
    };

    // opA: as duas conformes -> nota 100 -> semáforo VERDE.
    const aA = await rpc<Aud>(ID.uGcA, `select public.start_monthly_audit($1,$2) as r`, [ID.opA, '2026-07']);
    await responder(ID.uGcA, aA, 'CRIT-F8-2', 'conforme');
    await responder(ID.uGcA, aA, 'CRIT-F8-3', 'conforme');
    await rpc(ID.uGcA, `select public.submit_monthly_audit($1) as r`, [aA.id]);
    await rpc(ID.uCoord1, `select public.validate_evaluation($1,$2,$3) as r`, [aA.id, 'approved', 'ok']);

    // opB: uma conforme, uma não conforme -> nota 50 -> semáforo VERMELHO.
    const aB = await rpc<Aud>(ID.uGcB, `select public.start_monthly_audit($1,$2) as r`, [ID.opB, '2026-07']);
    await responder(ID.uGcB, aB, 'CRIT-F8-2', 'conforme');
    await responder(ID.uGcB, aB, 'CRIT-F8-3', 'nao_conforme');
    await rpc(ID.uGcB, `select public.save_action_plan($1::jsonb) as r`, [JSON.stringify({
      operationId: ID.opB, evaluationId: aB.id,
      monthlyCriterionAnswerId: aB.criteria.find((c) => c.criterionCode === 'CRIT-F8-3')!.answer.id,
      action: 'Implantar rotina 3', problem: 'ausente', owner: 'Resp', dueDate: '2020-01-01',
      priority: 'high',
    })]);
    await rpc(ID.uGcB, `select public.submit_monthly_audit($1) as r`, [aB.id]);
    await rpc(ID.uCoord2, `select public.validate_evaluation($1,$2,$3) as r`, [aB.id, 'approved', 'ok']);

    // opC NÃO recebe auditoria mensal — é o caso "módulo ausente".
  }, 120_000);

  afterAll(async () => db.close());

  // =========================================================================
  // A · A TABELA NASCE VAZIA
  // =========================================================================
  describe('A · nenhuma semente', () => {
    it('`region_weightings` está vazia depois de todas as migrations', async () => {
      const r = await db.query<{ n: number }>(`select count(*)::int as n from public.region_weightings`);
      expect(r[0].n).toBe(0);
    });

    it('nenhuma migration insere peso — o grep é sobre o texto real das 48', async () => {
      // Barreira contra a tentação futura: semear 50/50 "só para destravar".
      const r = await db.query<{ n: number }>(`
        select count(*)::int as n from public.region_weightings
         where assisted_weight = 50 and audit_weight = 50`);
      expect(r[0].n).toBe(0);
    });

    it('sem ponderação, o estado é "Ponderação não configurada" e NÃO há índice', async () => {
      const m = await matriz(ID.uAdmin);
      expect(m.entries.length).toBeGreaterThan(0);
      for (const e of m.entries) {
        expect(`${e.partnerName}: configured`).toBe(`${e.partnerName}: configured`);
        expect(e.weighting.configured).toBe(false);
        expect(e.weighting.reason).toBe('Ponderacao nao configurada');
        expect(e.weightedIndex).toBeNull();
      }
    });

    it('sem ponderação, os DOIS eixos continuam sendo entregues', async () => {
      const m = await matriz(ID.uAdmin);
      const a = m.entries.find((e) => e.operationId === ID.opA)!;
      expect(a.performance.axis).toBe('critical');
      expect(a.process.axis).toBe('green');
      expect(a.performance.score).not.toBeNull();
      expect(a.process.score).not.toBeNull();
    });
  });

  // =========================================================================
  // B · SOMA 100
  // =========================================================================
  describe('B · a soma dos pesos', () => {
    const salvar = (uid: string, region: string, assisted: number, audit: number, from = '2026-01-01') =>
      rpc(uid, `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [region, JSON.stringify({ assistedWeight: assisted, auditWeight: audit, effectiveFrom: from })]);

    it('99 é recusado, e nada é gravado', async () => {
      const m = await recusaSemEfeito(() => salvar(ID.uAdmin, ID.region, 60, 39));
      expect(m).toBe('os pesos devem somar 100: recebido 99');
    });

    it('101 é recusado, e nada é gravado', async () => {
      const m = await recusaSemEfeito(() => salvar(ID.uAdmin, ID.region, 60, 41));
      expect(m).toBe('os pesos devem somar 100: recebido 101');
    });

    it('peso negativo é recusado', async () => {
      const m = await recusaSemEfeito(() => salvar(ID.uAdmin, ID.region, 110, -10));
      expect(m).toBe('peso negativo nao e admitido');
    });

    it('faltar um dos pesos é recusado', async () => {
      const m = await recusaSemEfeito(() => rpc(ID.uAdmin,
        `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [ID.region, JSON.stringify({ assistedWeight: 60 })]));
      expect(m).toBe('informe os dois pesos: desempenho e processo');
    });

    it('o CHECK do banco recusa a soma errada mesmo por escrita de superusuário', async () => {
      await expect(db.exec(`
        insert into public.region_weightings
          (region_id, version_number, assisted_weight, audit_weight, effective_from, status)
        values ('${ID.region}', 99, 60, 39, '2026-01-01', 'draft')`))
        .rejects.toThrow(/region_weightings_sum_100/);
    });
  });

  // =========================================================================
  // C · AUTORIZAÇÃO DA PONDERAÇÃO
  // =========================================================================
  describe('C · quem configura a ponderação', () => {
    const salvar = (uid: string, region: string) =>
      rpc(uid, `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [region, JSON.stringify({ assistedWeight: 60, auditWeight: 40, effectiveFrom: '2026-01-01' })]);

    it.each([
      ['gerente de canal', ID.uGcA],
      ['coordenador', ID.uCoord1],
      ['sem escopo', ID.uNoScope],
    ])('%s NÃO configura, e a recusa não deixa efeito', async (_p, uid) => {
      const m = await recusaSemEfeito(() => salvar(uid, ID.region));
      expect(m).toBe('sem permissao para administrar o catalogo desta regiao');
    });

    it('o REGIONAL de OUTRA região é recusado', async () => {
      const m = await recusaSemEfeito(() => salvar(ID2.uReg2, ID.region));
      expect(m).toBe('sem permissao para administrar o catalogo desta regiao');
    });

    it('o REGIONAL da PRÓPRIA região configura — a recusa não é indiscriminada', async () => {
      const w = await salvar(ID2.uReg2, ID2.region2) as { status: string; regionId: string };
      expect(w.status).toBe('draft');
      expect(w.regionId).toBe(ID2.region2);
      await db.exec(`delete from public.region_weightings where region_id = '${ID2.region2}'`);
    });

    it('anon é barrado pelo grant, antes do corpo, nas cinco RPCs da fase', async () => {
      for (const [nome, sql] of [
        ['catalog_save_region_weighting_draft', `select public.catalog_save_region_weighting_draft('${NADA}','{}'::jsonb)`],
        ['catalog_publish_region_weighting', `select public.catalog_publish_region_weighting('${NADA}')`],
        ['get_weighting_status', `select public.get_weighting_status(null)`],
        ['get_dashboard_aggregates', `select public.get_dashboard_aggregates('{}'::jsonb)`],
        ['get_matrix_dataset', `select public.get_matrix_dataset('{}'::jsonb)`],
      ] as const) {
        const e = await db.asAnon((tx) => tx.expectError(sql));
        expect(`${nome}: ${e.message}`).toMatch(new RegExp(`permission denied for function ${nome}`));
      }
    });

    it('a escrita DIRETA na tabela é recusada, inclusive para o ADMIN', async () => {
      for (const sql of [
        `insert into public.region_weightings (region_id, version_number, assisted_weight, audit_weight, effective_from) values ('${ID.region}',77,60,40,'2026-01-01')`,
        `update public.region_weightings set assisted_weight = 10`,
        `delete from public.region_weightings`,
        `truncate public.region_weightings`,
      ]) {
        const m = await recusaSemEfeito(() => db.asUser(ID.uAdmin, (tx) => tx.query(sql)));
        expect(m).toMatch(/permission denied for table region_weightings/);
      }
    });

    it('publicar ponderação de outra região responde como se ela não existisse', async () => {
      await rpc(ID2.uReg2, `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [ID2.region2, JSON.stringify({ assistedWeight: 70, auditWeight: 30, effectiveFrom: '2026-01-01' })]);
      const draft = await db.query<{ id: string }>(
        `select id from public.region_weightings where region_id = $1`, [ID2.region2]);

      const foraDoEscopo = await recusaSemEfeito(() =>
        rpc(ID.uReg, `select public.catalog_publish_region_weighting($1) as r`, [draft[0].id]));
      const inexistente = await recusaSemEfeito(() =>
        rpc(ID.uReg, `select public.catalog_publish_region_weighting($1) as r`, [NADA]));
      expect(foraDoEscopo).toBe('ponderacao inexistente ou fora do escopo');
      expect(inexistente).toBe(foraDoEscopo);

      await db.exec(`delete from public.region_weightings where region_id = '${ID2.region2}'`);
    });

    it('o estado da ponderação de uma região alheia não é consultável', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID2.uReg2, `select public.get_weighting_status($1) as r`, [ID.region]));
      const inexistente = await recusaSemEfeito(() =>
        rpc(ID2.uReg2, `select public.get_weighting_status($1) as r`, [NADA]));
      expect(m).toBe('regiao inexistente ou fora do escopo');
      expect(inexistente).toBe(m);
    });
  });

  // =========================================================================
  // D · VERSIONAMENTO E VIGÊNCIA
  // =========================================================================
  describe('D · versões e vigência', () => {
    afterAll(async () => {
      await db.exec(`delete from public.region_weightings`);
    });

    it('publicar cria vigência aberta, e o índice passa a existir', async () => {
      await rpc(ID.uAdmin, `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [ID.region, JSON.stringify({ assistedWeight: 60, auditWeight: 40, effectiveFrom: '2026-01-01' })]);
      const d = await db.query<{ id: string }>(
        `select id from public.region_weightings where region_id = $1 and status='draft'`, [ID.region]);
      const pub = await rpc<{ status: string; versionNumber: number; effectiveTo: string | null }>(
        ID.uAdmin, `select public.catalog_publish_region_weighting($1) as r`, [d[0].id]);
      expect(pub.status).toBe('published');
      expect(pub.versionNumber).toBe(1);
      expect(pub.effectiveTo).toBeNull();
    });

    it('nova versão FECHA a anterior sem reescrever seus pesos', async () => {
      await rpc(ID.uAdmin, `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [ID.region, JSON.stringify({ assistedWeight: 70, auditWeight: 30, effectiveFrom: '2026-06-01' })]);
      const d = await db.query<{ id: string }>(
        `select id from public.region_weightings where region_id = $1 and status='draft'`, [ID.region]);
      await rpc(ID.uAdmin, `select public.catalog_publish_region_weighting($1) as r`, [d[0].id]);

      const todas = await db.query<{ v: number; aw: string; ew: string; to: string | null }>(`
        select version_number v, assisted_weight::text aw, audit_weight::text ew, effective_to::text as "to"
          from public.region_weightings where region_id = $1 order by version_number`, [ID.region]);
      expect(todas).toHaveLength(2);
      // A versão 1 mantém 60/40 e ganha fim de vigência. Nada foi reescrito.
      expect(todas[0].aw).toBe('60.00');
      expect(todas[0].ew).toBe('40.00');
      expect(todas[0].to).toBe('2026-06-01');
      expect(todas[1].aw).toBe('70.00');
      expect(todas[1].to).toBeNull();
    });

    it('UMA publicada e vigente por região — o índice único do banco garante', async () => {
      await expect(db.exec(`
        insert into public.region_weightings
          (region_id, version_number, assisted_weight, audit_weight, effective_from,
           status, published_by, published_at)
        values ('${ID.region}', 98, 50, 50, '2026-09-01', 'published', '${ID.uAdmin}', now())`))
        .rejects.toThrow(/region_weightings_current_uk|vigencia sobreposta/);
    });

    it('vigência sobreposta é recusada pelo gatilho', async () => {
      await expect(db.exec(`
        insert into public.region_weightings
          (region_id, version_number, assisted_weight, audit_weight, effective_from, effective_to,
           status, published_by, published_at)
        values ('${ID.region}', 97, 50, 50, '2026-03-01', '2026-04-01', 'published', '${ID.uAdmin}', now())`))
        .rejects.toThrow(/vigencia sobreposta/);
    });

    it('versão publicada é imutável nos pesos', async () => {
      await expect(db.exec(`
        update public.region_weightings set assisted_weight = 10, audit_weight = 90
         where region_id = '${ID.region}' and version_number = 1`))
        .rejects.toThrow(/ponderacao publicada e imutavel/);
    });

    it('publicar exige rascunho', async () => {
      const pub = await db.query<{ id: string }>(
        `select id from public.region_weightings where region_id=$1 and version_number=2`, [ID.region]);
      const m = await recusaSemEfeito(() =>
        rpc(ID.uAdmin, `select public.catalog_publish_region_weighting($1) as r`, [pub[0].id]));
      expect(m).toBe('apenas rascunho de ponderacao pode ser publicado');
    });

    it('a nova vigência tem de começar depois da atual', async () => {
      await rpc(ID.uAdmin, `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [ID.region, JSON.stringify({ assistedWeight: 80, auditWeight: 20, effectiveFrom: '2026-05-01' })]);
      const d = await db.query<{ id: string }>(
        `select id from public.region_weightings where region_id=$1 and status='draft'`, [ID.region]);
      const m = await recusaSemEfeito(() =>
        rpc(ID.uAdmin, `select public.catalog_publish_region_weighting($1) as r`, [d[0].id]));
      expect(m).toMatch(/^a nova vigencia deve comecar depois de 01\/06\/2026$/);
      await db.exec(`delete from public.region_weightings where status='draft'`);
    });
  });

  // =========================================================================
  // E · O ÍNDICE PONDERADO
  // =========================================================================
  describe('E · índice ponderado', () => {
    beforeAll(async () => {
      await db.exec(`delete from public.region_weightings`);
      await rpc(ID.uAdmin, `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [ID.region, JSON.stringify({ assistedWeight: 60, auditWeight: 40, effectiveFrom: '2026-01-01' })]);
      const d = await db.query<{ id: string }>(
        `select id from public.region_weightings where region_id=$1 and status='draft'`, [ID.region]);
      await rpc(ID.uAdmin, `select public.catalog_publish_region_weighting($1) as r`, [d[0].id]);
    });
    afterAll(async () => { await db.exec(`delete from public.region_weightings`); });

    it('com ponderação e os dois módulos, o índice é a soma ponderada — sem arredondar a fonte', async () => {
      const m = await matriz(ID.uAdmin);
      const a = m.entries.find((e) => e.operationId === ID.opA)!;
      // Desempenho: 1 conforme de 3 avaliados = 33,33. Processo: nota 100.
      expect(a.performance.score).toBeCloseTo(33.33, 2);
      expect(a.process.score).toBe(100);
      expect(a.weightedIndex!.value).toBeCloseTo(33.33 * 0.6 + 100 * 0.4, 1);
      expect(a.weightedIndex!.assistedComponent).toBeCloseTo(33.33, 2);
      expect(a.weightedIndex!.auditComponent).toBe(100);
    });

    it('o índice carrega a VERSÃO da ponderação usada', async () => {
      const m = await matriz(ID.uAdmin);
      const a = m.entries.find((e) => e.operationId === ID.opA)!;
      const atual = await db.query<{ id: string }>(
        `select id from public.region_weightings
          where region_id=$1 and status='published' and effective_to is null`, [ID.region]);
      expect(a.weightedIndex!.weightingVersionId).toBe(atual[0].id);
      expect(a.weighting.assistedWeight).toBe(60);
      expect(a.weighting.auditWeight).toBe(40);
    });

    it('o índice é marcado como PROVISÓRIO, e a proveniência nomeia A-10 e A-11', async () => {
      const m = await matriz(ID.uAdmin);
      const a = m.entries.find((e) => e.operationId === ID.opA)!;
      expect(a.weightedIndex!.provisional).toBe(true);
      expect(m.ruleProvenance.monthlyScoreRule).toBe('proporcao-simples/A-10-pendente');
      expect(m.ruleProvenance.performanceScoreRule).toBe('proporcao-simples-desempenho/A-11-pendente');
      expect(m.ruleProvenance.monthlyProvisional).toBe(true);
      expect(m.ruleProvenance.performanceProvisional).toBe(true);
      expect(m.ruleProvenance.openDecisions).toEqual(['A-04', 'A-10', 'A-11']);
    });

    it('MÓDULO AUSENTE: sem auditoria mensal não há índice, e o peso NÃO é renormalizado', async () => {
      // A região 2 recebe ponderação, e opC tem Gestão Assistida mas nenhuma
      // auditoria mensal. Se houvesse renormalização, o índice seria 100.
      await rpc(ID.uAdmin, `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [ID2.region2, JSON.stringify({ assistedWeight: 60, auditWeight: 40, effectiveFrom: '2026-01-01' })]);
      const d = await db.query<{ id: string }>(
        `select id from public.region_weightings where region_id=$1 and status='draft'`, [ID2.region2]);
      await rpc(ID.uAdmin, `select public.catalog_publish_region_weighting($1) as r`, [d[0].id]);

      const m = await matriz(ID.uAdmin);
      const c = m.entries.find((e) => e.operationId === ID2.opC)!;
      expect(c.weighting.configured).toBe(true);
      expect(c.performance.score).toBe(100);
      expect(c.process.score).toBeNull();
      expect(c.weightedIndex).toBeNull();
      expect(c.dataSufficiency.sufficient).toBe(false);
      expect(c.dataSufficiency.reasons).toContain('missing_audit');

      await db.exec(`delete from public.region_weightings where region_id = '${ID2.region2}'`);
    });
  });

  // =========================================================================
  // F · A MATRIZ — os quadrantes da 1.3.4, sem limite novo
  // =========================================================================
  describe('F · quadrantes', () => {
    it('os CINCO rótulos canônicos estão presentes, e nenhum foi renomeado', async () => {
      const m = await matriz(ID.uAdmin);
      expect(m.quadrantLabels).toEqual({
        healthy: 'Saudavel',
        ineffective_routine: 'Processo cumprido, resultado insuficiente',
        result_without_process: 'Resultado sem processo',
        critical: 'Critico',
        no_data: 'Sem dado suficiente',
      });
    });

    it('processo VERDE + desempenho fora do alvo = "Processo cumprido, resultado insuficiente"', async () => {
      const m = await matriz(ID.uAdmin);
      const a = m.entries.find((e) => e.operationId === ID.opA)!;
      expect(a.process.trafficLight).toBe('green');   // nota 100 >= 80
      expect(a.performance.axis).toBe('critical');    // um nao_conforme vence
      expect(a.quadrant).toBe('ineffective_routine');
    });

    it('processo VERMELHO + desempenho no alvo = "Resultado sem processo"', async () => {
      const m = await matriz(ID.uAdmin);
      const b = m.entries.find((e) => e.operationId === ID.opB)!;
      expect(b.process.score).toBe(50);
      expect(b.process.trafficLight).toBe('red');     // 50 < 70
      expect(b.performance.axis).toBe('on_target');
      expect(b.quadrant).toBe('result_without_process');
    });

    it('sem auditoria aprovada, o quadrante é NULO e o motivo é nomeado', async () => {
      const m = await matriz(ID.uAdmin);
      const c = m.entries.find((e) => e.operationId === ID2.opC)!;
      expect(c.quadrant).toBeNull();
      expect(c.dataSufficiency.reasons).toEqual(['missing_audit']);
    });

    it('a gravidade do eixo de desempenho é a da 1.3.4: um vermelho vence, senão um amarelo', async () => {
      const r = await db.query<{ st: string }>(`
        select e.status::text as st from public.assisted_cycle_entries e
          join public.assisted_cycles c on c.id = e.cycle_id
         where c.operation_id = $1 order by e.sort_order`, [ID.opA]);
      expect(r.map((x) => x.st)).toEqual(['conforme', 'atencao', 'nao_conforme']);

      const m = await matriz(ID.uAdmin);
      const a = m.entries.find((e) => e.operationId === ID.opA)!;
      expect(a.performance).toMatchObject({
        axis: 'critical', conforme: 1, atencao: 1, naoConforme: 1, semDado: 0,
      });
    });

    it('o limite do semáforo é o de 0004, e não um inventado aqui', async () => {
      const r = await db.query<{ a: string; b: string; c: string; d: string }>(`
        select app.score_traffic_light(80)::text a, app.score_traffic_light(79.99)::text b,
               app.score_traffic_light(70)::text c, app.score_traffic_light(null)::text d`);
      expect(r[0]).toEqual({ a: 'green', b: 'yellow', c: 'yellow', d: 'not_evaluated' });
    });
  });

  // =========================================================================
  // G · ESCOPO DAS AGREGAÇÕES
  // =========================================================================
  describe('G · escopo', () => {
    it('o ADMIN alcança as três operações; o GC A alcança uma', async () => {
      const admin = await matriz(ID.uAdmin);
      expect(admin.entries.map((e) => e.operationId).sort())
        .toEqual([ID.opA, ID.opB, ID2.opC].sort());

      const gc = await matriz(ID.uGcA);
      expect(gc.entries.map((e) => e.operationId)).toEqual([ID.opA]);
    });

    it('o REGIONAL alcança a própria região; o de outra região alcança a dele', async () => {
      const r1 = await matriz(ID.uReg);
      expect(r1.entries.map((e) => e.operationId).sort()).toEqual([ID.opA, ID.opB].sort());

      const r2 = await matriz(ID2.uReg2);
      expect(r2.entries.map((e) => e.operationId)).toEqual([ID2.opC]);
    });

    it('o COORDENADOR alcança a própria coordenadoria', async () => {
      const c1 = await matriz(ID.uCoord1);
      expect(c1.entries.map((e) => e.operationId)).toEqual([ID.opA]);
      const c2 = await matriz(ID.uCoord2);
      expect(c2.entries.map((e) => e.operationId)).toEqual([ID.opB]);
    });

    it('usuário SEM escopo recebe conjunto vazio — não erro, e não o banco inteiro', async () => {
      const m = await matriz(ID.uNoScope);
      expect(m.entries).toEqual([]);
      const a = await agregados(ID.uNoScope);
      expect(a.coverage.partners).toBe(0);
    });

    it('filtro por parceiro ALHEIO é recusado com a frase uniforme do inexistente', async () => {
      const alheio = await recusaSemEfeito(() => matriz(ID.uGcA, { operationIds: [ID.opB] }));
      const inexistente = await recusaSemEfeito(() => matriz(ID.uGcA, { operationIds: [NADA] }));
      expect(alheio).toBe('operacao inexistente ou fora do escopo');
      expect(inexistente).toBe(alheio);
    });

    it('filtro PARCIALMENTE alheio devolve apenas o permitido — Matriz §6', async () => {
      const m = await matriz(ID.uReg, { operationIds: [ID.opA, ID2.opC] });
      expect(m.entries.map((e) => e.operationId)).toEqual([ID.opA]);
    });

    it('filtro por GC alheio não amplia alcance — a interseção é vazia, e a recusa é uniforme', async () => {
      const m = await recusaSemEfeito(() => matriz(ID.uGcA, { channelManagerIds: [ID.uGcB] }));
      expect(m).toBe('operacao inexistente ou fora do escopo');

      // E o filtro pelo PRÓPRIO GC funciona: a recusa não é indiscriminada.
      const proprio = await matriz(ID.uGcA, { channelManagerIds: [ID.uGcA] });
      expect(proprio.entries.map((e) => e.operationId)).toEqual([ID.opA]);
    });

    it('filtro por coordenadoria alheia não amplia alcance', async () => {
      const m = await recusaSemEfeito(() => matriz(ID.uCoord1, { coordinationIds: [ID.coord2] }));
      expect(m).toBe('operacao inexistente ou fora do escopo');

      const proprio = await matriz(ID.uCoord1, { coordinationIds: [ID.coord1] });
      expect(proprio.entries.map((e) => e.operationId)).toEqual([ID.opA]);
    });

    it('filtro DESCONHECIDO é recusado por nome, não ignorado em silêncio', async () => {
      const m = await recusaSemEfeito(() => matriz(ID.uAdmin, { regionIds: [ID.region] }));
      expect(m).toBe('filtro desconhecido: regionIds');
      const m2 = await recusaSemEfeito(() => agregados(ID.uAdmin, { limit: 10 }));
      expect(m2).toBe('filtro desconhecido: limit');
    });

    it('filtro ausente significa TODO O ESCOPO AUTORIZADO, e os filtros voltam sanitizados', async () => {
      const a = await agregados(ID.uReg);
      expect(a.filters.resolvedOperationCount).toBe(2);
      expect(a.filters.operationIds.sort()).toEqual([ID.opA, ID.opB].sort());
      expect(a.filters.themeIds).toEqual([]);
      expect(a.filters.statuses).toEqual([]);
    });
  });

  // =========================================================================
  // H · AS AGREGAÇÕES
  // =========================================================================
  describe('H · agregações', () => {
    it('cobertura conta parceiros, e distingue quem tem cada módulo', async () => {
      const a = await agregados(ID.uAdmin);
      expect(a.coverage.partners).toBe(3);
      expect(Number(a.coverage.partnersWithAssisted)).toBe(3);
      expect(Number(a.coverage.partnersWithMonthlyAudit)).toBe(2);
    });

    it('os quatro status da Gestão Assistida são contados sem duplicação', async () => {
      const a = await agregados(ID.uAdmin);
      const s = a.assisted.entryStatusCounts;
      // opA: 1+1+1 · opB: 3 conformes · opC: 1 conforme  => 5 conformes
      expect(Number(s.conforme)).toBe(5);
      expect(Number(s.atencao)).toBe(1);
      expect(Number(s.nao_conforme)).toBe(1);
      expect(Number(s.sem_dado)).toBe(0);

      const total = Object.values(s).reduce((x: number, y) => x + Number(y), 0);
      const linhas = await db.query<{ n: number }>(
        `select count(*)::int as n from public.assisted_cycle_entries`);
      expect(total).toBe(linhas[0].n);
    });

    it('os quatro status da Auditoria Mensal são contados sem duplicação', async () => {
      const a = await agregados(ID.uAdmin);
      const s = a.monthlyAudit.answerStatusCounts;
      expect(Number(s.conforme)).toBe(3);
      expect(Number(s.nao_conforme)).toBe(1);
      expect(Number(s.nao_aplicavel)).toBe(0);
      expect(Number(s.nao_avaliado)).toBe(0);
    });

    it('o plano VENCIDO é derivado da data, não lido de coluna', async () => {
      const a = await agregados(ID.uAdmin);
      // O plano de opB tem prazo em 2020 e não está concluído.
      expect(Number(a.actionPlans.overdue)).toBe(1);
      expect(Number(a.actionPlans.bySource.monthly_audit)).toBe(1);
      const gravado = await db.query<{ st: string }>(
        `select status::text as st from public.action_plans`);
      expect(gravado[0].st).not.toBe('overdue');
    });

    it('a ordenação é determinística: duas chamadas iguais devolvem a MESMA ordem', async () => {
      const um = await agregados(ID.uAdmin);
      const dois = await agregados(ID.uAdmin);
      expect(JSON.stringify(um.partners)).toBe(JSON.stringify(dois.partners));
      expect(JSON.stringify(um.assisted.byIndicator)).toBe(JSON.stringify(dois.assisted.byIndicator));
      expect(um.assisted.byIndicator.map((x: any) => x.indicatorCode))
        .toEqual(['IND-F8-1', 'IND-F8-2', 'IND-F8-3', 'IND-F8-4']);
      expect(um.partners.map((p: any) => p.partnerName))
        .toEqual(['Parceiro A', 'Parceiro B', 'Parceiro C']);
    });

    it('período vazio e status vazio não quebram nem esvaziam por engano', async () => {
      const a = await agregados(ID.uAdmin, { periodFrom: '', periodTo: '', statuses: [] });
      expect(a.coverage.partners).toBe(3);
      expect(Number(a.assisted.entryStatusCounts.conforme)).toBe(5);
    });

    it('período recorta de verdade: uma janela anterior à semana devolve zero', async () => {
      const a = await agregados(ID.uAdmin, { periodFrom: '2026-01-01', periodTo: '2026-01-31' });
      expect(Number(a.coverage.partnersWithAssisted)).toBe(0);
      expect(Number(a.assisted.entryStatusCounts.conforme)).toBe(0);
    });

    it('filtro por indicador e por status combinados recortam o conjunto certo', async () => {
      const a = await agregados(ID.uAdmin, { indicatorIds: [F8.d3], statuses: ['nao_conforme'] });
      expect(Number(a.assisted.entryStatusCounts.nao_conforme)).toBe(1);
      expect(Number(a.assisted.entryStatusCounts.conforme)).toBe(0);
    });

    it('filtro por módulo isola cada módulo', async () => {
      const so = await agregados(ID.uAdmin, { modules: ['assisted'] });
      expect(Number(so.assisted.entryStatusCounts.conforme)).toBe(5);
      expect(Number(so.monthlyAudit.answerStatusCounts.conforme)).toBe(0);

      const mensal = await agregados(ID.uAdmin, { modules: ['monthly_audit'] });
      expect(Number(mensal.assisted.entryStatusCounts.conforme)).toBe(0);
      expect(Number(mensal.monthlyAudit.answerStatusCounts.conforme)).toBe(3);
    });

    it('a proveniência das regras viaja em TODA resposta do dashboard', async () => {
      const a = await agregados(ID.uAdmin);
      expect(a.ruleProvenance.monthlyProvisional).toBe(true);
      expect(a.ruleProvenance.performanceProvisional).toBe(true);
      expect(a.contractVersion).toBe('1.3.5-dashboard-1');
    });
  });
});
