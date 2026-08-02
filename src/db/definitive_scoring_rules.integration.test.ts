/**
 * AAPEx 1.3.5 — FASE 10: as regras empresariais DEFINITIVAS (A-10, A-11, A-06).
 *
 * Confirmadas pelo proprietário em 02/08/2026 e registradas em
 * `ADR-135-004` ANTES de uma linha de SQL. Este arquivo é a prova de que o banco
 * as implementa — e, principalmente, de que ele implementa as BORDAS.
 *
 * AS QUATRO PROPRIEDADES QUE ESTE ARQUIVO SUSTENTA:
 *
 *   (1) SEM DADO NUNCA É ZERO, e agora nem no último lugar em que ainda era.
 *       `app.monthly_audit_score` terminava em `coalesce(..., 0)`: uma auditoria
 *       inteiramente `nao_aplicavel` recebia NOTA ZERO. A decisão diz que isso é
 *       DADOS INSUFICIENTES. É a quinta camada da lição L-04, e ela vazava.
 *
 *   (2) O DESEMPENHO É PONDERADO, e o peso é o MATERIALIZADO. 100/50/0 sobre
 *       `assisted_cycle_entries.weight`, que foi copiado no ato do registro.
 *       Mudar o peso vivo do catálogo NÃO pode mexer em nota já medida — é a
 *       armadilha nº 1 do programa, na direção inversa.
 *
 *   (3) `sem_dado` TORNA O EIXO INSUFICIENTE. Não vale zero, e não é descartado
 *       para a nota subir. Descartar premiaria quem não mediu — o mesmo defeito
 *       que a proibição de renormalizar evita entre módulos.
 *
 *   (4) O ÍNDICE SÓ EXISTE COM OS DOIS EIXOS SUFICIENTES. Sem ponderação, sem um
 *       módulo, ou com dado insuficiente: não se calcula. Nunca se renormaliza.
 *
 * Dados 100% SINTÉTICOS. Nenhum ambiente remoto é tocado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

/** IDs próprios desta bateria — faixa 5000, para não colidir com a da Fase 8. */
const F10 = {
  theme: '00000000-0000-0000-0000-000000500001',
  themeV: '00000000-0000-0000-0000-000000500002',
  d1: '00000000-0000-0000-0000-000000500011', d1v: '00000000-0000-0000-0000-000000500012',
  d2: '00000000-0000-0000-0000-000000500021', d2v: '00000000-0000-0000-0000-000000500022',
  d3: '00000000-0000-0000-0000-000000500031', d3v: '00000000-0000-0000-0000-000000500032',
  d4: '00000000-0000-0000-0000-000000500041', d4v: '00000000-0000-0000-0000-000000500042',
  cfg1: '00000000-0000-0000-0000-000000500101',
  cfg2: '00000000-0000-0000-0000-000000500102',
  cfg3: '00000000-0000-0000-0000-000000500103',
  cfg4: '00000000-0000-0000-0000-000000500104',
  cfgv1: '00000000-0000-0000-0000-000000500301',
  cfgv2: '00000000-0000-0000-0000-000000500302',
  cfgv3: '00000000-0000-0000-0000-000000500303',
  cfgv4: '00000000-0000-0000-0000-000000500304',
  critA: '00000000-0000-0000-0000-000000500201', critAv: '00000000-0000-0000-0000-000000500202',
  critB: '00000000-0000-0000-0000-000000500211', critBv: '00000000-0000-0000-0000-000000500212',
  /** Quarto parceiro, na região 1 — o caso `sem_dado` e o caso "tudo N/A". */
  opD: '00000000-0000-0000-0000-0000005000d1',
} as const;

const SEMANA = '2026-07-06';
const COMPETENCIA = '2026-07';

interface Perf {
  axis: string; score: number | null; sufficient: boolean;
  insufficiencyReasons: string[]; weightSum: number;
  conforme: number; atencao: number; naoConforme: number; semDado: number;
}
interface Proc {
  axis: string; score: number | null; sufficient: boolean;
  insufficiencyReasons: string[]; trafficLight: string; auditsConsidered: number;
  conforme?: number; naoConforme?: number; naoAplicavel?: number;
}
interface Entrada {
  operationId: string; partnerName: string; regionId: string;
  performance: Perf; process: Proc; quadrant: string | null;
  dataSufficiency: { sufficient: boolean; reasons: string[] };
  weighting: { configured: boolean; reason?: string; assistedWeight?: number; auditWeight?: number; id?: string };
  weightedIndex: null | {
    value: number; assistedComponent: number; auditComponent: number;
    weightingVersionId: string; performanceRule: string; processRule: string;
  };
}
interface Matriz {
  contractVersion: string;
  ruleProvenance: Record<string, unknown>;
  entries: Entrada[];
}

describe('Fase 10 — regras empresariais definitivas: A-10, A-11 e A-06 (0050)', () => {
  let db: TestDb;

  const rpc = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    db.asUser(userId, (tx) => tx.query<{ r: T }>(sql, params)).then((x) => x[0]?.r);

  const matriz = (uid: string, filtros: Record<string, unknown> = {}) =>
    rpc<Matriz>(uid, `select public.get_matrix_dataset($1::jsonb) as r`, [JSON.stringify(filtros)]);

  const entrada = async (uid: string, op: string, filtros: Record<string, unknown> = {}) => {
    const m = await matriz(uid, filtros);
    return m.entries.find((e) => e.operationId === op)!;
  };

  const registrar = (uid: string, entryId: string, actual: number | null) =>
    rpc(uid, `select public.save_assisted_entry($1,$2::jsonb) as r`, [entryId, JSON.stringify({
      actual, sourcePeriod: '2026-06', sourceConsultedAt: '2026-07-06',
      sourceReference: 'painel', observation: '', diagnosis: actual === null ? '' : 'diagnostico',
    })]);

  type Ciclo = { id: string; entries: Array<{ id: string; indicatorCode: string }> };
  type Aud = { id: string; criteria: Array<{ id: string; criterionCode: string; answer: { id: string } }> };

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);

    // Quarto parceiro na região 1, sob o Coord 1 e o GC A.
    await db.exec(`
      insert into public.operations
        (id, unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id)
      values ('${F10.opD}','${ID.unit}','${ID.coord1}','Parceiro D','Loja D','Maringa','PR','${ID.uGcA}');
      insert into public.operation_assignments (operation_id, user_id)
      values ('${F10.opD}','${ID.uGcA}');
    `);

    // ---------------------------------------------------------------------
    // Catálogo. Os PESOS SÃO DIFERENTES de propósito: com todos iguais a 1, a
    // média ponderada e a aritmética coincidem, e o teste passaria por sorte.
    // ---------------------------------------------------------------------
    await db.exec(`
      insert into public.themes (id, code, scope_kind, region_id, lifecycle, created_by) values
        ('${F10.theme}','TEMA-F10','global',null,'active','${ID.uAdmin}');
      insert into public.theme_versions (id, theme_id, version_number, name, sort_order, status, active)
        values ('${F10.themeV}','${F10.theme}',1,'Tema F10',1,'published',true);

      insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind) values
        ('${F10.d1}','IND-F10-1','Indicador F10 1','active','global'),
        ('${F10.d2}','IND-F10-2','Indicador F10 2','active','global'),
        ('${F10.d3}','IND-F10-3','Indicador F10 3','active','global'),
        ('${F10.d4}','IND-F10-4','Indicador F10 4','active','global');
      insert into public.indicator_versions
        (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, name, status) values
        ('${F10.d1v}','${F10.d1}',1,'%','higher_better',0,0,1,'Indicador F10 1','published'),
        ('${F10.d2v}','${F10.d2}',1,'%','higher_better',0,0,1,'Indicador F10 2','published'),
        ('${F10.d3v}','${F10.d3}',1,'%','higher_better',0,0,1,'Indicador F10 3','published'),
        ('${F10.d4v}','${F10.d4}',1,'%','higher_better',0,0,1,'Indicador F10 4','published');

      insert into public.indicator_regional_configs (id, region_id, indicator_definition_id, created_by) values
        ('${F10.cfg1}','${ID.region}','${F10.d1}','${ID.uAdmin}'),
        ('${F10.cfg2}','${ID.region}','${F10.d2}','${ID.uAdmin}'),
        ('${F10.cfg3}','${ID.region}','${F10.d3}','${ID.uAdmin}'),
        ('${F10.cfg4}','${ID2.region2}','${F10.d4}','${ID.uAdmin}');

      insert into public.audit_criteria (id, config_id, code, lifecycle, created_by) values
        ('${F10.critA}','${F10.cfg2}','CRIT-F10-A','active','${ID.uAdmin}'),
        ('${F10.critB}','${F10.cfg3}','CRIT-F10-B','active','${ID.uAdmin}');
      -- allows_na = true nos dois: e o que permite provar "tudo N/A".
      insert into public.audit_criteria_versions
        (id, criterion_id, version_number, question, description, guidance, sort_order,
         required, evidence_required, allows_na, requires_justification, status, active) values
        ('${F10.critAv}','${F10.critA}',1,'A rotina A existe?','','',1,true,false,true,false,'published',true),
        ('${F10.critBv}','${F10.critB}',1,'A rotina B existe?','','',2,true,false,true,false,'published',true);

      -- PESOS: 3, 1, 1. Soma 5.
      insert into public.indicator_regional_config_versions
        (id, config_id, version_number, indicator_version_id, theme_version_id, sort_order,
         target, tolerance, weight, active, include_in_assisted_management, include_in_monthly_audit, status) values
        ('${F10.cfgv1}','${F10.cfg1}',1,'${F10.d1v}','${F10.themeV}',1,80,5,3,true,true,false,'published'),
        ('${F10.cfgv2}','${F10.cfg2}',1,'${F10.d2v}','${F10.themeV}',2,80,5,1,true,true,true,'published'),
        ('${F10.cfgv3}','${F10.cfg3}',1,'${F10.d3v}','${F10.themeV}',3,80,5,1,true,true,true,'published'),
        ('${F10.cfgv4}','${F10.cfg4}',1,'${F10.d4v}','${F10.themeV}',1,80,5,1,true,true,false,'published');
    `);

    const byCode = (c: Ciclo, code: string) => c.entries.find((e) => e.indicatorCode === code)!.id;

    // opA — conforme(peso 3) · atencao(peso 1) · nao_conforme(peso 1)
    //   ponderado: (100*3 + 50*1 + 0*1) / 5 = 70,00
    //   proporcao simples antiga seria 1/3 = 33,33 — os números NÃO coincidem.
    const cA = await rpc<Ciclo>(ID.uGcA, `select public.open_assisted_cycle($1,$2) as r`, [ID.opA, SEMANA]);
    await registrar(ID.uGcA, byCode(cA, 'IND-F10-1'), 90);
    await registrar(ID.uGcA, byCode(cA, 'IND-F10-2'), 77);
    await registrar(ID.uGcA, byCode(cA, 'IND-F10-3'), 50);

    // opB — os três conformes: 100,00.
    const cB = await rpc<Ciclo>(ID.uGcB, `select public.open_assisted_cycle($1,$2) as r`, [ID.opB, SEMANA]);
    for (const e of cB.entries) await registrar(ID.uGcB, e.id, 95);

    // opD — conforme · SEM DADO · conforme. A antiga daria 100 descartando o
    // sem_dado; a definitiva declara o eixo INSUFICIENTE.
    const cD = await rpc<Ciclo>(ID.uGcA, `select public.open_assisted_cycle($1,$2) as r`, [F10.opD, SEMANA]);
    await registrar(ID.uGcA, byCode(cD, 'IND-F10-1'), 90);
    await registrar(ID.uGcA, byCode(cD, 'IND-F10-2'), null);
    await registrar(ID.uGcA, byCode(cD, 'IND-F10-3'), 95);

    // opC — região 2, um item conforme, e NENHUMA auditoria mensal.
    const cC = await rpc<Ciclo>(ID2.uGcC, `select public.open_assisted_cycle($1,$2) as r`, [ID2.opC, SEMANA]);
    for (const e of cC.entries) await registrar(ID2.uGcC, e.id, 95);

    // ---------------------------------------------------------------------
    // Auditoria Mensal, pelo caminho oficial até a aprovação.
    // ---------------------------------------------------------------------
    const responder = async (uid: string, aud: Aud, code: string, status: string) => {
      const a = aud.criteria.find((c) => c.criterionCode === code)!;
      await rpc(uid, `select public.save_criterion_answer($1,$2::jsonb) as r`, [a.answer.id,
        JSON.stringify({
          status,
          diagnosis: status === 'nao_conforme' ? 'diagnostico' : '',
          notApplicableReason: status === 'nao_aplicavel' ? 'nao se aplica a este parceiro' : '',
        })]);
    };

    // opA — duas conformes: 100.
    const aA = await rpc<Aud>(ID.uGcA, `select public.start_monthly_audit($1,$2) as r`, [ID.opA, COMPETENCIA]);
    await responder(ID.uGcA, aA, 'CRIT-F10-A', 'conforme');
    await responder(ID.uGcA, aA, 'CRIT-F10-B', 'conforme');
    await rpc(ID.uGcA, `select public.submit_monthly_audit($1) as r`, [aA.id]);
    await rpc(ID.uCoord1, `select public.validate_evaluation($1,$2,$3) as r`, [aA.id, 'approved', 'ok']);

    // opB — uma conforme, uma N/A: 1/(1+0) = 100. N/A fora dos DOIS lados.
    const aB = await rpc<Aud>(ID.uGcB, `select public.start_monthly_audit($1,$2) as r`, [ID.opB, COMPETENCIA]);
    await responder(ID.uGcB, aB, 'CRIT-F10-A', 'conforme');
    await responder(ID.uGcB, aB, 'CRIT-F10-B', 'nao_aplicavel');
    await rpc(ID.uGcB, `select public.submit_monthly_audit($1) as r`, [aB.id]);
    await rpc(ID.uCoord2, `select public.validate_evaluation($1,$2,$3) as r`, [aB.id, 'approved', 'ok']);

    // opD — TUDO N/A: denominador zero. A antiga devolvia 0; a definitiva, NULL.
    const aD = await rpc<Aud>(ID.uGcA, `select public.start_monthly_audit($1,$2) as r`, [F10.opD, COMPETENCIA]);
    await responder(ID.uGcA, aD, 'CRIT-F10-A', 'nao_aplicavel');
    await responder(ID.uGcA, aD, 'CRIT-F10-B', 'nao_aplicavel');
    await rpc(ID.uGcA, `select public.submit_monthly_audit($1) as r`, [aD.id]);
    await rpc(ID.uCoord1, `select public.validate_evaluation($1,$2,$3) as r`, [aD.id, 'approved', 'ok']);
  }, 180_000);

  afterAll(async () => db.close());

  // =========================================================================
  // A · A-10 — PONTUAÇÃO DO PROCESSO
  // =========================================================================
  describe('A · A-10, pontuação do processo', () => {
    it('1 — conformes / (conformes + nao_conformes) x 100', async () => {
      const r = await db.query<{ s: string | null }>(`
        select app.monthly_audit_score(e.id)::text as s from public.evaluations e
         where e.operation_id = '${ID.opA}' and e.evaluation_model = 'monthly_criteria'`);
      expect(Number(r[0].s)).toBeCloseTo(100, 2);
    });

    it('2 — `nao_aplicavel` fica fora do NUMERADOR e do DENOMINADOR', async () => {
      // opB: 1 conforme + 1 N/A. Se o N/A entrasse no denominador daria 50.
      const r = await db.query<{ s: string | null }>(`
        select app.monthly_audit_score(e.id)::text as s from public.evaluations e
         where e.operation_id = '${ID.opB}' and e.evaluation_model = 'monthly_criteria'`);
      expect(Number(r[0].s)).toBeCloseTo(100, 2);
    });

    it('3 — ZERO APLICÁVEIS é NULL, e não zero — a borda que o `coalesce` escondia', async () => {
      const r = await db.query<{ s: string | null }>(`
        select app.monthly_audit_score(e.id)::text as s from public.evaluations e
         where e.operation_id = '${F10.opD}' and e.evaluation_model = 'monthly_criteria'`);
      expect(r[0].s).toBeNull();
    });

    it('4 — a nota GRAVADA da auditoria tudo-N/A também é nula, não zero', async () => {
      const r = await db.query<{ s: string | null; snap: string | null }>(`
        select e.score::text as s,
               (select o.score::text from public.official_snapshots o
                 where o.evaluation_id = e.id order by o.created_at desc limit 1) as snap
          from public.evaluations e
         where e.operation_id = '${F10.opD}' and e.evaluation_model = 'monthly_criteria'`);
      expect(r[0].s).toBeNull();
      expect(r[0].snap).toBeNull();
    });

    it('5 — o eixo de processo da tudo-N/A é INSUFICIENTE, e não vira zero na Matriz', async () => {
      const d = await entrada(ID.uAdmin, F10.opD);
      expect(d.process.score).toBeNull();
      expect(d.process.sufficient).toBe(false);
      expect(d.process.insufficiencyReasons).toContain('no_applicable_criteria');
      expect(d.process.axis).not.toBe('red');
    });

    it('6 — critério obrigatório `nao_avaliado` impede a submissão', async () => {
      const aud = await rpc<Aud>(ID2.uGcC,
        `select public.start_monthly_audit($1,$2) as r`, [ID2.opC, '2026-09']);
      // A região 2 não tem indicador auditável: a auditoria nasce sem critérios.
      // O caso do `nao_avaliado` é medido na região 1, sobre uma competência nova.
      const a2 = await rpc<Aud>(ID.uGcB,
        `select public.start_monthly_audit($1,$2) as r`, [ID.opB, '2026-09']);
      expect(a2.criteria.length).toBeGreaterThan(0);
      await expect(rpc(ID.uGcB, `select public.submit_monthly_audit($1) as r`, [a2.id]))
        .rejects.toThrow(/nao avaliad|nao respondid|obrigat/i);
      expect(aud.id).toBeTruthy();
    });

    it('7 — a proveniência é DEFINITIVA e não diz "pendente"', async () => {
      const m = await matriz(ID.uAdmin);
      expect(m.ruleProvenance.monthlyScoreRule).toBe('conformidade-simples-processo/1.3.5');
      expect(String(m.ruleProvenance.monthlyScoreRule)).not.toMatch(/pendente|provisor/i);
      expect(m.ruleProvenance.monthlyProvisional).toBe(false);
    });
  });

  // =========================================================================
  // B · A-11 — PONTUAÇÃO DO DESEMPENHO
  // =========================================================================
  describe('B · A-11, pontuação do desempenho', () => {
    it('8 — conforme vale 100: três conformes dão 100,00', async () => {
      const b = await entrada(ID.uAdmin, ID.opB);
      expect(b.performance.score).toBeCloseTo(100, 2);
      expect(b.performance.sufficient).toBe(true);
    });

    it('9 — a MÉDIA É PONDERADA pelo peso materializado: 70,00, e não 33,33', async () => {
      // conforme(peso 3)=300 · atencao(peso 1)=50 · nao_conforme(peso 1)=0
      // (300 + 50 + 0) / 5 = 70,00
      const a = await entrada(ID.uAdmin, ID.opA);
      expect(a.performance.score).toBeCloseTo(70, 2);
      expect(a.performance.weightSum).toBeCloseTo(5, 2);
      // A regra antiga (proporção simples) daria 33,33. Não pode voltar.
      expect(a.performance.score).not.toBeCloseTo(33.33, 1);
    });

    it('10 — `atencao` vale exatamente MEIA conformidade, e não zero', async () => {
      // Prova isolada: se `atencao` valesse 0, opA daria (300+0+0)/5 = 60.
      const a = await entrada(ID.uAdmin, ID.opA);
      expect(a.performance.score).not.toBeCloseTo(60, 1);
      expect(a.performance.score).toBeCloseTo(70, 2);
    });

    it('11 — `sem_dado` TORNA O EIXO INSUFICIENTE, e não é descartado', async () => {
      // opD tem 2 conformes e 1 sem_dado. Descartando daria 100.
      const d = await entrada(ID.uAdmin, F10.opD);
      expect(d.performance.sufficient).toBe(false);
      expect(d.performance.insufficiencyReasons).toContain('incomplete_measurement');
      expect(d.performance.score).toBeNull();
      expect(d.performance.semDado).toBe(1);
    });

    it('12 — `sem_dado` também não vale zero: a nota é ausente, não baixa', async () => {
      const d = await entrada(ID.uAdmin, F10.opD);
      expect(d.performance.score).toBeNull();
      expect(d.performance.score).not.toBe(0);
    });

    it('13 — soma de pesos <= 0 é DADOS INSUFICIENTES', async () => {
      const antes = await entrada(ID.uAdmin, ID.opB);
      expect(antes.performance.score).toBeCloseTo(100, 2);

      await db.exec(`
        update public.assisted_cycle_entries e set weight = 0
          from public.assisted_cycles c
         where c.id = e.cycle_id and c.operation_id = '${ID.opB}'`);
      const zerado = await entrada(ID.uAdmin, ID.opB);
      expect(zerado.performance.sufficient).toBe(false);
      expect(zerado.performance.insufficiencyReasons).toContain('weight_sum_not_positive');
      expect(zerado.performance.score).toBeNull();

      await db.exec(`
        update public.assisted_cycle_entries e set weight = 1
          from public.assisted_cycles c
         where c.id = e.cycle_id and c.operation_id = '${ID.opB}'`);
      const restaurado = await entrada(ID.uAdmin, ID.opB);
      expect(restaurado.performance.score).toBeCloseTo(100, 2);
    });

    it('14 — o HISTÓRICO NÃO USA PESO VIVO: mexer no catálogo não move a nota', async () => {
      const antes = await entrada(ID.uAdmin, ID.opA);
      expect(antes.performance.score).toBeCloseTo(70, 2);

      // Peso vivo da configuração regional E da versão legada do indicador.
      await db.exec(`
        update public.indicator_regional_config_versions set weight = 999 where id = '${F10.cfgv1}';
        update public.indicator_versions set weight = 999 where id = '${F10.d1v}';`);
      const depois = await entrada(ID.uAdmin, ID.opA);
      expect(depois.performance.score).toBeCloseTo(70, 2);
      expect(depois.performance.weightSum).toBeCloseTo(5, 2);

      await db.exec(`
        update public.indicator_regional_config_versions set weight = 3 where id = '${F10.cfgv1}';
        update public.indicator_versions set weight = 1 where id = '${F10.d1v}';`);
    });

    it('15 — nenhuma medição no recorte é insuficiência, e não nota zero', async () => {
      const a = await entrada(ID.uAdmin, ID.opA, { periodFrom: '2020-01-01', periodTo: '2020-12-31' });
      expect(a.performance.sufficient).toBe(false);
      expect(a.performance.insufficiencyReasons).toContain('missing_measurement');
      expect(a.performance.score).toBeNull();
    });

    it('16 — a proveniência do desempenho é DEFINITIVA', async () => {
      const m = await matriz(ID.uAdmin);
      expect(m.ruleProvenance.performanceScoreRule).toBe('desempenho-ponderado-status/1.3.5');
      expect(String(m.ruleProvenance.performanceScoreRule)).not.toMatch(/pendente|provisor/i);
      expect(m.ruleProvenance.performanceProvisional).toBe(false);
    });

    it('17 — A-10 e A-11 saíram da lista de decisões abertas; A-04 continua nela', async () => {
      const m = await matriz(ID.uAdmin);
      const abertas = m.ruleProvenance.openDecisions as string[];
      expect(abertas).toContain('A-04');
      expect(abertas).not.toContain('A-10');
      expect(abertas).not.toContain('A-11');
    });
  });

  // =========================================================================
  // C · O ÍNDICE CONSOLIDADO
  // =========================================================================
  describe('C · a ponderação entre os módulos', () => {
    const publicar = async (region: string, assisted: number, audit: number) => {
      await rpc(ID.uAdmin, `select public.catalog_save_region_weighting_draft($1,$2::jsonb) as r`,
        [region, JSON.stringify({ assistedWeight: assisted, auditWeight: audit, effectiveFrom: '2026-01-01' })]);
      const d = await db.query<{ id: string }>(`
        select id from public.region_weightings
         where region_id = $1 and status = 'draft' order by version_number desc limit 1`, [region]);
      await rpc(ID.uAdmin, `select public.catalog_publish_region_weighting($1) as r`, [d[0].id]);
    };

    it('18 — SEM ponderação publicada não há índice, e a tabela está vazia', async () => {
      const n = await db.query<{ n: number }>(`select count(*)::int as n from public.region_weightings`);
      expect(n[0].n).toBe(0);
      const a = await entrada(ID.uAdmin, ID.opA);
      expect(a.weighting.configured).toBe(false);
      expect(a.weightedIndex).toBeNull();
      // Os DOIS eixos continuam sendo entregues.
      expect(a.performance.score).not.toBeNull();
      expect(a.process.score).not.toBeNull();
    });

    it('19 — COM ponderação e os dois eixos suficientes, o índice existe e é a fórmula', async () => {
      await publicar(ID.region, 60, 40);
      const a = await entrada(ID.uAdmin, ID.opA);
      expect(a.weighting.configured).toBe(true);
      expect(a.weightedIndex).not.toBeNull();
      // 70 * 0,6 + 100 * 0,4 = 82,00
      expect(a.weightedIndex!.value).toBeCloseTo(82, 2);
      expect(a.weightedIndex!.assistedComponent).toBeCloseTo(70, 2);
      expect(a.weightedIndex!.auditComponent).toBeCloseTo(100, 2);
    });

    it('20 — o índice carrega a versão da ponderação e as DUAS versões de regra', async () => {
      const a = await entrada(ID.uAdmin, ID.opA);
      const atual = await db.query<{ id: string }>(`
        select id from public.region_weightings
         where region_id = '${ID.region}' and status = 'published' and effective_to is null`);
      expect(a.weightedIndex!.weightingVersionId).toBe(atual[0].id);
      expect(a.weightedIndex!.performanceRule).toBe('desempenho-ponderado-status/1.3.5');
      expect(a.weightedIndex!.processRule).toBe('conformidade-simples-processo/1.3.5');
    });

    it('21 — o índice NÃO é mais anunciado como provisório', async () => {
      const a = await entrada(ID.uAdmin, ID.opA);
      expect(JSON.stringify(a.weightedIndex)).not.toMatch(/provisional|provisor/i);
    });

    it('22 — DESEMPENHO insuficiente: sem índice, e o peso do processo NÃO é renormalizado', async () => {
      const d = await entrada(ID.uAdmin, F10.opD);
      expect(d.weighting.configured).toBe(true);
      expect(d.weightedIndex).toBeNull();
      expect(d.dataSufficiency.sufficient).toBe(false);
    });

    it('23 — MÓDULO AUSENTE: sem índice, sem renormalizar — e sem virar nota cheia', async () => {
      await publicar(ID2.region2, 50, 50);
      const c = await entrada(ID2.uReg2, ID2.opC);
      expect(c.performance.score).toBeCloseTo(100, 2);   // eixo de desempenho existe
      expect(c.process.score).toBeNull();                 // não há auditoria mensal
      expect(c.weighting.configured).toBe(true);
      // Renormalizando, o parceiro sem auditoria teria índice 100 — o melhor de todos.
      expect(c.weightedIndex).toBeNull();
      expect(c.dataSufficiency.reasons).toContain('missing_audit');
    });
  });

  // =========================================================================
  // D · A-06 — O RESUMO DEFINITIVO
  // =========================================================================
  describe('D · A-06, o conteúdo do Resumo', () => {
    const resumo = () => rpc<any>(ID.uAdmin, `select public.export_dataset($1,$2::jsonb) as r`,
      ['summary', JSON.stringify({})]);

    it('24 — o rótulo perdeu "provisório" e passou a ser apenas "Resumo"', async () => {
      const r = await resumo();
      expect(r.summary.label).toBe('Resumo');
      expect(JSON.stringify(r.summary)).not.toMatch(/provisor/i);
    });

    it('25 — os treze itens do contrato estão presentes', async () => {
      const r = await resumo();
      const s = r.summary;
      for (const k of [
        'period', 'appliedFilters', 'partners', 'assistedCoverage', 'monthlyAuditCoverage',
        'performanceAxis', 'processAxis', 'plansByStatus', 'dataSufficiency',
        'weighting', 'consolidatedIndex', 'ruleVersions',
      ]) {
        expect(`${k}: ${Object.prototype.hasOwnProperty.call(s, k)}`).toBe(`${k}: true`);
      }
    });

    it('26 — nenhum dos SETE conteúdos proibidos aparece', async () => {
      const r = await resumo();
      const texto = JSON.stringify(r).toLowerCase();
      for (const proibido of ['ranking', 'posicao relativa', 'meta empresarial',
        'semaforo executivo', 'projecao', 'receita', 'faturamento', 'financeir']) {
        expect(`${proibido}: ${texto.includes(proibido)}`).toBe(`${proibido}: false`);
      }
    });

    it('27 — as versões das regras utilizadas viajam no Resumo', async () => {
      const r = await resumo();
      expect(r.summary.ruleVersions.performanceScoreRule).toBe('desempenho-ponderado-status/1.3.5');
      expect(r.summary.ruleVersions.monthlyScoreRule).toBe('conformidade-simples-processo/1.3.5');
    });

    it('28 — o índice consolidado do Resumo só aparece quando é permitido', async () => {
      const r = await resumo();
      const linhas = r.rows as Array<Record<string, unknown>>;
      const d = linhas.find((x) => x.partnerName === 'Parceiro D')!;
      expect(d.consolidatedIndex).toBeNull();
      const a = linhas.find((x) => x.partnerName === 'Parceiro A')!;
      expect(a.consolidatedIndex).toBeCloseTo(82, 2);
    });

    it('29 — "sem dado" chega ao arquivo como ausência, nunca como zero', async () => {
      const r = await resumo();
      const linhas = r.rows as Array<Record<string, unknown>>;
      const d = linhas.find((x) => x.partnerName === 'Parceiro D')!;
      expect(d.performanceScore).toBeNull();
      expect(d.processScore).toBeNull();
      expect(d.performanceScore).not.toBe(0);
    });

    it('30 — nenhum rótulo de coluna ainda diz "provisória"', async () => {
      const r = await resumo();
      const rotulos = (r.columns as Array<{ label: string }>).map((c) => c.label).join(' | ');
      expect(rotulos).not.toMatch(/provisor/i);
      expect(rotulos).not.toMatch(/A-10|A-11/);
    });
  });
});
