/**
 * AUDITORIA MENSAL por competência (migrations 0042–0044), em banco REAL
 * (PGlite/PG18).
 *
 * A PERGUNTA QUE ESTE ARQUIVO RESPONDE. A decisão D4 promete uma auditoria
 * oficial por parceiro por competência, com critérios materializados que o
 * catálogo não pode mais mexer, e aprovação que gera snapshot imutável. E a
 * decisão D5 promete que nada disso toca o histórico. As duas promessas se
 * contradizem se estiverem só na aplicação: aqui as duas são exercidas contra o
 * banco, sob RLS, com o JWT de cada perfil — e o caminho legado é medido lado a
 * lado, no mesmo banco.
 *
 * Dados 100% SINTÉTICOS (§23).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

interface PlanRef { id: string; owner: string; dueDate: string; status: string }

interface CriterionAnswer {
  id: string;
  status: 'nao_avaliado' | 'conforme' | 'nao_conforme' | 'nao_aplicavel';
  justification: string;
  observation: string;
  diagnosis: string;
  answeredBy: string | null;
  evidences: Array<{ id: string; name: string }>;
  plans: PlanRef[];
}

interface MaterializedCriterion {
  id: string;
  criterionCode: string;
  indicatorCode: string;
  themeName: string;
  question: string;
  guidance: string;
  sortOrder: number;
  required: boolean;
  evidenceRequired: boolean;
  allowsNa: boolean;
  requiresJustification: boolean;
  answer: CriterionAnswer;
}

interface MonthlyAudit {
  id: string;
  operationId: string;
  partnerName: string;
  evaluationModel: 'legacy_template' | 'monthly_criteria';
  competence: string;
  periodStart: string;
  periodEnd: string;
  cycleLabel: string;
  status: string;
  score: number;
  authorUserId: string;
  criteria: MaterializedCriterion[];
}

/** Catálogo montado só para estes testes. */
const CAT = {
  theme: '00000000-0000-0000-0000-0000000c0001',
  themeV: '00000000-0000-0000-0000-0000000c0002',
  def: '00000000-0000-0000-0000-0000000c0011',
  ver: '00000000-0000-0000-0000-0000000c0012',
  cfg: '00000000-0000-0000-0000-0000000c0013',
  cfgV: '00000000-0000-0000-0000-0000000c0014',
  // Três critérios: um exige evidência, um permite N/A com justificativa, um simples.
  critEvid: '00000000-0000-0000-0000-0000000c0021',
  critEvidV: '00000000-0000-0000-0000-0000000c0022',
  critNa: '00000000-0000-0000-0000-0000000c0031',
  critNaV: '00000000-0000-0000-0000-0000000c0032',
  critPlain: '00000000-0000-0000-0000-0000000c0041',
  critPlainV: '00000000-0000-0000-0000-0000000c0042',
} as const;

/**
 * A ORDEM importa e é imposta pelo banco: `trg_monthly_audit_requires_criteria`
 * (0038) recusa publicar configuração com `include_in_monthly_audit` sem ao
 * menos um critério publicado e ativo. Por isso os critérios nascem antes da
 * versão publicada da configuração.
 */
async function seedCatalogoMensal(db: TestDb): Promise<void> {
  await db.exec(`
    insert into public.themes (id, code, scope_kind, lifecycle, created_by)
      values ('${CAT.theme}','TEMA-AM','global','active','${ID.uAdmin}');
    insert into public.theme_versions (id, theme_id, version_number, name, sort_order, status, active)
      values ('${CAT.themeV}','${CAT.theme}',1,'Processo comercial',1,'published',true);

    insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind)
      values ('${CAT.def}','IND-AM-1','Conversao auditada','active','global');
    insert into public.indicator_versions
      (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, name, status)
      values ('${CAT.ver}','${CAT.def}',1,'%','higher_better',0,0,1,'Conversao auditada','published');

    insert into public.indicator_regional_configs (id, region_id, indicator_definition_id, created_by)
      values ('${CAT.cfg}','${ID.region}','${CAT.def}','${ID.uAdmin}');

    insert into public.audit_criteria (id, config_id, code, lifecycle, created_by) values
      ('${CAT.critEvid}','${CAT.cfg}','CRIT-01','active','${ID.uAdmin}'),
      ('${CAT.critNa}','${CAT.cfg}','CRIT-02','active','${ID.uAdmin}'),
      ('${CAT.critPlain}','${CAT.cfg}','CRIT-03','active','${ID.uAdmin}');

    insert into public.audit_criteria_versions
      (id, criterion_id, version_number, question, description, guidance, sort_order,
       required, evidence_required, allows_na, requires_justification, status, active)
      values
        ('${CAT.critEvidV}','${CAT.critEvid}',1,'Existe rotina documentada de acompanhamento?',
         'Rotina formal','Peca o documento',1,true,true,false,false,'published',true),
        ('${CAT.critNaV}','${CAT.critNa}',1,'A equipe faz reuniao semanal de resultado?',
         'Ritual de gestao','Confirme com o gerente',2,true,false,true,true,'published',true),
        ('${CAT.critPlainV}','${CAT.critPlain}',1,'O painel esta afixado na operacao?',
         '','Verifique in loco',3,true,false,false,false,'published',true);

    insert into public.indicator_regional_config_versions
      (id, config_id, version_number, indicator_version_id, theme_version_id,
       sort_order, target, tolerance, weight, active,
       include_in_assisted_management, include_in_monthly_audit, status)
      values ('${CAT.cfgV}','${CAT.cfg}',1,'${CAT.ver}','${CAT.themeV}',1,80,5,1,true,false,true,'published');
  `);
}

const iniciar = (db: TestDb, user: string, op: string, comp: string) =>
  db.asUser(user, (tx) =>
    tx.query<{ a: MonthlyAudit }>(`select public.start_monthly_audit($1,$2) as a`, [op, comp]),
  ).then((r) => r[0].a);

const responder = (db: TestDb, user: string, answerId: string, patch: Record<string, unknown>) =>
  db.asUser(user, (tx) =>
    tx.query<{ c: MaterializedCriterion }>(`select public.save_criterion_answer($1,$2::jsonb) as c`, [
      answerId, JSON.stringify(patch),
    ]),
  ).then((r) => r[0].c);

const enviar = (db: TestDb, user: string, evalId: string) =>
  db.asUser(user, (tx) =>
    tx.query<{ a: MonthlyAudit }>(`select public.submit_monthly_audit($1) as a`, [evalId]),
  ).then((r) => r[0].a);

const validar = (db: TestDb, user: string, evalId: string, decision: string, note = 'ok') =>
  db.asUser(user, (tx) =>
    tx.query<{ a: MonthlyAudit }>(`select public.validate_evaluation($1,$2,$3) as a`, [
      evalId, decision, note,
    ]),
  ).then((r) => r[0].a);

const crit = (a: MonthlyAudit, code: string): MaterializedCriterion => {
  const c = a.criteria.find((x) => x.criterionCode === code);
  if (!c) throw new Error(`criterio ${code} ausente na auditoria`);
  return c;
};

/** Plano da não conformidade, pelo MOTOR ÚNICO. Não há outro caminho. */
const criarPlano = (
  db: TestDb, user: string, op: string, evalId: string, answerId: string,
  over: Record<string, unknown> = {},
) =>
  db.asUser(user, (tx) =>
    tx.query<{ p: { id: string } }>(`select public.save_action_plan($1::jsonb) as p`, [
      JSON.stringify({
        operationId: op,
        evaluationId: evalId,
        monthlyCriterionAnswerId: answerId,
        action: 'Implantar rotina de acompanhamento',
        problem: 'Rotina inexistente',
        owner: 'Gerente da loja',
        dueDate: '2099-12-31',
        priority: 'high',
        ...over,
      }),
    ]),
  ).then((r) => r[0].p);

/** Evidência pelo FLUXO OFICIAL: reserva -> objeto no bucket -> confirmação. */
async function anexarEvidenciaMensal(
  db: TestDb, user: string, evalId: string, criterionCode: string,
): Promise<{ evidenceId: string }> {
  const entrada = { name: 'rotina.pdf', mimeType: 'application/pdf', type: 'document', sizeBytes: 2048 };
  const reserva = (await db.asUser(user, (tx) =>
    tx.query<{ r: { reservationId: string; bucket: string; path: string } }>(
      `select public.reserve_evidence_upload($1,$2,$3::jsonb) as r`,
      [evalId, criterionCode, JSON.stringify(entrada)],
    )))[0].r;
  await db.asUser(user, (tx) =>
    tx.query(`insert into storage.objects (bucket_id, name, owner) values ($1,$2,auth.uid())`,
      [reserva.bucket, reserva.path]));
  const ev = (await db.asUser(user, (tx) =>
    tx.query<{ e: { id: string } }>(`select public.confirm_evidence_upload($1) as e`,
      [reserva.reservationId])))[0].e;
  return { evidenceId: ev.id };
}

/** Preenche os três critérios de forma válida e envia. */
async function preencherEEnviar(db: TestDb, a: MonthlyAudit, op = ID.opA) {
  await anexarEvidenciaMensal(db, ID.uGcA, a.id, 'CRIT-01');
  await responder(db, ID.uGcA, crit(a, 'CRIT-01').answer.id, { status: 'conforme' });
  await responder(db, ID.uGcA, crit(a, 'CRIT-02').answer.id, {
    status: 'nao_aplicavel', justification: 'Operacao sem equipe propria neste mes',
  });
  await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, {
    status: 'nao_conforme', diagnosis: 'Painel retirado durante a reforma',
  });
  await criarPlano(db, ID.uGcA, op, a.id, crit(a, 'CRIT-03').answer.id);
  return enviar(db, ID.uGcA, a.id);
}

describe('Auditoria Mensal por competência (0042–0044)', () => {
  let db: TestDb;
  /** Contagem do catálogo LEGADO antes de existir qualquer auditoria mensal. */
  let legadoBase: { itens: number; tpls: number };

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedCatalogoMensal(db);
    legadoBase = (await db.query<{ itens: number; tpls: number }>(
      `select (select count(*)::int from public.audit_items) itens,
              (select count(*)::int from public.audit_template_versions) tpls`,
    ))[0];
  });
  afterAll(async () => db.close());

  // -------------------------------------------------------------------------
  describe('o modelo legado permanece intacto', () => {
    it('toda avaliação existente é legacy_template, sem UPDATE semântico', async () => {
      const r = await db.query<{ n: number; legacy: number }>(
        `select count(*)::int n,
                count(*) filter (where evaluation_model = 'legacy_template')::int legacy
           from public.evaluations`,
      );
      expect(r[0].n).toBeGreaterThan(0);
      expect(r[0].legacy).toBe(r[0].n);
    });

    it('avaliação legada continua EXIGINDO template — o CHECK é mais forte que o not null', async () => {
      const e = await db
        .query(
          `insert into public.evaluations (operation_id, template_version_id, author_user_id)
             values ($1, null, $2)`,
          [ID.opA, ID.uGcA],
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/model_template_ck|check/i);
    });

    it('auditoria por critérios NÃO pode carregar template legado', async () => {
      const e = await db
        .query(
          `insert into public.evaluations
             (operation_id, template_version_id, author_user_id, evaluation_model,
              period_start, period_end)
             values ($1,$2,$3,'monthly_criteria','2026-05-01','2026-05-31')`,
          [ID.opA, ID.templateV1, ID.uGcA],
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/model_template_ck|check/i);
    });

    it('nenhum audit_item nem template artificial foi criado', async () => {
      // Dezenas de auditorias mensais foram criadas por este arquivo. Se alguma
      // delas tivesse convertido critérios em checklist, o catálogo legado teria
      // crescido — e é exatamente isso que D4 proíbe.
      await iniciar(db, ID.uGcA, ID.opA, '2026-03');
      const r = await db.query<{ itens: number; tpls: number }>(
        `select (select count(*)::int from public.audit_items) itens,
                (select count(*)::int from public.audit_template_versions) tpls`,
      );
      expect(r[0].itens).toBe(legadoBase.itens);
      expect(r[0].tpls).toBe(legadoBase.tpls);

      // E nenhum item legado carrega código de critério.
      const contaminado = await db.query<{ n: number }>(
        `select count(*)::int n from public.audit_items where code like 'CRIT-%'`);
      expect(contaminado[0].n).toBe(0);
    });

    it('submit_evaluation recusa o modelo novo, e vice-versa', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-03');
      const e1 = await db
        .asUser(ID.uGcA, (tx) => tx.query(`select public.submit_evaluation($1)`, [a.id]))
        .then(() => null).catch((x: Error) => x);
      expect(e1?.message).toMatch(/use submit_monthly_audit/i);

      const e2 = await db
        .asUser(ID.uGcA, (tx) => tx.query(`select public.submit_monthly_audit($1)`, [ID.evalA]))
        .then(() => null).catch((x: Error) => x);
      expect(e2?.message).toMatch(/modelo antigo|use submit_evaluation/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('competência', () => {
    it('a competência vem POR PARÂMETRO — passada é registrável pelo caminho oficial', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2025-11');
      expect(a.competence).toBe('2025-11');
      expect(a.periodStart).toBe('2025-11-01');
      expect(a.periodEnd).toBe('2025-11-30');
      expect(a.evaluationModel).toBe('monthly_criteria');
      expect(a.status).toBe('draft');
    });

    it('fevereiro bissexto fecha no dia 29', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2024-02');
      expect(a.periodEnd).toBe('2024-02-29');
    });

    it('competência inválida é recusada com mensagem, não com erro de cast', async () => {
      for (const c of ['2026-13', '2026-00', '202611', 'novembro', '']) {
        const e = await iniciar(db, ID.uGcA, ID.opA, c).then(() => null, (x: Error) => x);
        expect(e?.message, `competencia ${c}`).toMatch(/competencia invalida/i);
      }
    });

    it('a mesma competência devolve a MESMA auditoria, não uma segunda', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2025-10');
      const b = await iniciar(db, ID.uGcA, ID.opA, '2025-10');
      expect(b.id).toBe(a.id);
      const n = await db.query<{ n: number }>(
        `select count(*)::int n from public.evaluations
          where operation_id=$1 and period_start='2025-10-01' and evaluation_model='monthly_criteria'`,
        [ID.opA],
      );
      expect(n[0].n).toBe(1);
    });

    it('a unicidade é do BANCO: um segundo insert direto é recusado', async () => {
      await iniciar(db, ID.uGcA, ID.opA, '2025-09');
      const e = await db
        .query(
          `insert into public.evaluations
             (operation_id, template_version_id, author_user_id, evaluation_model,
              frequency, period_start, period_end)
             values ($1,null,$2,'monthly_criteria','monthly','2025-09-01','2025-09-30')`,
          [ID.opA, ID.uGcA],
        )
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/competence_uk|duplicate/i);
    });

    it('o CHECK impõe que period_start seja o 1º dia e period_end o último', async () => {
      const e = await db
        .query(
          `insert into public.evaluations
             (operation_id, template_version_id, author_user_id, evaluation_model,
              period_start, period_end)
             values ($1,null,$2,'monthly_criteria','2026-06-15','2026-07-14')`,
          [ID.opA, ID.uGcA],
        )
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/competence_ck|check/i);
    });

    it('o legado NÃO herda a restrição: várias mensais no mesmo período seguem possíveis', async () => {
      await db.exec(`
        insert into public.evaluations
          (operation_id, template_version_id, author_user_id, frequency, period_start, period_end)
          values ('${ID.opA}','${ID.templateV1}','${ID.uGcA}','monthly','2025-08-01','2025-08-31'),
                 ('${ID.opA}','${ID.templateV1}','${ID.uGcA}','monthly','2025-08-01','2025-08-31');
      `);
      const n = await db.query<{ n: number }>(
        `select count(*)::int n from public.evaluations
          where operation_id=$1 and period_start='2025-08-01' and evaluation_model='legacy_template'`,
        [ID.opA],
      );
      expect(n[0].n).toBe(2);
    });

    it('a competência NÃO é derivada de now(): duas competências distintas coexistem', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2025-06');
      const b = await iniciar(db, ID.uGcA, ID.opA, '2025-07');
      expect(a.id).not.toBe(b.id);
      expect([a.competence, b.competence]).toEqual(['2025-06', '2025-07']);
    });
  });

  // -------------------------------------------------------------------------
  describe('critérios materializados', () => {
    it('os três critérios entram, com os dez campos de D4 copiados', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-01');
      expect(a.criteria.map((c) => c.criterionCode)).toEqual(['CRIT-01', 'CRIT-02', 'CRIT-03']);
      const c1 = crit(a, 'CRIT-01');
      expect(c1.question).toBe('Existe rotina documentada de acompanhamento?');
      expect(c1.guidance).toBe('Peca o documento');
      expect(c1.required).toBe(true);
      expect(c1.evidenceRequired).toBe(true);
      expect(c1.allowsNa).toBe(false);
      expect(crit(a, 'CRIT-02').allowsNa).toBe(true);
      expect(crit(a, 'CRIT-02').requiresJustification).toBe(true);
      expect(c1.indicatorCode).toBe('IND-AM-1');
      expect(c1.themeName).toBe('Processo comercial');
    });

    it('cada critério nasce com resposta em branco — nao_avaliado, não "conforme por omissão"', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-01');
      expect(a.criteria.every((c) => c.answer.status === 'nao_avaliado')).toBe(true);
      expect(a.criteria.every((c) => c.answer.plans.length === 0)).toBe(true);
    });

    it('alterar o catálogo DEPOIS não muda auditoria já criada', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-02');
      const antes = crit(a, 'CRIT-03').question;

      await db.exec(`
        update public.audit_criteria_versions set effective_to = now()
          where id = '${CAT.critPlainV}';
        insert into public.audit_criteria_versions
          (criterion_id, version_number, question, sort_order, required,
           evidence_required, allows_na, requires_justification, status, active)
          values ('${CAT.critPlain}',2,'PERGUNTA REESCRITA DEPOIS',3,true,false,false,false,'published',true);
      `);

      const depois = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ a: MonthlyAudit }>(`select public.get_monthly_audit($1,$2) as a`, [ID.opA, '2026-02']));
      expect(crit(depois[0].a, 'CRIT-03').question).toBe(antes);
      expect(crit(depois[0].a, 'CRIT-03').question).not.toMatch(/REESCRITA/);
    });

    it('critério de configuração SEM include_in_monthly_audit não entra', async () => {
      const def = '00000000-0000-0000-0000-0000000d0001';
      const ver = '00000000-0000-0000-0000-0000000d0002';
      const cfg = '00000000-0000-0000-0000-0000000d0003';
      const cr = '00000000-0000-0000-0000-0000000d0004';
      await db.exec(`
        insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind)
          values ('${def}','IND-AM-OFF','So assistida','active','global');
        insert into public.indicator_versions (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, status)
          values ('${ver}','${def}',1,'%','higher_better',0,0,1,'published');
        insert into public.indicator_regional_configs (id, region_id, indicator_definition_id)
          values ('${cfg}','${ID.region}','${def}');
        insert into public.audit_criteria (id, config_id, code, lifecycle) values ('${cr}','${cfg}','CRIT-OFF','active');
        insert into public.audit_criteria_versions (criterion_id, version_number, question, status, active)
          values ('${cr}',1,'Nao deveria aparecer','published',true);
        insert into public.indicator_regional_config_versions
          (config_id, version_number, indicator_version_id, theme_version_id, target, tolerance,
           status, include_in_assisted_management, include_in_monthly_audit)
          values ('${cfg}',1,'${ver}','${CAT.themeV}',50,0,'published',true,false);
      `);
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-04');
      expect(a.criteria.map((c) => c.criterionCode)).not.toContain('CRIT-OFF');
    });

    it('critério em RASCUNHO ou INATIVO não entra', async () => {
      await db.exec(`
        insert into public.audit_criteria (id, config_id, code, lifecycle)
          values ('00000000-0000-0000-0000-0000000d0011','${CAT.cfg}','CRIT-DRAFT','active'),
                 ('00000000-0000-0000-0000-0000000d0021','${CAT.cfg}','CRIT-DEAD','inactive');
        insert into public.audit_criteria_versions (criterion_id, version_number, question, status, active)
          values ('00000000-0000-0000-0000-0000000d0011',1,'Rascunho','draft',true),
                 ('00000000-0000-0000-0000-0000000d0021',1,'Inativado','published',true);
      `);
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-05');
      const codes = a.criteria.map((c) => c.criterionCode);
      expect(codes).not.toContain('CRIT-DRAFT');
      expect(codes).not.toContain('CRIT-DEAD');
    });

    it('configuração de OUTRA REGIÃO não entra', async () => {
      const q2 = await seedSecondRegion(db);
      const def = '00000000-0000-0000-0000-0000000d0031';
      const ver = '00000000-0000-0000-0000-0000000d0032';
      const cfg = '00000000-0000-0000-0000-0000000d0033';
      const cr = '00000000-0000-0000-0000-0000000d0034';
      await db.exec(`
        insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind)
          values ('${def}','IND-AM-R2','Da regiao 2','active','global');
        insert into public.indicator_versions (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, status)
          values ('${ver}','${def}',1,'%','higher_better',0,0,1,'published');
        insert into public.indicator_regional_configs (id, region_id, indicator_definition_id)
          values ('${cfg}','${q2.region2}','${def}');
        insert into public.audit_criteria (id, config_id, code, lifecycle) values ('${cr}','${cfg}','CRIT-R2','active');
        insert into public.audit_criteria_versions (criterion_id, version_number, question, status, active)
          values ('${cr}',1,'Da regiao 2','published',true);
        insert into public.indicator_regional_config_versions
          (config_id, version_number, indicator_version_id, theme_version_id, target, tolerance,
           status, include_in_assisted_management, include_in_monthly_audit)
          values ('${cfg}',1,'${ver}','${CAT.themeV}',50,0,'published',false,true);
      `);
      const a1 = await iniciar(db, ID.uGcA, ID.opA, '2026-06');
      expect(a1.criteria.map((c) => c.criterionCode)).not.toContain('CRIT-R2');

      const a2 = await iniciar(db, q2.uGcC, q2.opC, '2026-06');
      expect(a2.criteria.map((c) => c.criterionCode)).toEqual(['CRIT-R2']);
    });

    it('critério materializado é imutável, mesmo por escrita direta', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-01');
      await preencherEEnviar(db, a);
      const e = await db
        .asUser(ID.uGcA, (tx) =>
          tx.query(`update public.evaluation_criteria set question='forjada' where evaluation_id=$1`, [a.id]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/nao aceita alteracao|permission|policy/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('respostas', () => {
    it('conforme, não conforme e N/A são gravados pelo servidor', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-07');
      const c1 = await responder(db, ID.uGcA, crit(a, 'CRIT-01').answer.id, { status: 'conforme' });
      expect(c1.answer.status).toBe('conforme');
      expect(c1.answer.answeredBy).toBe(ID.uGcA);

      const c3 = await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, {
        status: 'nao_conforme', diagnosis: 'Painel ausente',
      });
      expect(c3.answer.status).toBe('nao_conforme');
      expect(c3.answer.diagnosis).toBe('Painel ausente');
    });

    it('situação desconhecida é recusada em vez de degradar em silêncio', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-07');
      const e = await responder(db, ID.uGcA, crit(a, 'CRIT-01').answer.id, { status: 'amarelo' })
        .then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/situacao invalida/i);
    });

    it('a resposta não pode ser repontada para a auditoria de outro', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-07');
      const b = await iniciar(db, ID.uGcA, ID.opA, '2026-08');
      const e = await db
        .query(`update public.evaluation_criterion_answers set evaluation_id=$2 where id=$1`,
          [crit(a, 'CRIT-01').answer.id, b.id])
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/nao pertence a auditoria do criterio/i);
    });

    it('só o AUTOR responde — coordenador, regional e admin consultam', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-09');
      for (const u of [ID.uCoord1, ID.uReg, ID.uAdmin]) {
        const e = await responder(db, u, crit(a, 'CRIT-01').answer.id, { status: 'conforme' })
          .then(() => null, (x: Error) => x);
        expect(e?.message, `usuario ${u}`).toMatch(/apenas o autor/i);
      }
      const lido = await db.asUser(ID.uCoord1, (tx) =>
        tx.query<{ a: MonthlyAudit }>(`select public.get_monthly_audit($1,$2) as a`, [ID.opA, '2026-09']));
      expect(lido[0].a.id).toBe(a.id);
    });

    it('GC de outro parceiro não alcança a resposta', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-09');
      const e = await responder(db, ID.uGcB, crit(a, 'CRIT-01').answer.id, { status: 'conforme' })
        .then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/inexistente ou fora do escopo/i);
    });

    it('auditoria enviada não aceita mais resposta', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-10');
      await preencherEEnviar(db, a);
      const e = await responder(db, ID.uGcA, crit(a, 'CRIT-01').answer.id, { status: 'nao_conforme' })
        .then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/rascunho\/devolvida/i);

      const direto = await db
        .asUser(ID.uGcA, (tx) =>
          tx.query(`update public.evaluation_criterion_answers set status='conforme' where id=$1`,
            [crit(a, 'CRIT-01').answer.id]))
        .then(() => null).catch((x: Error) => x);
      expect(direto?.message).toMatch(/nao aceita alteracao|permission|policy/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('não aplicável', () => {
    it('N/A é aceito onde o critério permite, com justificativa', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-11');
      const c = await responder(db, ID.uGcA, crit(a, 'CRIT-02').answer.id, {
        status: 'nao_aplicavel', justification: 'Operacao sem equipe propria neste mes',
      });
      expect(c.answer.status).toBe('nao_aplicavel');
    });

    it('N/A é RECUSADO onde o critério não o permite', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-11');
      const e = await responder(db, ID.uGcA, crit(a, 'CRIT-01').answer.id, { status: 'nao_aplicavel' })
        .then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/nao admite Nao aplicavel/i);
    });

    it('justificativa exigida e ausente é recusada — e "n/a" não é justificativa', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-11');
      for (const j of ['', '   ', 'n/a', '---']) {
        const e = await responder(db, ID.uGcA, crit(a, 'CRIT-02').answer.id, {
          status: 'nao_aplicavel', justification: j,
        }).then(() => null, (x: Error) => x);
        expect(e?.message, `justificativa "${j}"`).toMatch(/exige justificativa/i);
      }
    });

    it('N/A NÃO conta como conformidade nem como não conformidade na nota', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2026-12');
      await anexarEvidenciaMensal(db, ID.uGcA, a.id, 'CRIT-01');
      await responder(db, ID.uGcA, crit(a, 'CRIT-01').answer.id, { status: 'conforme' });
      await responder(db, ID.uGcA, crit(a, 'CRIT-02').answer.id, {
        status: 'nao_aplicavel', justification: 'Nao ha equipe propria nesta operacao',
      });
      await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, {
        status: 'nao_conforme', diagnosis: 'Painel ausente',
      });
      const r = await db.query<{ s: string }>(
        `select score::text s from public.evaluations where id=$1`, [a.id]);
      // 1 conforme / 2 avaliados = 50. Se o N/A entrasse no denominador, seria 33,33.
      expect(Number(r[0].s)).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  describe('evidências', () => {
    it('a evidência mensal usa o vínculo próprio, não o legado', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-01');
      const { evidenceId } = await anexarEvidenciaMensal(db, ID.uGcA, a.id, 'CRIT-01');
      const r = await db.query<{ novo: number; legado: number }>(
        `select (select count(*)::int from public.evaluation_criterion_answer_evidence where evidence_id=$1) novo,
                (select count(*)::int from public.evaluation_answer_evidence where evidence_id=$1) legado`,
        [evidenceId]);
      expect(r[0].novo).toBe(1);
      expect(r[0].legado).toBe(0);
    });

    it('a evidência aparece na resposta do critério', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-01');
      const lido = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ a: MonthlyAudit }>(`select public.get_monthly_audit($1,$2) as a`, [ID.opA, '2027-01']));
      expect(crit(lido[0].a, 'CRIT-01').answer.evidences).toHaveLength(1);
      expect(crit(lido[0].a, 'CRIT-01').answer.evidences[0].name).toBe('rotina.pdf');
    });

    it('critério inexistente na auditoria não recebe reserva', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-02');
      const e = await db
        .asUser(ID.uGcA, (tx) =>
          tx.query(`select public.reserve_evidence_upload($1,$2,$3::jsonb)`, [
            a.id, 'CRIT-INEXISTENTE',
            JSON.stringify({ name: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10 }),
          ]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/nao pertence a auditoria/i);
    });

    it('evidência de OUTRA auditoria não pode ser vinculada a esta resposta', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-03');
      const b = await iniciar(db, ID.uGcA, ID.opA, '2027-04');
      const { evidenceId } = await anexarEvidenciaMensal(db, ID.uGcA, b.id, 'CRIT-01');
      const e = await db
        .query(`insert into public.evaluation_criterion_answer_evidence (answer_id, evidence_id) values ($1,$2)`,
          [crit(a, 'CRIT-01').answer.id, evidenceId])
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/outra auditoria/i);
    });

    it('a reserva aponta para UM destino só', async () => {
      const e = await db
        .query(
          `insert into public.evidence_upload_reservations
             (evaluation_id, answer_id, criterion_answer_id, bucket, path, mime_type, size_bytes,
              original_name, author_user_id)
             values ($1,null,null,'evidencias','x/y','image/png',10,'y',$2)`,
          [ID.evalA, ID.uGcA])
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/reservation_target_ck|check/i);
    });

    it('o achado O-05 NÃO foi corrigido: sha256 continua nulo', async () => {
      const r = await db.query<{ n: number; nulos: number }>(
        `select count(*)::int n, count(*) filter (where sha256 is null)::int nulos
           from public.evidence_files`);
      expect(r[0].n).toBeGreaterThan(0);
      expect(r[0].nulos).toBe(r[0].n);
    });
  });

  // -------------------------------------------------------------------------
  describe('planos da não conformidade', () => {
    it('o plano nasce em action_plans, com source = monthly_audit e FK à RESPOSTA', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-05');
      await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, {
        status: 'nao_conforme', diagnosis: 'Painel ausente',
      });
      const p = await criarPlano(db, ID.uGcA, ID.opA, a.id, crit(a, 'CRIT-03').answer.id);
      const r = await db.query<{ src: string; ans: string; ev: string; item: string | null }>(
        `select source::text src, monthly_criterion_answer_id::text ans,
                evaluation_id::text ev, item_id::text item
           from public.action_plans where id=$1`, [p.id]);
      expect(r[0].src).toBe('monthly_audit');
      expect(r[0].ans).toBe(crit(a, 'CRIT-03').answer.id);
      expect(r[0].ev).toBe(a.id);
      // `item_id` NULO impede que o plano mensal satisfaça o portão da auditoria legada.
      expect(r[0].item).toBeNull();
    });

    it('MAIS DE UM plano por não conformidade é permitido (D-R)', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-05');
      await criarPlano(db, ID.uGcA, ID.opA, a.id, crit(a, 'CRIT-03').answer.id, {
        action: 'Segunda acao', owner: 'Outro responsavel',
      });
      const r = await db.query<{ n: number }>(
        `select count(*)::int n from public.action_plans where monthly_criterion_answer_id=$1`,
        [crit(a, 'CRIT-03').answer.id]);
      expect(r[0].n).toBe(2);
    });

    it('plano em resposta CONFORME é recusado — plano trata não conformidade', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-06');
      await responder(db, ID.uGcA, crit(a, 'CRIT-01').answer.id, { status: 'conforme' });
      const e = await criarPlano(db, ID.uGcA, ID.opA, a.id, crit(a, 'CRIT-01').answer.id)
        .then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/nao conformidade/i);
    });

    it('resposta de OUTRA auditoria é recusada', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-07');
      const b = await iniciar(db, ID.uGcA, ID.opA, '2027-08');
      await responder(db, ID.uGcA, crit(b, 'CRIT-03').answer.id, {
        status: 'nao_conforme', diagnosis: 'x',
      });
      const e = await criarPlano(db, ID.uGcA, ID.opA, a.id, crit(b, 'CRIT-03').answer.id)
        .then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/outra auditoria/i);
    });

    it('plano de outro PARCEIRO é recusado', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-09');
      await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, {
        status: 'nao_conforme', diagnosis: 'x',
      });
      const e = await db
        .query(
          `insert into public.action_plans
             (operation_id, evaluation_id, monthly_criterion_answer_id, source, description, due_date, priority)
             values ($1,$2,$3,'monthly_audit','x','2099-01-01','high')`,
          [ID.opB, a.id, crit(a, 'CRIT-03').answer.id])
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/outro parceiro|outra auditoria/i);
    });

    it('origem incoerente com as FKs é recusada pelo CHECK', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-09');
      const e1 = await db
        .query(
          `insert into public.action_plans (operation_id, source, description, due_date, priority)
             values ($1,'monthly_audit','sem resposta','2099-01-01','high')`, [ID.opA])
        .then(() => null).catch((x: Error) => x);
      expect(e1?.message).toMatch(/action_plans_source_ck|check/i);

      const e2 = await db
        .query(
          `insert into public.action_plans
             (operation_id, evaluation_id, monthly_criterion_answer_id, item_id, source,
              description, due_date, priority)
             values ($1,$2,$3,$4,'monthly_audit','com item legado','2099-01-01','high')`,
          [ID.opA, a.id, crit(a, 'CRIT-03').answer.id, ID.itemRed])
        .then(() => null).catch((x: Error) => x);
      expect(e2?.message).toMatch(/action_plans_source_ck|check/i);
    });

    it('as origens legacy e assisted continuam válidas', async () => {
      const p = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ p: { id: string } }>(`select public.save_action_plan($1::jsonb) as p`, [
          JSON.stringify({
            operationId: ID.opA, themeId: 'I01', action: 'Legado',
            owner: 'Alguem', dueDate: '2099-01-01', priority: 'medium',
          }),
        ]));
      const r = await db.query<{ src: string }>(
        `select source::text src from public.action_plans where id=$1`, [p[0].p.id]);
      expect(r[0].src).toBe('legacy');
    });

    it('o vínculo é imutável: repontar é recusado', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-10');
      await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, {
        status: 'nao_conforme', diagnosis: 'x',
      });
      const p = await criarPlano(db, ID.uGcA, ID.opA, a.id, crit(a, 'CRIT-03').answer.id);
      const e = await db
        .query(`update public.action_plans set monthly_criterion_answer_id=null where id=$1`, [p.id])
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/repontada/i);
    });

    // -----------------------------------------------------------------------
    // O-11 — o teste dirigido que a Matriz §5 exige
    // -----------------------------------------------------------------------
    it('O-11: plano CONCLUÍDO, criador tenta validar → recusa por REGRA DE ATOR', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2027-11');
      await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, {
        status: 'nao_conforme', diagnosis: 'x',
      });
      const p = await criarPlano(db, ID.uGcA, ID.opA, a.id, crit(a, 'CRIT-03').answer.id);

      // O plano precisa estar EM CONCLUSÃO: a recusa medida antes vinha da
      // máquina de estados ("transicao invalida de in_progress para validated"),
      // e por isso a regra de ator nunca foi exercida.
      await db.asUser(ID.uGcA, (tx) =>
        tx.query(`select public.update_action_status($1,'in_progress')`, [p.id]));
      await db.asUser(ID.uGcA, (tx) =>
        tx.query(`select public.update_action_status($1,'completed')`, [p.id]));
      const estado = await db.query<{ s: string }>(
        `select status::text s from public.action_plans where id=$1`, [p.id]);
      expect(estado[0].s).toBe('done');
      expect(await db.query<{ ok: boolean }>(
        `select app.action_transition_allowed('done','validated') ok`)).toEqual([{ ok: true }]);

      // Agora sim: a transição É permitida pela máquina, e quem recusa é o ator.
      const e = await db
        .asUser(ID.uGcA, (tx) => tx.query(`select public.update_action_status($1,'validated')`, [p.id]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toBe('apenas coordenacao, regional ou administracao registram validado');
      expect(e?.message).not.toMatch(/transicao invalida/);

      // E um coordenador que NÃO criou o plano valida — a regra é de ator, não
      // de estado.
      await db.asUser(ID.uCoord1, (tx) =>
        tx.query(`select public.update_action_status($1,'validated')`, [p.id]));
      const final = await db.query<{ s: string; by: string }>(
        `select status::text s, validated_by::text by from public.action_plans where id=$1`, [p.id]);
      expect(final[0].s).toBe('validated');
      expect(final[0].by).toBe(ID.uCoord1);
    });

    it('O-11 (b): coordenador que CRIOU o plano também é recusado, pelo mesmo motivo', async () => {
      // Prova que a recusa é do CRIADOR, e não do papel `channel_manager`.
      const r = await db.query<{ id: string }>(
        `insert into public.action_plans
           (operation_id, description, due_date, priority, status, created_by, source)
           values ($1,'Plano do coordenador','2099-01-01','high','done',$2,'legacy')
         returning id::text`, [ID.opA, ID.uCoord1]);
      const e = await db
        .asUser(ID.uCoord1, (tx) => tx.query(`select public.update_action_status($1,'validated')`, [r[0].id]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toBe('quem criou o plano nao pode valida-lo');
    });
  });

  // -------------------------------------------------------------------------
  describe('submissão', () => {
    it('critério obrigatório sem avaliação bloqueia, nomeando o critério', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2028-01');
      const e = await enviar(db, ID.uGcA, a.id).then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/criterio obrigatorio CRIT-01 sem avaliacao/i);
    });

    it('evidência obrigatória ausente bloqueia', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2028-02');
      await responder(db, ID.uGcA, crit(a, 'CRIT-01').answer.id, { status: 'conforme' });
      await responder(db, ID.uGcA, crit(a, 'CRIT-02').answer.id, {
        status: 'nao_aplicavel', justification: 'Sem equipe propria nesta operacao',
      });
      await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, { status: 'conforme' });
      const e = await enviar(db, ID.uGcA, a.id).then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/CRIT-01 exige evidencia/i);
    });

    it('não conformidade sem diagnóstico bloqueia', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2028-03');
      await anexarEvidenciaMensal(db, ID.uGcA, a.id, 'CRIT-01');
      await responder(db, ID.uGcA, crit(a, 'CRIT-01').answer.id, { status: 'conforme' });
      await responder(db, ID.uGcA, crit(a, 'CRIT-02').answer.id, {
        status: 'nao_aplicavel', justification: 'Sem equipe propria nesta operacao',
      });
      await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, { status: 'nao_conforme' });
      const e = await enviar(db, ID.uGcA, a.id).then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/CRIT-03 em nao conformidade sem diagnostico/i);
    });

    it('não conformidade sem plano bloqueia', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2028-03');
      await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, {
        status: 'nao_conforme', diagnosis: 'Painel ausente',
      });
      const e = await enviar(db, ID.uGcA, a.id).then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/CRIT-03 em nao conformidade sem plano/i);
    });

    it('plano sem responsável bloqueia', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2028-03');
      await criarPlano(db, ID.uGcA, ID.opA, a.id, crit(a, 'CRIT-03').answer.id, { owner: '' });
      const e = await enviar(db, ID.uGcA, a.id).then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/plano de CRIT-03 precisa de responsavel e prazo/i);
    });

    it('com tudo em ordem, envia e o SCORE é calculado pelo servidor', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2028-04');
      const enviada = await preencherEEnviar(db, a);
      expect(enviada.status).toBe('submitted');
      // 1 conforme / 2 avaliados; o N/A fica fora dos dois lados.
      expect(enviada.score).toBe(50);
    });

    it('auditoria sem critério nenhum não é enviável', async () => {
      const q2 = await seedSecondRegion(db).catch(() => ID2);
      // opB é da região 1 mas de outra coordenadoria; usa o mesmo catálogo.
      // Para provar o caso vazio, uma operação cuja região não publicou nada.
      const r = await db.query<{ id: string }>(
        `insert into public.evaluations
           (operation_id, template_version_id, author_user_id, evaluation_model,
            frequency, period_start, period_end)
           values ($1,null,$2,'monthly_criteria','monthly','2028-05-01','2028-05-31')
         returning id::text`, [q2.opC, q2.uGcC]);
      const e = await enviar(db, q2.uGcC, r[0].id).then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/sem criterios aplicaveis/i);
    });

    it('só o autor envia', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2028-06');
      const e = await enviar(db, ID.uCoord1, a.id).then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/apenas o autor/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('aprovação e snapshot', () => {
    it('o coordenador aprova e o snapshot nasce com o modelo mensal', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2029-01');
      await preencherEEnviar(db, a);
      const aprovada = await validar(db, ID.uCoord1, a.id, 'approved', 'Aprovada com ressalva');
      expect(aprovada.status).toBe('approved');

      const s = await db.query<{ model: string; tpl: string | null; period: string }>(
        `select evaluation_model::text model, template_version_id::text tpl, period
           from public.official_snapshots where evaluation_id=$1`, [a.id]);
      expect(s[0].model).toBe('monthly_criteria');
      expect(s[0].tpl).toBeNull();
      expect(s[0].period).toBe('2029-01');
    });

    it('o autor NÃO valida a própria auditoria', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2029-02');
      await preencherEEnviar(db, a);
      const e = await validar(db, ID.uGcA, a.id, 'approved').then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/validar a propria avaliacao/i);
    });

    it('papel sem permissão de validação é recusado', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2029-02');
      const e = await validar(db, ID.uGcB, a.id, 'approved').then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/fora do escopo|sem permissao de validacao/i);
    });

    it('o snapshot é IMUTÁVEL', async () => {
      const s = await db.query<{ id: string }>(
        `select id::text from public.official_snapshots where evaluation_model='monthly_criteria' limit 1`);
      const e = await db
        .asUser(ID.uAdmin, (tx) =>
          tx.query(`update public.official_snapshots set score = 0 where id = $1`, [s[0].id]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/append-only|permission|policy/i);
    });

    it('aprovar de novo não é possível: o estado já não é "aguardando validação"', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2029-01');
      const antes = await db.query<{ n: number }>(
        `select count(*)::int n from public.official_snapshots where evaluation_id=$1`, [a.id]);
      const e = await validar(db, ID.uCoord1, a.id, 'approved').then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/nao esta aguardando validacao/i);
      const depois = await db.query<{ n: number }>(
        `select count(*)::int n from public.official_snapshots where evaluation_id=$1`, [a.id]);
      expect(depois[0].n).toBe(antes[0].n);
      expect(antes[0].n).toBe(1);
    });

    it('devolver reabre para correção, e reenviar é possível', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2029-03');
      await preencherEEnviar(db, a);
      await validar(db, ID.uCoord1, a.id, 'returned', 'Falta detalhar o plano');
      const c = await responder(db, ID.uGcA, crit(a, 'CRIT-03').answer.id, {
        diagnosis: 'Painel retirado durante a reforma, com prazo de reinstalacao',
      });
      expect(c.answer.diagnosis).toMatch(/reinstalacao/);
      const reenviada = await enviar(db, ID.uGcA, a.id);
      expect(reenviada.status).toBe('submitted');
    });

    it('a trilha registra criação, envio e aprovação', async () => {
      const r = await db.query<{ event: string }>(
        `select distinct event from public.audit_logs
          where event like 'monthly_audit%' order by event`);
      expect(r.map((x) => x.event)).toEqual(['monthly_audit_started', 'monthly_audit_submitted']);
      const ap = await db.query<{ n: number }>(
        `select count(*)::int n from public.audit_logs where object_type='evaluation' and event like '%approved%'`);
      expect(ap[0].n).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('relatório: o legado intacto, o novo não fingido', () => {
    it('o relatório oficial RECUSA a auditoria mensal, citando A-05', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2029-01');
      const e = await db
        .asUser(ID.uCoord1, (tx) =>
          tx.query(`select public.get_official_audit_report_data($1)`, [a.id]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/A-05/);
      expect(e?.message).toMatch(/get_monthly_audit_snapshot/);
    });

    it('o snapshot mensal é lido por RPC própria, e diz que a nota é provisória', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2029-01');
      const r = await db.asUser(ID.uCoord1, (tx) =>
        tx.query<{ s: { period: string; scoreRule: string; official: MonthlyAudit } }>(
          `select public.get_monthly_audit_snapshot($1) as s`, [a.id]));
      expect(r[0].s.period).toBe('2029-01');
      expect(r[0].s.scoreRule).toMatch(/A-10-pendente/);
      expect(r[0].s.official.criteria).toHaveLength(3);
      // O snapshot guarda o CONTEÚDO CONGELADO, com ordenação estável.
      expect(r[0].s.official.criteria.map((c) => c.criterionCode))
        .toEqual(['CRIT-01', 'CRIT-02', 'CRIT-03']);
    });

    it('auditoria não aprovada não tem snapshot para ler', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2029-06');
      const e = await db
        .asUser(ID.uGcA, (tx) => tx.query(`select public.get_monthly_audit_snapshot($1)`, [a.id]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/ainda nao aprovada/i);
    });

    it('o snapshot mensal NÃO carrega REPORT_FORMAT_VERSION', async () => {
      const a = await iniciar(db, ID.uGcA, ID.opA, '2029-01');
      const r = await db.asUser(ID.uCoord1, (tx) =>
        tx.query<{ s: Record<string, unknown> }>(`select public.get_monthly_audit_snapshot($1) as s`, [a.id]));
      expect(Object.keys(r[0].s)).not.toContain('formatVersion');
      expect(JSON.stringify(r[0].s)).not.toMatch(/1\.3\.3/);
    });

    it('get_monthly_audit_snapshot recusa auditoria legada', async () => {
      const e = await db
        .asUser(ID.uCoord1, (tx) => tx.query(`select public.get_monthly_audit_snapshot($1)`, [ID.evalA]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/modelo antigo/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('segurança e escopo', () => {
    it('anon não executa RPC nenhuma nem lê tabela nenhuma', async () => {
      await db.asAnon(async (tx) => {
        for (const [sql, params] of [
          [`select public.start_monthly_audit($1,'2026-01')`, [ID.opA]],
          [`select public.get_monthly_audit($1,'2026-01')`, [ID.opA]],
          [`select public.list_monthly_audits($1,10)`, [ID.opA]],
          [`select public.submit_monthly_audit($1)`, [ID.evalA]],
          [`select public.get_monthly_audit_snapshot($1)`, [ID.evalA]],
        ] as Array<[string, unknown[]]>) {
          const e = await tx.expectError(sql, params);
          expect(e.message).toMatch(/permission denied|não existe|does not exist/i);
        }
        for (const t of ['evaluation_criteria', 'evaluation_criterion_answers',
          'evaluation_criterion_answer_evidence']) {
          const rows = await tx.query(`select * from public.${t}`).catch(() => []);
          expect(rows, `tabela ${t}`).toEqual([]);
        }
      });
    });

    it('anon e PUBLIC não têm grant; authenticated só tem SELECT', async () => {
      const semGrant = await db.query<{ n: number }>(
        `select count(*)::int n from information_schema.role_table_grants
          where table_schema='public'
            and table_name in ('evaluation_criteria','evaluation_criterion_answers',
                               'evaluation_criterion_answer_evidence')
            and grantee in ('anon','PUBLIC')`);
      expect(semGrant[0].n).toBe(0);

      const priv = await db.query<{ p: string }>(
        `select distinct privilege_type p from information_schema.role_table_grants
          where table_schema='public'
            and table_name in ('evaluation_criteria','evaluation_criterion_answers',
                               'evaluation_criterion_answer_evidence')
            and grantee='authenticated'`);
      expect(priv.map((x) => x.p).sort()).toEqual(['SELECT']);
    });

    it('as tabelas novas têm RLS habilitada E forçada', async () => {
      const r = await db.query<{ relname: string; e: boolean; f: boolean }>(
        `select relname, relrowsecurity e, relforcerowsecurity f from pg_class c
           join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and relname in ('evaluation_criteria',
            'evaluation_criterion_answers','evaluation_criterion_answer_evidence')`);
      expect(r).toHaveLength(3);
      expect(r.every((x) => x.e && x.f)).toBe(true);
    });

    it('GC de outro parceiro não inicia auditoria — fora do escopo', async () => {
      const e = await iniciar(db, ID.uGcB, ID.opA, '2030-01').then(() => null, (x: Error) => x);
      expect(e?.message).toMatch(/fora do escopo/i);
    });

    it('COORDENADOR, REGIONAL e ADMIN consultam, mas NÃO iniciam', async () => {
      for (const u of [ID.uCoord1, ID.uReg, ID.uAdmin]) {
        const e = await iniciar(db, u, ID.opA, '2030-02').then(() => null, (x: Error) => x);
        expect(e?.message, `usuario ${u}`).toMatch(/apenas o gerente de canal/i);
      }
    });

    it('coordenador de OUTRA coordenadoria não enxerga a auditoria', async () => {
      const e = await db
        .asUser(ID.uCoord2, (tx) => tx.query(`select public.get_monthly_audit($1,'2029-01')`, [ID.opA]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/fora do escopo/i);
    });

    it('a RLS esconde os critérios alheios na leitura DIRETA da tabela', async () => {
      const vistos = await db.asUser(ID.uGcB, (tx) =>
        tx.query<{ n: number }>(
          `select count(*)::int n from public.evaluation_criteria c
             join public.evaluations e on e.id = c.evaluation_id
            where e.operation_id = $1`, [ID.opA]));
      expect(vistos[0].n).toBe(0);
    });

    it('competência ainda não iniciada devolve nulo, não erro', async () => {
      const r = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ a: MonthlyAudit | null }>(`select public.get_monthly_audit($1,'2031-12') as a`, [ID.opA]));
      expect(r[0].a).toBeNull();
    });

    it('a lista sai da competência mais recente para a mais antiga', async () => {
      const r = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ l: Array<{ competence: string; criteriaCount: number }> }>(
          `select public.list_monthly_audits($1,200) as l`, [ID.opA]));
      const comps = r[0].l.map((x) => x.competence);
      expect(comps.length).toBeGreaterThan(3);
      expect([...comps].sort().reverse()).toEqual(comps);
    });

    it('GC não lista auditorias de parceiro alheio', async () => {
      const e = await db
        .asUser(ID.uGcB, (tx) => tx.query(`select public.list_monthly_audits($1,10)`, [ID.opA]))
        .then(() => null).catch((x: Error) => x);
      expect(e?.message).toMatch(/fora do escopo/i);
    });
  });
});
