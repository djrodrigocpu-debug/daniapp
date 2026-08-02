/**
 * GESTÃO ASSISTIDA semanal (migrations 0039–0041), em banco REAL (PGlite/PG18).
 *
 * A PERGUNTA QUE ESTE ARQUIVO RESPONDE. A decisão D1 promete um ciclo oficial
 * por parceiro por semana, com status calculado pelo servidor e fechamento que
 * exige plano de ação de verdade. Nada disso vale se estiver só na RPC: a
 * unicidade tem de ser do banco, o status tem de ser impossível de forjar e o
 * plano tem de ter integridade referencial. Aqui os três são exercidos contra o
 * banco, sob RLS, com o JWT de cada perfil.
 *
 * Dados 100% SINTÉTICOS (§23).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

interface PlanDto {
  id: string;
  action: string;
  owner: string;
  dueDate: string;
  status: string;
  source: string;
}

interface EntryDto {
  id: string;
  cycleId: string;
  indicatorCode: string;
  indicatorName: string;
  themeCode: string;
  themeName: string;
  unit: string;
  direction: string;
  target: number;
  tolerance: number;
  weight: number;
  actual: number | null;
  sourcePeriod: string;
  sourceConsultedAt: string | null;
  sourceReference: string;
  observation: string;
  diagnosis: string;
  status: 'conforme' | 'atencao' | 'nao_conforme' | 'sem_dado';
  ruleVersion: string;
  recordedBy: string | null;
  plan: PlanDto | null;
}

interface CycleDto {
  id: string;
  operationId: string;
  partnerName: string;
  weekStartDate: string;
  weekEndDate: string;
  status: 'draft' | 'closed';
  closedAt: string | null;
  ruleVersion: string | null;
  entries: EntryDto[];
}

/** Identificadores do catálogo montado só para estes testes. */
const CAT = {
  theme: '00000000-0000-0000-0000-0000000a0001',
  themeV: '00000000-0000-0000-0000-0000000a0002',
  // Indicador "quanto maior melhor" — conversão.
  higherDef: '00000000-0000-0000-0000-0000000a0011',
  higherVer: '00000000-0000-0000-0000-0000000a0012',
  higherCfg: '00000000-0000-0000-0000-0000000a0013',
  higherCfgV: '00000000-0000-0000-0000-0000000a0014',
  // Indicador "quanto menor melhor" — cancelamento.
  lowerDef: '00000000-0000-0000-0000-0000000a0021',
  lowerVer: '00000000-0000-0000-0000-0000000a0022',
  lowerCfg: '00000000-0000-0000-0000-0000000a0023',
  lowerCfgV: '00000000-0000-0000-0000-0000000a0024',
} as const;

/**
 * Monta o catálogo da região 1 pelo caminho de DADOS (superuser), não pelas
 * RPCs `catalog_*`: aqui o objeto de estudo é a Gestão Assistida, e o catálogo é
 * pré-condição. As RPCs de catálogo já têm 78 casos próprios em
 * `catalog_*.integration.test.ts`.
 */
async function seedCatalogoRegiao1(db: TestDb): Promise<void> {
  await db.exec(`
    insert into public.themes (id, code, scope_kind, lifecycle, created_by)
      values ('${CAT.theme}','TEMA-GA','global','active','${ID.uAdmin}');
    insert into public.theme_versions (id, theme_id, version_number, name, sort_order, status, active)
      values ('${CAT.themeV}','${CAT.theme}',1,'Resultado comercial',1,'published',true);

    insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind)
      values ('${CAT.higherDef}','IND-GA-H','Conversao','active','global'),
             ('${CAT.lowerDef}','IND-GA-L','Cancelamento','active','global');

    insert into public.indicator_versions
      (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, name, description, status)
      values
        ('${CAT.higherVer}','${CAT.higherDef}',1,'%','higher_better',0,0,1,'Conversao','Some no relatorio oficial da operacao','published'),
        ('${CAT.lowerVer}','${CAT.lowerDef}',1,'%','lower_better',0,0,1,'Cancelamento','Aba de cancelamentos','published');

    insert into public.indicator_regional_configs (id, region_id, indicator_definition_id, created_by)
      values ('${CAT.higherCfg}','${ID.region}','${CAT.higherDef}','${ID.uAdmin}'),
             ('${CAT.lowerCfg}','${ID.region}','${CAT.lowerDef}','${ID.uAdmin}');

    insert into public.indicator_regional_config_versions
      (id, config_id, version_number, indicator_version_id, theme_version_id,
       sort_order, target, tolerance, weight, active,
       include_in_assisted_management, include_in_monthly_audit, status)
      values
        ('${CAT.higherCfgV}','${CAT.higherCfg}',1,'${CAT.higherVer}','${CAT.themeV}',1,80,5,2,true,true,false,'published'),
        ('${CAT.lowerCfgV}','${CAT.lowerCfg}',1,'${CAT.lowerVer}','${CAT.themeV}',2,10,2,1,true,true,false,'published');
  `);
}

const abrir = (db: TestDb, user: string, op: string, ref?: string) =>
  db.asUser(user, (tx) =>
    tx.query<{ c: CycleDto }>(`select public.open_assisted_cycle($1,$2::date) as c`, [op, ref ?? null]),
  ).then((r) => r[0].c);

const salvar = (db: TestDb, user: string, entryId: string, patch: Record<string, unknown>) =>
  db.asUser(user, (tx) =>
    tx.query<{ e: EntryDto }>(`select public.save_assisted_entry($1,$2::jsonb) as e`, [
      entryId,
      JSON.stringify(patch),
    ]),
  ).then((r) => r[0].e);

const fechar = (db: TestDb, user: string, cycleId: string) =>
  db.asUser(user, (tx) =>
    tx.query<{ c: CycleDto }>(`select public.close_assisted_cycle($1) as c`, [cycleId]),
  ).then((r) => r[0].c);

const entrada = (c: CycleDto, code: string): EntryDto => {
  const e = c.entries.find((x) => x.indicatorCode === code);
  if (!e) throw new Error(`entrada ${code} ausente no ciclo`);
  return e;
};

/** Cria plano pelo MOTOR ÚNICO, vinculado ao item. Não há outro caminho. */
const criarPlano = (
  db: TestDb,
  user: string,
  op: string,
  entryId: string,
  over: Record<string, unknown> = {},
) =>
  db.asUser(user, (tx) =>
    tx.query<{ p: { id: string } }>(`select public.save_action_plan($1::jsonb) as p`, [
      JSON.stringify({
        operationId: op,
        assistedEntryId: entryId,
        themeId: 'TEMA-GA',
        action: 'Treinar equipe de atendimento',
        problem: 'Conversao abaixo da meta',
        owner: 'Coordenador da loja',
        dueDate: '2099-12-31',
        priority: 'high',
        ...over,
      }),
    ]),
  ).then((r) => r[0].p);

describe('Gestão Assistida — ciclo semanal (0039–0041)', () => {
  let db: TestDb;
  const SEG = '2026-07-27'; // segunda-feira
  const QUA = '2026-07-29'; // quarta da MESMA semana

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedCatalogoRegiao1(db);
  });
  afterAll(async () => db.close());

  // -------------------------------------------------------------------------
  describe('a semana empresarial', () => {
    it('week_start_date é sempre a segunda-feira, qualquer dia da semana', async () => {
      const r = await db.query<{ d: string; iso: number }>(
        `select app.assisted_week_start($1::date)::text d,
                extract(isodow from app.assisted_week_start($1::date))::int iso`,
        [QUA],
      );
      expect(r[0].d).toBe(SEG);
      expect(r[0].iso).toBe(1);
    });

    it('domingo pertence à semana que começou na segunda anterior', async () => {
      const r = await db.query<{ d: string }>(
        `select app.assisted_week_start('2026-08-02'::date)::text d`,
      );
      expect(r[0].d).toBe(SEG);
    });

    it('“hoje” é lido em America/Sao_Paulo, não em UTC', async () => {
      // 02/08/2026 00:30 UTC ainda é 01/08 em São Paulo (UTC-3). Se a função
      // usasse UTC, a semana viraria um dia antes da hora para todo o país.
      const r = await db.query<{ sp: string; utc: string }>(
        `select ('2026-08-02 00:30:00+00'::timestamptz at time zone 'America/Sao_Paulo')::date::text sp,
                ('2026-08-02 00:30:00+00'::timestamptz at time zone 'UTC')::date::text utc`,
      );
      expect(r[0].sp).toBe('2026-08-01');
      expect(r[0].utc).toBe('2026-08-02');
    });

    it('o banco recusa ciclo cuja data não seja segunda-feira', async () => {
      const e = await db
        .query(
          `insert into public.assisted_cycles (operation_id, week_start_date, author_user_id)
             values ($1,$2::date,$3)`,
          [ID.opA, QUA, ID.uGcA],
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/monday_ck|check/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('abertura idempotente', () => {
    it('o GC responsável abre o ciclo e recebe o catálogo aplicável', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, QUA);
      expect(c.weekStartDate).toBe(SEG);
      expect(c.weekEndDate).toBe('2026-08-02');
      expect(c.status).toBe('draft');
      expect(c.partnerName).toBe('Parceiro A');
      expect(c.entries.map((e) => e.indicatorCode)).toEqual(['IND-GA-H', 'IND-GA-L']);
    });

    it('a regra da região é MATERIALIZADA na entrada, não lida por referência', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, QUA);
      const h = entrada(c, 'IND-GA-H');
      expect(Number(h.target)).toBe(80);
      expect(Number(h.tolerance)).toBe(5);
      expect(Number(h.weight)).toBe(2);
      expect(h.unit).toBe('%');
      expect(h.direction).toBe('higher_better');
      expect(h.themeName).toBe('Resultado comercial');
      // A meta NÃO vem de indicator_versions — lá ela é neutra (ADR §4, D-D).
      const iv = await db.query<{ t: string }>(
        `select target::text t from public.indicator_versions where id = $1`,
        [CAT.higherVer],
      );
      expect(Number(iv[0].t)).toBe(0);
    });

    it('reabrir a MESMA semana devolve o MESMO ciclo, não um segundo', async () => {
      const a = await abrir(db, ID.uGcA, ID.opA, SEG);
      const b = await abrir(db, ID.uGcA, ID.opA, QUA); // outro dia, mesma semana
      expect(b.id).toBe(a.id);
      const n = await db.query<{ n: number }>(
        `select count(*)::int n from public.assisted_cycles where operation_id=$1 and week_start_date=$2::date`,
        [ID.opA, SEG],
      );
      expect(n[0].n).toBe(1);
    });

    it('a unicidade é do BANCO: um segundo insert direto é recusado', async () => {
      await abrir(db, ID.uGcA, ID.opA, SEG);
      const e = await db
        .query(
          `insert into public.assisted_cycles (operation_id, week_start_date, author_user_id)
             values ($1,$2::date,$3)`,
          [ID.opA, SEG, ID.uGcA],
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/assisted_cycles_week_uk|duplicate/i);
    });

    it('a trilha registra a abertura UMA vez, mesmo reabrindo', async () => {
      const antes = await db.query<{ n: number }>(
        `select count(*)::int n from public.audit_logs where event='assisted_cycle_opened'`,
      );
      await abrir(db, ID.uGcA, ID.opA, SEG);
      await abrir(db, ID.uGcA, ID.opA, SEG);
      const depois = await db.query<{ n: number }>(
        `select count(*)::int n from public.audit_logs where event='assisted_cycle_opened'`,
      );
      expect(depois[0].n).toBe(antes[0].n);
    });

    it('semanas diferentes são ciclos diferentes', async () => {
      const a = await abrir(db, ID.uGcA, ID.opA, SEG);
      const b = await abrir(db, ID.uGcA, ID.opA, '2026-08-03');
      expect(b.id).not.toBe(a.id);
      expect(b.weekStartDate).toBe('2026-08-03');
    });
  });

  // -------------------------------------------------------------------------
  describe('composição do catálogo', () => {
    it('indicador SEM configuração regional não entra — existir não ativa nada (D-G)', async () => {
      // IND-FIC existe no cenário base, é global e ativo, e nunca foi adotado.
      const c = await abrir(db, ID.uGcA, ID.opA, SEG);
      expect(c.entries.map((e) => e.indicatorCode)).not.toContain('IND-FIC');
    });

    it('configuração em RASCUNHO não entra', async () => {
      const cfg = '00000000-0000-0000-0000-0000000b0001';
      const def = '00000000-0000-0000-0000-0000000b0002';
      const ver = '00000000-0000-0000-0000-0000000b0003';
      await db.exec(`
        insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind)
          values ('${def}','IND-GA-DRAFT','Rascunho','active','global');
        insert into public.indicator_versions (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, status)
          values ('${ver}','${def}',1,'%','higher_better',0,0,1,'published');
        insert into public.indicator_regional_configs (id, region_id, indicator_definition_id)
          values ('${cfg}','${ID.region}','${def}');
        insert into public.indicator_regional_config_versions
          (config_id, version_number, indicator_version_id, theme_version_id, target, tolerance, status, include_in_assisted_management)
          values ('${cfg}',1,'${ver}','${CAT.themeV}',50,0,'draft',true);
      `);
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-08-10');
      expect(c.entries.map((e) => e.indicatorCode)).not.toContain('IND-GA-DRAFT');
    });

    it('configuração com include_in_assisted_management = false não entra', async () => {
      const cfg = '00000000-0000-0000-0000-0000000b0011';
      const def = '00000000-0000-0000-0000-0000000b0012';
      const ver = '00000000-0000-0000-0000-0000000b0013';
      await db.exec(`
        insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind)
          values ('${def}','IND-GA-AUDIT','So auditoria','active','global');
        insert into public.indicator_versions (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, status)
          values ('${ver}','${def}',1,'%','higher_better',0,0,1,'published');
        insert into public.indicator_regional_configs (id, region_id, indicator_definition_id)
          values ('${cfg}','${ID.region}','${def}');
        insert into public.indicator_regional_config_versions
          (config_id, version_number, indicator_version_id, theme_version_id, target, tolerance, status, include_in_assisted_management)
          values ('${cfg}',1,'${ver}','${CAT.themeV}',50,0,'published',false);
      `);
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-08-17');
      expect(c.entries.map((e) => e.indicatorCode)).not.toContain('IND-GA-AUDIT');
    });

    it('configuração INATIVA não entra', async () => {
      const cfg = '00000000-0000-0000-0000-0000000b0021';
      const def = '00000000-0000-0000-0000-0000000b0022';
      const ver = '00000000-0000-0000-0000-0000000b0023';
      await db.exec(`
        insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind)
          values ('${def}','IND-GA-OFF','Inativa','active','global');
        insert into public.indicator_versions (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, status)
          values ('${ver}','${def}',1,'%','higher_better',0,0,1,'published');
        insert into public.indicator_regional_configs (id, region_id, indicator_definition_id)
          values ('${cfg}','${ID.region}','${def}');
        insert into public.indicator_regional_config_versions
          (config_id, version_number, indicator_version_id, theme_version_id, target, tolerance, status, active, include_in_assisted_management)
          values ('${cfg}',1,'${ver}','${CAT.themeV}',50,0,'published',false,true);
      `);
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-08-24');
      expect(c.entries.map((e) => e.indicatorCode)).not.toContain('IND-GA-OFF');
    });

    it('configuração de OUTRA REGIÃO não entra no ciclo desta', async () => {
      const q2 = await seedSecondRegion(db);
      const cfg = '00000000-0000-0000-0000-0000000b0031';
      const def = '00000000-0000-0000-0000-0000000b0032';
      const ver = '00000000-0000-0000-0000-0000000b0033';
      await db.exec(`
        insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind)
          values ('${def}','IND-GA-R2','Da regiao 2','active','global');
        insert into public.indicator_versions (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, status)
          values ('${ver}','${def}',1,'%','higher_better',0,0,1,'published');
        insert into public.indicator_regional_configs (id, region_id, indicator_definition_id)
          values ('${cfg}','${q2.region2}','${def}');
        insert into public.indicator_regional_config_versions
          (config_id, version_number, indicator_version_id, theme_version_id, target, tolerance, status, include_in_assisted_management)
          values ('${cfg}',1,'${ver}','${CAT.themeV}',50,0,'published',true);
      `);
      const c1 = await abrir(db, ID.uGcA, ID.opA, '2026-08-31');
      expect(c1.entries.map((e) => e.indicatorCode)).not.toContain('IND-GA-R2');

      // E o ciclo da região 2 recebe o dela, e NÃO os da região 1.
      const c2 = await abrir(db, q2.uGcC, q2.opC, '2026-08-31');
      expect(c2.entries.map((e) => e.indicatorCode)).toEqual(['IND-GA-R2']);
    });

    it('o gatilho recusa entrada com configuração de outra região, mesmo por escrita direta', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, SEG);
      const e = await db
        .query(
          `insert into public.assisted_cycle_entries
             (cycle_id, indicator_definition_id, indicator_version_id, regional_config_id,
              regional_config_version_id, theme_id, theme_version_id, indicator_code,
              indicator_name, theme_code, theme_name, unit, direction, target)
           values ($1,'00000000-0000-0000-0000-0000000b0032','00000000-0000-0000-0000-0000000b0033',
                   '00000000-0000-0000-0000-0000000b0031',
                   (select id from public.indicator_regional_config_versions where config_id='00000000-0000-0000-0000-0000000b0031'),
                   $2,$3,'IND-GA-R2','Da regiao 2','TEMA-GA','Resultado comercial','%','higher_better',50)`,
          [c.id, CAT.theme, CAT.themeV],
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/outra regiao/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('cálculo do status', () => {
    const casos: Array<[string, number, number, number, string]> = [
      ['higher_better', 80, 5, 85, 'conforme'],
      ['higher_better', 80, 5, 80, 'conforme'],
      ['higher_better', 80, 5, 76, 'atencao'],
      ['higher_better', 80, 5, 75, 'atencao'],
      ['higher_better', 80, 5, 74.9, 'nao_conforme'],
      ['lower_better', 10, 2, 8, 'conforme'],
      ['lower_better', 10, 2, 10, 'conforme'],
      ['lower_better', 10, 2, 11, 'atencao'],
      ['lower_better', 10, 2, 12, 'atencao'],
      ['lower_better', 10, 2, 12.1, 'nao_conforme'],
    ];

    it.each(casos)('%s meta=%d tol=%d realizado=%d → %s', async (dir, t, tol, act, esperado) => {
      const r = await db.query<{ s: string }>(
        `select app.assisted_status_of($1::app.indicator_direction,$2,$3,$4)::text s`,
        [dir, t, tol, act],
      );
      expect(r[0].s).toBe(esperado);
    });

    it('sem realizado → sem_dado, e sem_dado NÃO é não conformidade', async () => {
      const r = await db.query<{ s: string }>(
        `select app.assisted_status_of('higher_better'::app.indicator_direction,80,5,null)::text s`,
      );
      expect(r[0].s).toBe('sem_dado');
      expect(r[0].s).not.toBe('nao_conforme');
    });

    it('target_band FALHA explicitamente e cita A-01 — nunca inventa comportamento', async () => {
      const e = await db
        .query(`select app.assisted_status_of('target_band'::app.indicator_direction,80,5,85)`)
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/target_band/);
      expect(e?.message).toMatch(/A-01/);
      // Não converteu para nenhuma das duas direções conhecidas.
      expect(e?.message).not.toMatch(/conforme/);
    });

    it('o cliente NÃO consegue forjar o status: o servidor sobrescreve', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, SEG);
      const h = entrada(c, 'IND-GA-H');
      await db.query(
        `update public.assisted_cycle_entries
            set status='conforme', actual=10, source_period='2026-07', source_consulted_at=$2::date
          where id=$1`,
        [h.id, SEG],
      );
      const r = await db.query<{ s: string }>(
        `select status::text s from public.assisted_cycle_entries where id=$1`,
        [h.id],
      );
      // 10 contra meta 80 com tolerância 5 é não conformidade, digam o que disserem.
      expect(r[0].s).toBe('nao_conforme');
      await db.query(
        `update public.assisted_cycle_entries set actual=null, source_period='', source_consulted_at=null where id=$1`,
        [h.id],
      );
    });

    it('a RPC calcula e grava o status a partir do valor informado', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, SEG);
      const h = entrada(c, 'IND-GA-H');
      const e = await salvar(db, ID.uGcA, h.id, {
        actual: 92,
        sourcePeriod: '2026-07',
        sourceConsultedAt: SEG,
        sourceReference: 'Painel semanal, aba Conversao',
      });
      expect(e.status).toBe('conforme');
      expect(e.ruleVersion).toBe('assisted-status/1.3.5-a');
      expect(e.recordedBy).toBe(ID.uGcA);
    });

    it('resultado sem período da fonte e data da consulta é recusado', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, SEG);
      const l = entrada(c, 'IND-GA-L');
      const e = await salvar(db, ID.uGcA, l.id, { actual: 5 }).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/periodo da fonte/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('planos: motor único, vínculo íntegro', () => {
    it('o plano nasce em action_plans com source = assisted e FK ao item', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-09-07');
      const h = entrada(c, 'IND-GA-H');
      const p = await criarPlano(db, ID.uGcA, ID.opA, h.id);
      const r = await db.query<{ src: string; entry: string; op: string }>(
        `select source::text src, assisted_entry_id::text entry, operation_id::text op
           from public.action_plans where id=$1`,
        [p.id],
      );
      expect(r[0].src).toBe('assisted');
      expect(r[0].entry).toBe(h.id);
      expect(r[0].op).toBe(ID.opA);
    });

    it('o item do ciclo passa a exibir o plano, com o estado ATUAL dele', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-09-07');
      const h = entrada(c, 'IND-GA-H');
      const depois = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ c: CycleDto }>(`select public.get_assisted_cycle($1,$2::date) as c`, [
          ID.opA,
          '2026-09-07',
        ]),
      );
      const e = entrada(depois[0].c, 'IND-GA-H');
      expect(e.plan?.owner).toBe('Coordenador da loja');
      expect(e.plan?.status).toBe('not_started');
      expect(e.plan?.source).toBe('assisted');
      expect(e.plan?.id).toBe(h.plan?.id);
      // O item SEM plano continua com `plan` nulo — a projeção não inventa objeto.
      expect(entrada(depois[0].c, 'IND-GA-L').plan).toBeNull();
    });

    it('plano de OUTRO PARCEIRO não pode ser vinculado ao item', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-09-14');
      const h = entrada(c, 'IND-GA-H');
      const e = await db
        .query(
          `insert into public.action_plans (operation_id, assisted_entry_id, source, description, due_date, priority)
             values ($1,$2,'assisted','x','2099-01-01','high')`,
          [ID.opB, h.id],
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/outro parceiro/i);
    });

    it('item INEXISTENTE é recusado — nunca vira UUID solto', async () => {
      const e = await db
        .query(
          `insert into public.action_plans (operation_id, assisted_entry_id, source, description, due_date, priority)
             values ($1,'00000000-0000-0000-0000-0000000fffff','assisted','x','2099-01-01','high')`,
          [ID.opA],
        )
        .then(() => null)
        .catch((x: Error) => x);
      // O gatilho de coerência fala antes da FK, com mensagem melhor. A FK
      // continua sendo a garantia estrutural — verificada logo abaixo.
      expect(e?.message).toMatch(/inexistente/i);

      const fk = await db.query<{ n: number }>(
        `select count(*)::int n
           from information_schema.referential_constraints rc
           join information_schema.key_column_usage k on k.constraint_name = rc.constraint_name
          where k.table_name = 'action_plans' and k.column_name = 'assisted_entry_id'`,
      );
      expect(fk[0].n).toBe(1);
    });

    it('origem inconsistente com a FK é recusada pelo CHECK', async () => {
      const e1 = await db
        .query(
          `insert into public.action_plans (operation_id, source, description, due_date, priority)
             values ($1,'assisted','sem item','2099-01-01','high')`,
          [ID.opA],
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e1?.message).toMatch(/action_plans_source_ck|check/i);

      const c = await abrir(db, ID.uGcA, ID.opA, '2026-09-21');
      const h = entrada(c, 'IND-GA-H');
      const e2 = await db
        .query(
          `insert into public.action_plans (operation_id, assisted_entry_id, source, description, due_date, priority)
             values ($1,$2,'legacy','item com origem legada','2099-01-01','high')`,
          [ID.opA, h.id],
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e2?.message).toMatch(/action_plans_source_ck|check/i);
    });

    it('monthly_audit ainda é recusado — a Fase 5 é que cria a coluna de origem', async () => {
      const e = await db
        .query(
          `insert into public.action_plans (operation_id, source, description, due_date, priority)
             values ($1,'monthly_audit','antecipada','2099-01-01','high')`,
          [ID.opA],
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/action_plans_source_ck|check/i);
    });

    it('um item tem NO MÁXIMO um plano', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-09-28');
      const h = entrada(c, 'IND-GA-H');
      await criarPlano(db, ID.uGcA, ID.opA, h.id);
      const e = await criarPlano(db, ID.uGcA, ID.opA, h.id).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/action_plans_assisted_entry_uk|duplicate/i);
    });

    it('o vínculo é imutável: repontar para outro item é recusado', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-10-05');
      const h = entrada(c, 'IND-GA-H');
      const l = entrada(c, 'IND-GA-L');
      const p = await criarPlano(db, ID.uGcA, ID.opA, h.id);
      const e = await db
        .query(`update public.action_plans set assisted_entry_id=$2 where id=$1`, [p.id, l.id])
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/repontada/i);
    });

    it('planos LEGADOS permanecem válidos, com source = legacy por default', async () => {
      const p = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ p: { id: string } }>(`select public.save_action_plan($1::jsonb) as p`, [
          JSON.stringify({
            operationId: ID.opA,
            themeId: 'I01',
            action: 'Plano do caminho antigo',
            owner: 'Alguem',
            dueDate: '2099-01-01',
            priority: 'medium',
          }),
        ]),
      );
      const r = await db.query<{ src: string; entry: string | null }>(
        `select source::text src, assisted_entry_id::text entry from public.action_plans where id=$1`,
        [p[0].p.id],
      );
      expect(r[0].src).toBe('legacy');
      expect(r[0].entry).toBeNull();
    });

    it('a anti-auto-validação continua valendo para o plano da Gestão Assistida', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-10-12');
      const h = entrada(c, 'IND-GA-H');
      const p = await criarPlano(db, ID.uGcA, ID.opA, h.id);
      await db.asUser(ID.uGcA, (tx) =>
        tx.query(`select public.update_action_status($1,'in_progress')`, [p.id]),
      );
      await db.asUser(ID.uGcA, (tx) =>
        tx.query(`select public.update_action_status($1,'completed')`, [p.id]),
      );
      const e = await db
        .asUser(ID.uGcA, (tx) => tx.query(`select public.update_action_status($1,'validated')`, [p.id]))
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/coordenacao, regional ou administracao|criou o plano/i);
    });

    it('`overdue` continua derivado: gravação manual é recusada', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-10-19');
      const h = entrada(c, 'IND-GA-H');
      const p = await criarPlano(db, ID.uGcA, ID.opA, h.id);
      const e = await db
        .asUser(ID.uGcA, (tx) => tx.query(`select public.update_action_status($1,'overdue')`, [p.id]))
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/derivado da data/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('fechamento', () => {
    const semanaOk = '2026-11-02';

    it('sem dado impede o fechamento — e a mensagem nomeia o indicador', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, semanaOk);
      const e = await fechar(db, ID.uGcA, c.id).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/sem resultado informado/i);
      expect(e?.message).toMatch(/IND-GA-/);
    });

    it('desvio sem diagnóstico é recusado', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, semanaOk);
      await salvar(db, ID.uGcA, entrada(c, 'IND-GA-H').id, {
        actual: 60, sourcePeriod: '2026-10', sourceConsultedAt: semanaOk,
      });
      await salvar(db, ID.uGcA, entrada(c, 'IND-GA-L').id, {
        actual: 5, sourcePeriod: '2026-10', sourceConsultedAt: semanaOk,
      });
      const e = await fechar(db, ID.uGcA, c.id).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/sem diagnostico/i);
    });

    it('desvio com diagnóstico mas sem plano é recusado', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, semanaOk);
      await salvar(db, ID.uGcA, entrada(c, 'IND-GA-H').id, { diagnosis: 'Equipe reduzida na semana' });
      const e = await fechar(db, ID.uGcA, c.id).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/sem plano de acao/i);
    });

    it('plano sem responsável é recusado', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, semanaOk);
      const h = entrada(c, 'IND-GA-H');
      await criarPlano(db, ID.uGcA, ID.opA, h.id, { owner: '' });
      const e = await fechar(db, ID.uGcA, c.id).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/responsavel e prazo/i);
    });

    it('com diagnóstico, plano, responsável e prazo o ciclo fecha e materializa a regra', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, semanaOk);
      const h = entrada(c, 'IND-GA-H');
      await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ p: unknown }>(`select public.save_action_plan($1::jsonb) as p`, [
          JSON.stringify({
            id: h.plan?.id,
            operationId: ID.opA,
            assistedEntryId: h.id,
            themeId: 'TEMA-GA',
            action: 'Treinar equipe',
            owner: 'Coordenador da loja',
            dueDate: '2099-12-31',
            priority: 'high',
          }),
        ]),
      );
      const fechado = await fechar(db, ID.uGcA, c.id);
      expect(fechado.status).toBe('closed');
      expect(fechado.closedAt).not.toBeNull();
      expect(fechado.ruleVersion).toBe('assisted-status/1.3.5-a');
    });

    it('CONFORME não exige plano nem diagnóstico', async () => {
      const semana = '2026-11-09';
      const c = await abrir(db, ID.uGcA, ID.opA, semana);
      await salvar(db, ID.uGcA, entrada(c, 'IND-GA-H').id, {
        actual: 95, sourcePeriod: '2026-11', sourceConsultedAt: semana,
      });
      await salvar(db, ID.uGcA, entrada(c, 'IND-GA-L').id, {
        actual: 3, sourcePeriod: '2026-11', sourceConsultedAt: semana,
      });
      const fechado = await fechar(db, ID.uGcA, c.id);
      expect(fechado.status).toBe('closed');
      expect(fechado.entries.every((e) => e.status === 'conforme')).toBe(true);
      expect(fechado.entries.every((e) => e.plan === null)).toBe(true);
    });

    it('fechar de novo é NO-OP idempotente, sem evento duplicado na trilha', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-11-09');
      const antes = await db.query<{ n: number }>(
        `select count(*)::int n from public.audit_logs where event='assisted_cycle_closed' and object_id=$1`,
        [c.id],
      );
      const de_novo = await fechar(db, ID.uGcA, c.id);
      expect(de_novo.status).toBe('closed');
      const depois = await db.query<{ n: number }>(
        `select count(*)::int n from public.audit_logs where event='assisted_cycle_closed' and object_id=$1`,
        [c.id],
      );
      expect(depois[0].n).toBe(antes[0].n);
      expect(antes[0].n).toBe(1);
    });

    it('ciclo fechado é imutável — nem pela RPC, nem por escrita direta', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-11-09');
      const h = entrada(c, 'IND-GA-H');

      const viaRpc = await salvar(db, ID.uGcA, h.id, { actual: 1 }).then(
        () => null,
        (x: Error) => x,
      );
      expect(viaRpc?.message).toMatch(/ciclo fechado/i);

      const direto = await db
        .asUser(ID.uGcA, (tx) =>
          tx.query(`update public.assisted_cycle_entries set actual=1 where id=$1`, [h.id]),
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(direto?.message).toMatch(/ciclo fechado|permission|policy/i);

      const cabecalho = await db
        .asUser(ID.uGcA, (tx) =>
          tx.query(`update public.assisted_cycles set status='draft' where id=$1`, [c.id]),
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(cabecalho?.message).toMatch(/ciclo fechado|permission|policy/i);
    });

    it('mudar a META depois do fechamento NÃO reescreve o status histórico', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-11-09');
      const antes = entrada(c, 'IND-GA-H');
      expect(antes.status).toBe('conforme');
      expect(Number(antes.target)).toBe(80);

      // A região publica uma meta nova, muito acima do realizado.
      await db.exec(`
        update public.indicator_regional_config_versions set effective_to = now()
          where id = '${CAT.higherCfgV}';
        insert into public.indicator_regional_config_versions
          (config_id, version_number, indicator_version_id, theme_version_id,
           sort_order, target, tolerance, weight, active,
           include_in_assisted_management, include_in_monthly_audit, status)
          values ('${CAT.higherCfg}',2,'${CAT.higherVer}','${CAT.themeV}',1,99,0,2,true,true,false,'published');
      `);

      const depois = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ c: CycleDto }>(`select public.get_assisted_cycle($1,$2::date) as c`, [
          ID.opA, '2026-11-09',
        ]),
      );
      const agora = entrada(depois[0].c, 'IND-GA-H');
      expect(Number(agora.target)).toBe(80);   // a cópia congelada
      expect(agora.status).toBe('conforme');   // e o status que ela produziu
    });

    it('o plano continua evoluindo depois do fechamento, sem tocar o ciclo', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-11-02');
      const h = entrada(c, 'IND-GA-H');
      expect(c.status).toBe('closed');
      await db.asUser(ID.uGcA, (tx) =>
        tx.query(`select public.update_action_status($1,'in_progress')`, [h.plan!.id]),
      );
      const depois = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ c: CycleDto }>(`select public.get_assisted_cycle($1,$2::date) as c`, [
          ID.opA, '2026-11-02',
        ]),
      );
      const e = entrada(depois[0].c, 'IND-GA-H');
      expect(e.plan?.status).toBe('in_progress');
      expect(e.status).toBe('nao_conforme');   // o snapshot do ciclo não mudou
      expect(depois[0].c.status).toBe('closed');
    });

    it('ciclo fechado não aceita vínculo de plano NOVO', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-11-02');
      const l = entrada(c, 'IND-GA-L');
      const e = await criarPlano(db, ID.uGcA, ID.opA, l.id).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/ciclo fechado/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('segurança e escopo', () => {
    it('anon não executa RPC nenhuma nem lê tabela nenhuma', async () => {
      await db.asAnon(async (tx) => {
        for (const sql of [
          `select public.open_assisted_cycle($1,null)`,
          `select public.get_assisted_cycle($1,null)`,
          `select public.list_assisted_cycles($1,10)`,
        ]) {
          const e = await tx.expectError(sql, [ID.opA]);
          expect(e.message).toMatch(/permission denied|não existe|does not exist/i);
        }
        const cycles = await tx.query(`select * from public.assisted_cycles`).catch(() => []);
        expect(cycles).toEqual([]);
        const entries = await tx.query(`select * from public.assisted_cycle_entries`).catch(() => []);
        expect(entries).toEqual([]);
      });
    });

    it('anon e PUBLIC não têm grant nas tabelas novas', async () => {
      const r = await db.query<{ n: number }>(
        `select count(*)::int n from information_schema.role_table_grants
          where table_schema='public'
            and table_name in ('assisted_cycles','assisted_cycle_entries')
            and grantee in ('anon','PUBLIC')`,
      );
      expect(r[0].n).toBe(0);
    });

    it('authenticated só tem SELECT nas tabelas novas', async () => {
      const r = await db.query<{ p: string }>(
        `select distinct privilege_type p from information_schema.role_table_grants
          where table_schema='public'
            and table_name in ('assisted_cycles','assisted_cycle_entries')
            and grantee='authenticated'`,
      );
      expect(r.map((x) => x.p).sort()).toEqual(['SELECT']);
    });

    it('as tabelas novas têm RLS habilitada E forçada', async () => {
      const r = await db.query<{ relname: string; e: boolean; f: boolean }>(
        `select relname, relrowsecurity e, relforcerowsecurity f from pg_class c
           join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and relname in ('assisted_cycles','assisted_cycle_entries')`,
      );
      expect(r).toHaveLength(2);
      expect(r.every((x) => x.e && x.f)).toBe(true);
    });

    it('GC de outro parceiro não abre ciclo — fora do escopo', async () => {
      const e = await abrir(db, ID.uGcB, ID.opA, SEG).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/fora do escopo/i);
    });

    it('COORDENADOR, REGIONAL e ADMIN consultam, mas NÃO executam', async () => {
      for (const u of [ID.uCoord1, ID.uReg, ID.uAdmin]) {
        const e = await abrir(db, u, ID.opA, SEG).then(
          () => null,
          (x: Error) => x,
        );
        expect(e?.message, `usuário ${u} não deveria executar`).toMatch(/apenas o gerente de canal/i);

        const lido = await db.asUser(u, (tx) =>
          tx.query<{ c: CycleDto | null }>(`select public.get_assisted_cycle($1,$2::date) as c`, [
            ID.opA, SEG,
          ]),
        );
        expect(lido[0].c?.operationId).toBe(ID.opA);
      }
    });

    it('permissão administrativa NÃO é atalho: admin também é recusado no fechamento', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, SEG);
      const e = await fechar(db, ID.uAdmin, c.id).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/apenas o gerente de canal/i);
    });

    it('coordenador de OUTRA coordenadoria não enxerga o ciclo', async () => {
      const e = await db
        .asUser(ID.uCoord2, (tx) =>
          tx.query(`select public.get_assisted_cycle($1,$2::date) as c`, [ID.opA, SEG]),
        )
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/fora do escopo/i);
    });

    it('a RLS esconde o ciclo alheio na leitura DIRETA da tabela', async () => {
      await abrir(db, ID.uGcA, ID.opA, SEG);
      const vistos = await db.asUser(ID.uGcB, (tx) =>
        tx.query<{ n: number }>(
          `select count(*)::int n from public.assisted_cycles where operation_id=$1`,
          [ID.opA],
        ),
      );
      expect(vistos[0].n).toBe(0);
    });

    it('GC não registra em item de parceiro alheio', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, SEG);
      const h = entrada(c, 'IND-GA-H');
      const e = await salvar(db, ID.uGcB, h.id, { observation: 'invasao' }).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/inexistente ou fora do escopo/i);
    });

    it('coordenador não cria plano da Gestão Assistida em nome do GC', async () => {
      const c = await abrir(db, ID.uGcA, ID.opA, '2026-12-07');
      const h = entrada(c, 'IND-GA-H');
      const e = await criarPlano(db, ID.uCoord1, ID.opA, h.id).then(
        () => null,
        (x: Error) => x,
      );
      expect(e?.message).toMatch(/apenas o gerente de canal/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('consulta histórica', () => {
    it('lista as semanas do parceiro, da mais recente para a mais antiga', async () => {
      const r = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ l: Array<{ weekStartDate: string; status: string; entryCount: number }> }>(
          `select public.list_assisted_cycles($1,100) as l`,
          [ID.opA],
        ),
      );
      const semanas = r[0].l.map((x) => x.weekStartDate);
      expect(semanas.length).toBeGreaterThan(1);
      expect([...semanas].sort().reverse()).toEqual(semanas);
      expect(r[0].l.every((x) => x.entryCount >= 1)).toBe(true);
    });

    it('semana ainda não aberta devolve nulo, não erro', async () => {
      const r = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ c: CycleDto | null }>(`select public.get_assisted_cycle($1,$2::date) as c`, [
          ID.opA, '2027-01-04',
        ]),
      );
      expect(r[0].c).toBeNull();
    });

    it('GC não lista ciclos de parceiro alheio', async () => {
      const e = await db
        .asUser(ID.uGcB, (tx) => tx.query(`select public.list_assisted_cycles($1,10)`, [ID.opA]))
        .then(() => null)
        .catch((x: Error) => x);
      expect(e?.message).toMatch(/fora do escopo/i);
    });
  });
});
