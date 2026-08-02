/**
 * AAPEx 1.3.5 — FASE 10: o Relatório Oficial da Auditoria Mensal (0051).
 *
 * A decisão **A-05** foi congelada em 02/08/2026: duas constantes de formato,
 * nunca uma, e um caminho independente do legado.
 *
 * AS CINCO PROPRIEDADES QUE ESTE ARQUIVO SUSTENTA:
 *
 *   (1) O RELATÓRIO NASCE DO SNAPSHOT, E SÓ DELE. Mudar catálogo, tema,
 *       configuração regional, critério vigente, plano ou responsável DEPOIS da
 *       aprovação não pode alterar uma vírgula do documento. É a diferença entre
 *       um relatório oficial e um relatório atual.
 *
 *   (2) `1.3.3` CONTINUA SENDO `1.3.3`. A constante histórica identifica os
 *       quarenta documentos já emitidos, cujos códigos são dívida não remedida.
 *       Reutilizá-la teria invalidado uma prova para poupar uma linha.
 *
 *   (3) O ESCOPO VEM ANTES DA EXISTÊNCIA. Um UUID alheio responde exatamente o
 *       que responde um UUID inexistente — varrer não pode distinguir os dois.
 *
 *   (4) AUSÊNCIA NÃO É ZERO, nem aqui. Uma auditoria inteiramente
 *       `nao_aplicavel` sai com nota NULA e insuficiência declarada.
 *
 *   (5) `generatedAt` NÃO ALTERA O DOCUMENTO. Duas gerações da mesma auditoria
 *       diferem nele, e em nada mais.
 *
 * Dados 100% SINTÉTICOS. Nenhum ambiente remoto é tocado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

const INEXISTENTE = '00000000-0000-0000-0000-0000dead0051';

const R = {
  theme: '00000000-0000-0000-0000-000000510001',
  themeV: '00000000-0000-0000-0000-000000510002',
  d1: '00000000-0000-0000-0000-000000510011', d1v: '00000000-0000-0000-0000-000000510012',
  d2: '00000000-0000-0000-0000-000000510021', d2v: '00000000-0000-0000-0000-000000510022',
  cfg1: '00000000-0000-0000-0000-000000510101',
  cfg2: '00000000-0000-0000-0000-000000510102',
  cfgv1: '00000000-0000-0000-0000-000000510201',
  cfgv2: '00000000-0000-0000-0000-000000510202',
  critA: '00000000-0000-0000-0000-000000510301', critAv: '00000000-0000-0000-0000-000000510302',
  critB: '00000000-0000-0000-0000-000000510311', critBv: '00000000-0000-0000-0000-000000510312',
} as const;

interface Relatorio {
  identity: {
    reportFormatVersion: string; evaluationId: string; operationId: string;
    partnerName: string; competence: string; periodStart: string; periodEnd: string;
    status: string; approvedBy: string; approvedAt: string; snapshotId: string;
  };
  summary: {
    processScore: number | null; sufficient: boolean; insufficiencyReasons: string[];
    totalCriteria: number; applicableCriteria: number; conformCount: number;
    nonConformCount: number; notApplicableCount: number; notEvaluatedCount: number;
    plansByStatus: Record<string, number>;
    ruleVersions: { processScoreRule: string; reportFormatVersion: string };
  };
  content: Array<{
    themeCode: string; themeName: string; indicatorCode: string; indicatorName: string;
    criterionCode: string; question: string; description: string; guidance: string;
    required: boolean; evidenceRequired: boolean; allowsNa: boolean;
    answer: string; justification: string; observation: string; diagnosis: string;
    evidences: Array<{ name: string; mimeType: string; sizeBytes: number }>;
    plans: Array<{ action: string; owner: string; dueDate: string; priority: string; status: string }>;
  }>;
  integrity: {
    formatVersion: string; ruleVersion: string; canonicalization: string; ordering: string;
  };
  generatedAt: string;
}

describe('Fase 10 — Relatório Oficial da Auditoria Mensal 1.3.5 (0051)', () => {
  let db: TestDb;
  let audA: { id: string };
  let audNa: { id: string };
  let draft: { id: string };

  const rpc = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    db.asUser(userId, (tx) => tx.query<{ r: T }>(sql, params)).then((x) => x[0]?.r);

  const relatorio = (uid: string, evalId: string) =>
    rpc<Relatorio>(uid, `select public.get_monthly_audit_report_data($1) as r`, [evalId]);

  const recusa = async (fn: () => Promise<unknown>): Promise<string> => {
    try {
      await fn();
      throw new Error('ESPERAVA RECUSA, mas a operação foi permitida');
    } catch (e) {
      const m = (e as Error).message;
      if (m.startsWith('ESPERAVA RECUSA')) throw e;
      return m;
    }
  };

  type Aud = { id: string; criteria: Array<{ id: string; criterionCode: string; answer: { id: string } }> };

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);

    await db.exec(`
      insert into public.themes (id, code, scope_kind, region_id, lifecycle, created_by) values
        ('${R.theme}','TEMA-R51','global',null,'active','${ID.uAdmin}');
      insert into public.theme_versions (id, theme_id, version_number, name, sort_order, status, active)
        values ('${R.themeV}','${R.theme}',1,'Tema do relatorio',1,'published',true);

      insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind) values
        ('${R.d1}','IND-R51-1','Indicador de relatorio 1','active','global'),
        ('${R.d2}','IND-R51-2','Indicador de relatorio 2','active','global');
      insert into public.indicator_versions
        (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, name, status) values
        ('${R.d1v}','${R.d1}',1,'%','higher_better',0,0,1,'Indicador de relatorio 1','published'),
        ('${R.d2v}','${R.d2}',1,'%','higher_better',0,0,1,'Indicador de relatorio 2','published');

      insert into public.indicator_regional_configs (id, region_id, indicator_definition_id, created_by) values
        ('${R.cfg1}','${ID.region}','${R.d1}','${ID.uAdmin}'),
        ('${R.cfg2}','${ID.region}','${R.d2}','${ID.uAdmin}');

      insert into public.audit_criteria (id, config_id, code, lifecycle, created_by) values
        ('${R.critA}','${R.cfg1}','CRIT-R51-A','active','${ID.uAdmin}'),
        ('${R.critB}','${R.cfg2}','CRIT-R51-B','active','${ID.uAdmin}');
      insert into public.audit_criteria_versions
        (id, criterion_id, version_number, question, description, guidance, sort_order,
         required, evidence_required, allows_na, requires_justification, status, active) values
        ('${R.critAv}','${R.critA}',1,'A rotina A esta implantada e e executada?',
         'Descricao da rotina A','Orientacao de verificacao A',1,true,false,true,false,'published',true),
        ('${R.critBv}','${R.critB}',1,'A rotina B esta implantada e e executada?',
         'Descricao da rotina B','Orientacao de verificacao B',2,true,false,true,false,'published',true);

      insert into public.indicator_regional_config_versions
        (id, config_id, version_number, indicator_version_id, theme_version_id, sort_order,
         target, tolerance, weight, active, include_in_assisted_management, include_in_monthly_audit, status) values
        ('${R.cfgv1}','${R.cfg1}',1,'${R.d1v}','${R.themeV}',1,80,5,1,true,true,true,'published'),
        ('${R.cfgv2}','${R.cfg2}',1,'${R.d2v}','${R.themeV}',2,80,5,1,true,true,true,'published');
    `);

    const responder = async (uid: string, aud: Aud, code: string, status: string) => {
      const a = aud.criteria.find((c) => c.criterionCode === code)!;
      await rpc(uid, `select public.save_criterion_answer($1,$2::jsonb) as r`, [a.answer.id,
        JSON.stringify({
          status,
          diagnosis: status === 'nao_conforme' ? 'A rotina nao existe no parceiro' : '',
          observation: 'Observacao com acentuacao: avaliação e execução',
          notApplicableReason: status === 'nao_aplicavel' ? 'nao se aplica a este parceiro' : '',
        })]);
    };

    // opA — uma conforme, uma não conforme com plano. Nota 50.
    const a = await rpc<Aud>(ID.uGcA, `select public.start_monthly_audit($1,$2) as r`, [ID.opA, '2026-07']);
    await responder(ID.uGcA, a, 'CRIT-R51-A', 'conforme');
    await responder(ID.uGcA, a, 'CRIT-R51-B', 'nao_conforme');
    await rpc(ID.uGcA, `select public.save_action_plan($1::jsonb) as r`, [JSON.stringify({
      operationId: ID.opA, evaluationId: a.id,
      monthlyCriterionAnswerId: a.criteria.find((c) => c.criterionCode === 'CRIT-R51-B')!.answer.id,
      action: 'Implantar a rotina B', problem: 'rotina ausente',
      owner: 'Responsavel Fic', dueDate: '2026-09-30', priority: 'high',
    })]);
    await rpc(ID.uGcA, `select public.submit_monthly_audit($1) as r`, [a.id]);
    await rpc(ID.uCoord1, `select public.validate_evaluation($1,$2,$3) as r`, [a.id, 'approved', 'aprovado']);
    audA = { id: a.id };

    // opB — TUDO N/A. Denominador zero.
    const b = await rpc<Aud>(ID.uGcB, `select public.start_monthly_audit($1,$2) as r`, [ID.opB, '2026-07']);
    await responder(ID.uGcB, b, 'CRIT-R51-A', 'nao_aplicavel');
    await responder(ID.uGcB, b, 'CRIT-R51-B', 'nao_aplicavel');
    await rpc(ID.uGcB, `select public.submit_monthly_audit($1) as r`, [b.id]);
    await rpc(ID.uCoord2, `select public.validate_evaluation($1,$2,$3) as r`, [b.id, 'approved', 'ok']);
    audNa = { id: b.id };

    // opA, competência seguinte — fica em RASCUNHO de propósito.
    const d = await rpc<Aud>(ID.uGcA, `select public.start_monthly_audit($1,$2) as r`, [ID.opA, '2026-08']);
    draft = { id: d.id };
  }, 180_000);

  afterAll(async () => db.close());

  // =========================================================================
  // A · AS DUAS CONSTANTES
  // =========================================================================
  describe('A · duas constantes de formato, nunca uma', () => {
    it('1 — o relatório mensal é 1.3.5, e diz isso em três lugares', async () => {
      const r = await relatorio(ID.uAdmin, audA.id);
      expect(r.identity.reportFormatVersion).toBe('1.3.5');
      expect(r.integrity.formatVersion).toBe('1.3.5');
      expect(r.summary.ruleVersions.reportFormatVersion).toBe('1.3.5');
    });

    it('2 — 1.3.3 NÃO aparece em lugar nenhum do documento novo', async () => {
      const r = await relatorio(ID.uAdmin, audA.id);
      expect(JSON.stringify(r)).not.toContain('1.3.3');
    });

    it('3 — a constante histórica do código continua sendo 1.3.3', async () => {
      // O relatório legado é outro objeto, e a constante dele não se move.
      const fonte = await import('node:fs').then((fs) =>
        fs.readFileSync('src/domain/report/officialAuditReport.ts', 'utf8'));
      expect(fonte).toMatch(/REPORT_FORMAT_VERSION\s*=\s*'1\.3\.3'/);
    });
  });

  // =========================================================================
  // B · QUEM PODE, E O QUE A RECUSA REVELA
  // =========================================================================
  describe('B · a fronteira', () => {
    it('4 — o inexistente e o alheio respondem EXATAMENTE a mesma coisa', async () => {
      const inexistente = await recusa(() => relatorio(ID.uGcA, INEXISTENTE));
      const alheio = await recusa(() => relatorio(ID2.uGcC, audA.id));
      expect(inexistente).toBe('auditoria inexistente ou fora do escopo');
      expect(alheio).toBe(inexistente);
    });

    it('5 — o modelo LEGADO é recusado, e apontado para o caminho próprio', async () => {
      const m = await recusa(() => relatorio(ID.uCoord1, ID.evalA));
      expect(m).toContain('modelo legado');
      expect(m).toContain('get_official_audit_report_data');
    });

    it('6 — RASCUNHO é recusado: não há relatório oficial de algo não aprovado', async () => {
      const m = await recusa(() => relatorio(ID.uGcA, draft.id));
      expect(m).toBe('a auditoria nao esta aprovada: nao ha relatorio oficial');
    });

    it('7 — `anon` não alcança a função', async () => {
      const e = await db.asAnon((tx) =>
        tx.expectError(`select public.get_monthly_audit_report_data('${audA.id}')`));
      expect(e.message).toMatch(/permission denied for function get_monthly_audit_report_data/);
    });

    it('8 — os quatro papéis do escopo leem; o de fora, não', async () => {
      for (const uid of [ID.uAdmin, ID.uReg, ID.uCoord1, ID.uGcA]) {
        const r = await relatorio(uid, audA.id);
        expect(`${uid}: ${r.identity.evaluationId}`).toBe(`${uid}: ${audA.id}`);
      }
      expect(await recusa(() => relatorio(ID2.uReg2, audA.id)))
        .toBe('auditoria inexistente ou fora do escopo');
    });

    it('9 — o caminho LEGADO continua intacto: a recusa dele é a DELE', async () => {
      // `evalA` é legada e está `submitted`. A recusa que ela devolve tem de
      // continuar sendo a guarda de ESTADO da função legada — e não a fronteira
      // de modelo que esta migration reescreveu. É assim que se prova que
      // `app.official_audit_report_legacy` não foi tocada: ela ainda é quem
      // responde, e responde a mesma coisa de sempre.
      const legada = await recusa(() => rpc(ID.uCoord1,
        `select public.get_official_audit_report_data($1) as r`, [ID.evalA]));
      expect(legada).toBe('avaliacao ainda nao foi validada oficialmente');

      // E a auditoria MENSAL é recusada por aquela porta, apontando esta.
      const mensal = await recusa(() => rpc(ID.uCoord1,
        `select public.get_official_audit_report_data($1) as r`, [audA.id]));
      expect(mensal).toContain('get_monthly_audit_report_data');
      expect(mensal).not.toContain('A-05');
      expect(mensal).not.toContain('get_monthly_audit_snapshot');
    });
  });

  // =========================================================================
  // C · O CONTEÚDO
  // =========================================================================
  describe('C · identidade, resumo e conteúdo', () => {
    it('10 — a identidade traz os onze campos do contrato', async () => {
      const r = await relatorio(ID.uAdmin, audA.id);
      expect(r.identity.evaluationId).toBe(audA.id);
      expect(r.identity.operationId).toBe(ID.opA);
      expect(r.identity.partnerName).toBe('Parceiro A');
      expect(r.identity.competence).toBe('2026-07');
      expect(r.identity.periodStart).toBe('2026-07-01');
      expect(r.identity.periodEnd).toBe('2026-07-31');
      expect(r.identity.status).toBe('approved');
      expect(r.identity.approvedBy).toBe('Coord1 Fic');
      expect(r.identity.approvedAt).toBeTruthy();
      expect(r.identity.snapshotId).toBeTruthy();
    });

    it('11 — o resumo aplica A-10 sobre o snapshot: 1 de 2 aplicáveis = 50', async () => {
      const r = await relatorio(ID.uAdmin, audA.id);
      expect(r.summary.processScore).toBeCloseTo(50, 2);
      expect(r.summary.sufficient).toBe(true);
      expect(r.summary.applicableCriteria).toBe(2);
      expect(r.summary.conformCount).toBe(1);
      expect(r.summary.nonConformCount).toBe(1);
      expect(r.summary.notApplicableCount).toBe(0);
      expect(r.summary.totalCriteria).toBe(2);
    });

    it('12 — TUDO N/A: nota NULA e insuficiência declarada, jamais zero', async () => {
      const r = await relatorio(ID.uAdmin, audNa.id);
      expect(r.summary.processScore).toBeNull();
      expect(r.summary.sufficient).toBe(false);
      expect(r.summary.insufficiencyReasons).toEqual(['no_applicable_criteria']);
      expect(r.summary.notApplicableCount).toBe(2);
      expect(r.summary.applicableCriteria).toBe(0);
    });

    it('13 — o conteúdo traz tema, indicador, critério, pergunta e orientação', async () => {
      const r = await relatorio(ID.uAdmin, audA.id);
      expect(r.content).toHaveLength(2);
      const a = r.content.find((c) => c.criterionCode === 'CRIT-R51-A')!;
      expect(a.themeCode).toBe('TEMA-R51');
      expect(a.themeName).toBe('Tema do relatorio');
      expect(a.indicatorCode).toBe('IND-R51-1');
      expect(a.question).toBe('A rotina A esta implantada e e executada?');
      expect(a.description).toBe('Descricao da rotina A');
      expect(a.guidance).toBe('Orientacao de verificacao A');
      expect(a.answer).toBe('conforme');
    });

    it('14 — diagnóstico e planos MATERIALIZADOS acompanham a não conformidade', async () => {
      const r = await relatorio(ID.uAdmin, audA.id);
      const b = r.content.find((c) => c.criterionCode === 'CRIT-R51-B')!;
      expect(b.answer).toBe('nao_conforme');
      expect(b.diagnosis).toBe('A rotina nao existe no parceiro');
      expect(b.plans).toHaveLength(1);
      expect(b.plans[0].action).toBe('Implantar a rotina B');
      expect(b.plans[0].owner).toBe('Responsavel Fic');
      expect(b.plans[0].dueDate).toBe('2026-09-30');
      expect(b.plans[0].status).toBeTruthy();
      expect(r.summary.plansByStatus).toBeTruthy();
    });

    it('15 — a acentuação sobrevive ao caminho inteiro', async () => {
      const r = await relatorio(ID.uAdmin, audA.id);
      expect(r.content[0].observation).toContain('avaliação e execução');
    });

    it('16 — o documento NÃO carrega token, URL, e-mail nem caminho de objeto', async () => {
      const t = JSON.stringify(await relatorio(ID.uAdmin, audA.id));
      expect(t).not.toMatch(/https?:\/\//);
      expect(t).not.toMatch(/@[a-z]+\.example/);
      expect(t).not.toMatch(/evidencias\//);
      expect(t).not.toMatch(/authorUserId|validatorId|approvedByUserId/);
    });
  });

  // =========================================================================
  // D · IMUTABILIDADE E DETERMINISMO
  // =========================================================================
  describe('D · o relatório nasce do snapshot, e só dele', () => {
    it('17 — duas gerações diferem APENAS em `generatedAt`', async () => {
      const a = await relatorio(ID.uAdmin, audA.id);
      const b = await relatorio(ID.uAdmin, audA.id);
      const semData = (r: Relatorio) => { const c = { ...r }; delete (c as never as Record<string, unknown>).generatedAt; return JSON.stringify(c); };
      expect(semData(a)).toBe(semData(b));
    });

    it('18 — a ORDENAÇÃO é estável e explícita', async () => {
      const r = await relatorio(ID.uAdmin, audA.id);
      expect(r.content.map((c) => c.criterionCode)).toEqual(['CRIT-R51-A', 'CRIT-R51-B']);
      expect(r.integrity.ordering).toBe('tema,indicador,ordem,criterio');
      expect(r.integrity.canonicalization).toBe('linha-por-fato/1.3.5');
    });

    it('19 — mudar o CATÁLOGO depois da aprovação não muda o documento', async () => {
      const antes = await relatorio(ID.uAdmin, audA.id);
      await db.exec(`
        update public.theme_versions set name = 'Tema RENOMEADO' where id = '${R.themeV}';
        update public.indicator_definitions set name = 'Indicador RENOMEADO' where id = '${R.d1}';
        update public.audit_criteria_versions
           set question = 'PERGUNTA TROCADA', guidance = 'ORIENTACAO TROCADA'
         where id = '${R.critAv}';
        update public.indicator_regional_config_versions set weight = 99 where id = '${R.cfgv1}';`);
      const depois = await relatorio(ID.uAdmin, audA.id);
      expect(depois.content).toEqual(antes.content);
      expect(depois.summary).toEqual(antes.summary);
      expect(JSON.stringify(depois)).not.toContain('RENOMEADO');
      expect(JSON.stringify(depois)).not.toContain('TROCADA');
    });

    it('20 — mudar o PLANO depois da aprovação não muda o documento', async () => {
      const antes = await relatorio(ID.uAdmin, audA.id);
      await db.exec(`
        update public.action_plans
           set owner_name = 'OUTRO RESPONSAVEL', due_date = '2030-01-01'
         where operation_id = '${ID.opA}' and source = 'monthly_audit';`);
      const depois = await relatorio(ID.uAdmin, audA.id);
      expect(depois.content).toEqual(antes.content);
      expect(JSON.stringify(depois)).not.toContain('OUTRO RESPONSAVEL');
      expect(JSON.stringify(depois)).not.toContain('2030-01-01');
    });

    it('21 — a nota do documento é DERIVADA do conteúdo congelado, não lida de coluna', async () => {
      // Tentar mexer na nota da avaliação aprovada é recusado por gatilho — e
      // isso é mais forte do que o teste que eu queria escrever: a coluna nem
      // chega a poder divergir. O que resta provar é que a nota do documento
      // sai da CONTAGEM das respostas dentro do snapshot.
      const e = await recusa(() =>
        db.exec(`update public.evaluations set score = 7 where id = '${audA.id}'`));
      expect(e).toBe('avaliacao aprovada e imutavel: use adendo (registro supersedido)');

      const r = await relatorio(ID.uAdmin, audA.id);
      const conteudo = await db.query<{ conf: number; nc: number }>(`
        select count(*) filter (where c->'answer'->>'status' = 'conforme')::int as conf,
               count(*) filter (where c->'answer'->>'status' = 'nao_conforme')::int as nc
          from public.official_snapshots s,
               jsonb_array_elements(s.payload->'criteria') c
         where s.evaluation_id = '${audA.id}'`);
      const esperado = conteudo[0].conf / (conteudo[0].conf + conteudo[0].nc) * 100;
      expect(r.summary.processScore).toBeCloseTo(esperado, 2);
      expect(r.summary.conformCount).toBe(conteudo[0].conf);
      expect(r.summary.nonConformCount).toBe(conteudo[0].nc);
    });

    it('22 — a proveniência da regra de processo viaja no documento', async () => {
      const r = await relatorio(ID.uAdmin, audA.id);
      expect(r.summary.ruleVersions.processScoreRule).toBe('conformidade-simples-processo/1.3.5');
      expect(r.integrity.ruleVersion).toBe('conformidade-simples-processo/1.3.5');
      expect(JSON.stringify(r)).not.toMatch(/pendente|provisor/i);
    });
  });
});
