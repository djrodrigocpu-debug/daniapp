/**
 * AAPEx 1.3.5 — FASE 9: o contrato SERVER-SIDE de exportação (0049).
 *
 * A frase que governa este arquivo é do Modelo Operacional §8: *"autorização,
 * escopo e filtros são resolvidos no servidor. O arquivo não pode ser um caminho
 * para contornar a RLS."* É o risco **RT-08**, e é o mais alto da fase.
 *
 * **TESTE 35, NA FORMA CANÔNICA.** A Fase 6 só pôde medi-lo na forma
 * disponível — `export_dataset` não existia. Aqui ele é medido como a Matriz §8
 * o descreve: exportação pedida sobre operação ou parceiro fora do escopo →
 * recusa uniforme, zero linhas, zero arquivo útil, zero efeito lateral e nenhuma
 * confirmação de existência.
 *
 * Dados 100% SINTÉTICOS. Nenhum ambiente remoto é tocado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

const NADA = '00000000-0000-0000-0000-0000dead0049';
const SEMANA = '2026-07-06';

const F9 = {
  theme: '00000000-0000-0000-0000-000000490001',
  themeV: '00000000-0000-0000-0000-000000490002',
  d1: '00000000-0000-0000-0000-000000490011', d1v: '00000000-0000-0000-0000-000000490012',
  cfg1: '00000000-0000-0000-0000-000000490101', cfg1V: '00000000-0000-0000-0000-000000490102',
  cfg2: '00000000-0000-0000-0000-000000490201', cfg2V: '00000000-0000-0000-0000-000000490202',
  crit: '00000000-0000-0000-0000-000000490301', critV: '00000000-0000-0000-0000-000000490302',
} as const;

interface Coluna { key: string; label: string; type: 'text' | 'number' | 'date' | 'boolean' }
interface Dataset {
  contractVersion: string; module: string; generatedAt: string; requestedBy: string;
  scope: { operationCount: number };
  filters: Record<string, unknown>;
  ruleProvenance: Record<string, unknown>;
  columns: Coluna[];
  rowCount: number;
  rows: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
}

describe('Fase 9 — export_dataset: escopo e filtros no servidor (0049)', () => {
  let db: TestDb;

  const rpc = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    db.asUser(userId, (tx) => tx.query<{ r: T }>(sql, params)).then((x) => x[0]?.r);

  const exportar = (uid: string, modulo: string, filtros: Record<string, unknown> = {}) =>
    rpc<Dataset>(uid, `select public.export_dataset($1,$2::jsonb) as r`,
      [modulo, JSON.stringify(filtros)]);

  const retrato = async () => {
    const r = await db.query<{ j: Record<string, unknown> }>(`
      select jsonb_build_object(
        'evaluations', (select count(*) from public.evaluations),
        'cycles',      (select count(*) from public.assisted_cycles),
        'entries',     (select count(*) from public.assisted_cycle_entries),
        'answers',     (select count(*) from public.evaluation_criterion_answers),
        'plans',       (select count(*) from public.action_plans),
        'evidences',   (select count(*) from public.evidence_files),
        'reservations',(select count(*) from public.evidence_upload_reservations),
        'auditLogs',   (select count(*) from public.audit_logs),
        'objects',     (select count(*) from storage.objects)
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

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);

    await db.exec(`
      insert into public.themes (id, code, scope_kind, region_id, lifecycle, created_by)
        values ('${F9.theme}','TEMA-F9','global',null,'active','${ID.uAdmin}');
      insert into public.theme_versions (id, theme_id, version_number, name, sort_order, status, active)
        values ('${F9.themeV}','${F9.theme}',1,'Tema F9',1,'published',true);
      insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind)
        values ('${F9.d1}','IND-F9','Indicador F9','active','global');
      insert into public.indicator_versions
        (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, name, status)
        values ('${F9.d1v}','${F9.d1}',1,'%','higher_better',0,0,1,'Indicador F9','published');

      insert into public.indicator_regional_configs (id, region_id, indicator_definition_id, created_by) values
        ('${F9.cfg1}','${ID.region}','${F9.d1}','${ID.uAdmin}'),
        ('${F9.cfg2}','${ID2.region2}','${F9.d1}','${ID.uAdmin}');
      insert into public.audit_criteria (id, config_id, code, lifecycle, created_by)
        values ('${F9.crit}','${F9.cfg1}','CRIT-F9','active','${ID.uAdmin}');
      insert into public.audit_criteria_versions
        (id, criterion_id, version_number, question, description, guidance, sort_order,
         required, evidence_required, allows_na, requires_justification, status, active)
        values ('${F9.critV}','${F9.crit}',1,'A rotina existe?','','',1,true,false,false,false,'published',true);
      insert into public.indicator_regional_config_versions
        (id, config_id, version_number, indicator_version_id, theme_version_id, sort_order,
         target, tolerance, weight, active, include_in_assisted_management, include_in_monthly_audit, status) values
        ('${F9.cfg1V}','${F9.cfg1}',1,'${F9.d1v}','${F9.themeV}',1,80,5,1,true,true,true,'published'),
        ('${F9.cfg2V}','${F9.cfg2}',1,'${F9.d1v}','${F9.themeV}',1,80,5,1,true,true,false,'published');
    `);

    type Ciclo = { id: string; entries: Array<{ id: string }> };
    const cA = await rpc<Ciclo>(ID.uGcA, `select public.open_assisted_cycle($1,$2) as r`, [ID.opA, SEMANA]);
    // Texto de DIAGNÓSTICO com carga de injeção — é assim que ela chegaria: por
    // um campo livre que o Gerente de Canal digita.
    await rpc(ID.uGcA, `select public.save_assisted_entry($1,$2::jsonb) as r`, [cA.entries[0].id,
      JSON.stringify({
        actual: 50, sourcePeriod: '2026-06', sourceConsultedAt: '2026-07-06',
        // Sem esquema `http` de propósito: a carga continua sendo injeção de
        // fórmula, e o teste "o arquivo não carrega URL" não vira falso positivo
        // por causa do próprio payload.
        diagnosis: '=HYPERLINK("mal.example";"clique")',
        observation: '+cmd|calc', sourceReference: '@SUM(A1:A9)',
      })]);

    const cC = await rpc<Ciclo>(ID2.uGcC, `select public.open_assisted_cycle($1,$2) as r`, [ID2.opC, SEMANA]);
    await rpc(ID2.uGcC, `select public.save_assisted_entry($1,$2::jsonb) as r`, [cC.entries[0].id,
      JSON.stringify({ actual: 95, sourcePeriod: '2026-06', sourceConsultedAt: '2026-07-06' })]);

    type Aud = { id: string; criteria: Array<{ answer: { id: string } }> };
    const aA = await rpc<Aud>(ID.uGcA, `select public.start_monthly_audit($1,$2) as r`, [ID.opA, '2026-07']);
    await rpc(ID.uGcA, `select public.save_criterion_answer($1,$2::jsonb) as r`,
      [aA.criteria[0].answer.id, JSON.stringify({ status: 'nao_conforme', diagnosis: 'd' })]);
    await rpc(ID.uGcA, `select public.save_action_plan($1::jsonb) as r`, [JSON.stringify({
      operationId: ID.opA, evaluationId: aA.id,
      monthlyCriterionAnswerId: aA.criteria[0].answer.id,
      action: '-2 pontos de perda', problem: 'p', owner: 'Resp',
      dueDate: '2020-01-01', priority: 'high',
    })]);
  }, 120_000);

  afterAll(async () => db.close());

  // =========================================================================
  // A · MÓDULOS E FILTROS
  // =========================================================================
  describe('A · contrato de entrada', () => {
    it.each(['assisted', 'monthly_audit', 'plans', 'summary'])(
      'o módulo %s existe, e devolve colunas TIPADAS', async (m) => {
        const d = await exportar(ID.uAdmin, m);
        expect(d.module).toBe(m);
        expect(d.contractVersion).toBe('1.3.5-export-1');
        expect(d.columns.length).toBeGreaterThan(0);
        for (const c of d.columns) {
          expect(['text', 'number', 'date', 'boolean']).toContain(c.type);
          expect(c.key.length).toBeGreaterThan(0);
          expect(c.label.length).toBeGreaterThan(0);
        }
        expect(d.rowCount).toBe(d.rows.length);
      });

    it('módulo desconhecido é recusado POR NOME, sem efeito', async () => {
      const m = await recusaSemEfeito(() => exportar(ID.uAdmin, 'financeiro'));
      expect(m).toBe('modulo de exportacao desconhecido: financeiro');
      const nulo = await recusaSemEfeito(() =>
        rpc(ID.uAdmin, `select public.export_dataset(null,'{}'::jsonb) as r`));
      expect(nulo).toBe('modulo de exportacao desconhecido: (nulo)');
    });

    it('filtro desconhecido é recusado por nome — a mesma regra do painel', async () => {
      const m = await recusaSemEfeito(() => exportar(ID.uAdmin, 'plans', { limite: 10 }));
      expect(m).toBe('filtro desconhecido: limite');
    });

    it('filtro com TIPO errado é recusado antes de qualquer leitura', async () => {
      const m = await recusaSemEfeito(() =>
        exportar(ID.uAdmin, 'plans', { operationIds: ID.opA }));
      expect(m).toBe('filtro operationIds deve ser uma lista');
    });

    it('os OITO filtros canônicos voltam sanitizados no payload', async () => {
      const d = await exportar(ID.uAdmin, 'assisted', {
        periodFrom: '2026-01-01', periodTo: '2026-12-31',
        themeIds: [F9.theme], statuses: ['nao_conforme'], modules: ['assisted'],
      });
      expect(d.filters.periodFrom).toBe('2026-01-01');
      expect(d.filters.periodTo).toBe('2026-12-31');
      expect(d.filters.themeIds).toEqual([F9.theme]);
      expect(d.filters.statuses).toEqual(['nao_conforme']);
      expect(d.filters.modules).toEqual(['assisted']);
      expect(d.filters.indicatorIds).toEqual([]);
      expect(d.filters.channelManagerIds).toEqual([]);
      expect(d.filters.coordinationIds).toEqual([]);
    });
  });

  // =========================================================================
  // B · TESTE 35 CANÔNICO
  // =========================================================================
  describe('B · teste 35 — exportar fora do escopo', () => {
    it.each(['assisted', 'monthly_audit', 'plans', 'summary'])(
      '%s: parceiro fora do escopo responde como o inexistente, sem linha e sem efeito',
      async (m) => {
        const alheio = await recusaSemEfeito(() =>
          exportar(ID.uGcA, m, { operationIds: [ID2.opC] }));
        const inexistente = await recusaSemEfeito(() =>
          exportar(ID.uGcA, m, { operationIds: [NADA] }));
        expect(alheio).toBe('operacao inexistente ou fora do escopo');
        expect(inexistente).toBe(alheio);
      });

    it('a recusa não cria arquivo útil: nenhuma linha volta junto com o erro', async () => {
      let dados: unknown = 'nao-atribuido';
      try {
        dados = await exportar(ID.uGcA, 'assisted', { operationIds: [ID2.opC] });
      } catch { /* esperado */ }
      expect(dados).toBe('nao-atribuido');
    });

    it('o GC exporta APENAS os próprios parceiros, sem filtro nenhum', async () => {
      const d = await exportar(ID.uGcA, 'assisted');
      expect(d.scope.operationCount).toBe(1);
      const parceiros = new Set(d.rows.map((r) => r.partnerName));
      expect([...parceiros]).toEqual(['Parceiro A']);
    });

    it('o REGIONAL de outra região não alcança as linhas da região 1', async () => {
      const d = await exportar(ID2.uReg2, 'assisted');
      const parceiros = new Set(d.rows.map((r) => r.partnerName));
      expect([...parceiros]).toEqual(['Parceiro C']);
    });

    it('o COORDENADOR exporta a própria coordenadoria', async () => {
      const d = await exportar(ID.uCoord1, 'summary');
      expect(d.rows.map((r) => r.partnerName)).toEqual(['Parceiro A']);
    });

    it('usuário sem escopo exporta conjunto VAZIO — não erro, e não o banco inteiro', async () => {
      const d = await exportar(ID.uNoScope, 'assisted');
      expect(d.rowCount).toBe(0);
      expect(d.scope.operationCount).toBe(0);
    });

    it('anon é barrado pelo grant, antes do corpo', async () => {
      const e = await db.asAnon((tx) =>
        tx.expectError(`select public.export_dataset('assisted','{}'::jsonb)`));
      expect(e.message).toMatch(/permission denied for function export_dataset/);
    });

    it('tema e indicador de outra região não trazem linha alheia', async () => {
      const d = await exportar(ID.uGcA, 'assisted', { themeIds: [F9.theme] });
      const parceiros = new Set(d.rows.map((r) => r.partnerName));
      expect([...parceiros]).toEqual(['Parceiro A']);
    });
  });

  // =========================================================================
  // C · O QUE NUNCA SAI
  // =========================================================================
  describe('C · o arquivo não carrega segredo', () => {
    it.each(['assisted', 'monthly_audit', 'plans', 'summary'])(
      '%s não devolve URL assinada, token, e-mail nem caminho de objeto', async (m) => {
        const d = await exportar(ID.uAdmin, m);
        const texto = JSON.stringify(d);
        expect(texto).not.toMatch(/https?:\/\//);
        expect(texto).not.toMatch(/@[\w.-]+\.\w{2,}/);
        expect(texto).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
        expect(texto).not.toMatch(/"(bucket|path|sourceObjectId|accessToken|apikey)"/i);
      });

    it('o solicitante aparece pelo NOME de exibição, nunca por UUID ou e-mail', async () => {
      const d = await exportar(ID.uAdmin, 'plans');
      expect(d.requestedBy).toBe('Admin Fic');
      expect(d.requestedBy).not.toMatch(/@|-[0-9a-f]{4}-/);
    });

    it('a proveniência das regras viaja junto, agora com as regras DEFINITIVAS', async () => {
      // ATUALIZADO PELA FASE 10 (A-10 e A-11 congeladas em 02/08/2026, 0050).
      // A propriedade medida é a mesma — a proveniência viaja no arquivo. O que
      // mudou é o que ela diz. A asserção GANHOU a exigência de que nenhum
      // identificador ainda anuncie pendência.
      const d = await exportar(ID.uAdmin, 'summary');
      expect(d.ruleProvenance.monthlyScoreRule).toBe('conformidade-simples-processo/1.3.5');
      expect(d.ruleProvenance.performanceScoreRule).toBe('desempenho-ponderado-status/1.3.5');
      expect(d.ruleProvenance.openDecisions).toEqual(['A-04']);
      expect(JSON.stringify(d.ruleProvenance)).not.toMatch(/pendente/i);
    });
  });

  // =========================================================================
  // D · CONTEÚDO
  // =========================================================================
  describe('D · conteúdo dos módulos', () => {
    it('Gestão Assistida traz a linha do item, com números como números', async () => {
      const d = await exportar(ID.uGcA, 'assisted');
      expect(d.rowCount).toBe(1);
      const r = d.rows[0];
      expect(r.partnerName).toBe('Parceiro A');
      expect(r.weekStartDate).toBe(SEMANA);
      expect(Number(r.target)).toBe(80);
      expect(Number(r.actual)).toBe(50);
      expect(r.status).toBe('nao_conforme');
      expect(r.hasPlan).toBe(false);
    });

    it('Auditoria Mensal traz a resposta do critério e a nota provisória', async () => {
      const d = await exportar(ID.uGcA, 'monthly_audit');
      expect(d.rowCount).toBe(1);
      expect(d.rows[0].criterionCode).toBe('CRIT-F9');
      expect(d.rows[0].status).toBe('nao_conforme');
      expect(d.rows[0].required).toBe(true);
      expect(d.columns.find((c) => c.key === 'auditScore')?.label).toContain('A-10');
    });

    it('Planos traz `overdue` DERIVADO da data, e não uma coluna gravada', async () => {
      const d = await exportar(ID.uGcA, 'plans');
      expect(d.rowCount).toBe(1);
      expect(d.rows[0].overdue).toBe(true);
      expect(d.rows[0].source).toBe('monthly_audit');
      const gravado = await db.query<{ st: string }>(`select status::text as st from public.action_plans`);
      expect(gravado[0].st).not.toBe('overdue');
    });

    it('Resumo é DEFINITIVO: perdeu o rótulo provisório e ganhou os doze itens', async () => {
      // ATUALIZADO PELA FASE 10 (A-06 congelada em 02/08/2026, 0050). Este caso
      // registrava a pendência; passa a medir o contrato. `a06` e `plansOverdue`
      // saíram do bloco — o primeiro porque a pendência fechou, o segundo porque
      // `plansByStatus` já é o item 8 do contrato e um total à parte seria
      // fórmula adicional, que o contrato proíbe.
      const d = await exportar(ID.uAdmin, 'summary');
      expect(d.summary!.label).toBe('Resumo');
      expect(JSON.stringify(d.summary)).not.toMatch(/provisor/i);
      expect(Number(d.summary!.partners)).toBe(3);
      for (const k of ['period', 'appliedFilters', 'partners', 'assistedCoverage',
        'monthlyAuditCoverage', 'performanceAxis', 'processAxis', 'plansByStatus',
        'dataSufficiency', 'weighting', 'consolidatedIndex', 'ruleVersions']) {
        expect(`${k}: ${Object.prototype.hasOwnProperty.call(d.summary, k)}`).toBe(`${k}: true`);
      }
    });

    it('o Resumo NÃO inventa ranking, meta, KPI novo nem coluna financeira', async () => {
      const d = await exportar(ID.uAdmin, 'summary');
      const chaves = d.columns.map((c) => c.key).join(' ') + ' ' + Object.keys(d.summary!).join(' ');
      expect(chaves).not.toMatch(/rank|posicao|meta(Empresarial)?\b|kpi|receita|custo|valor|R\$/i);
    });

    it('o Resumo deriva da Matriz: quadrante e ponderação vêm de lá, não de conta própria', async () => {
      const d = await exportar(ID.uAdmin, 'summary');
      const a = d.rows.find((r) => r.partnerName === 'Parceiro A')!;
      const m = await rpc<{ entries: Array<Record<string, any>> }>(
        ID.uAdmin, `select public.get_matrix_dataset('{}'::jsonb) as r`);
      const mA = m.entries.find((x) => x.operationId === ID.opA)!;
      expect(a.performanceAxis).toBe(mA.performance.axis);
      expect(a.processAxis).toBe(mA.process.axis);
      expect(a.weightingConfigured).toBe(mA.weighting.configured);
      // Sem ponderação publicada, o índice não existe em nenhum dos dois.
      // A chave passou a se chamar `consolidatedIndex` (A-06, 0050).
      expect(a.consolidatedIndex).toBeNull();
      expect(mA.weightedIndex).toBeNull();
    });

    it('a ordenação é determinística: duas chamadas devolvem a MESMA ordem', async () => {
      const um = await exportar(ID.uAdmin, 'summary');
      const dois = await exportar(ID.uAdmin, 'summary');
      expect(JSON.stringify(um.rows)).toBe(JSON.stringify(dois.rows));
      expect(um.rows.map((r) => r.partnerName))
        .toEqual(['Parceiro A', 'Parceiro B', 'Parceiro C']);
    });

    it('o texto com carga de injeção sai CRU do banco — neutralizar é do escritor', async () => {
      // O servidor não deve mutilar o dado: quem o lê por JSON tem direito ao
      // valor original. A neutralização é do CSV, e é lá que ela é medida.
      const d = await exportar(ID.uGcA, 'assisted');
      expect(d.rows[0].diagnosis).toBe('=HYPERLINK("mal.example";"clique")');
      expect(d.rows[0].observation).toBe('+cmd|calc');
      expect(d.rows[0].sourcePeriod).toBe('2026-06');
    });
  });
});
