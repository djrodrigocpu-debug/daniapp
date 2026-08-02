/**
 * AAPEx 1.3.5 — FASE 6: auditoria e hardening integral da autorização server-side.
 *
 * A PERGUNTA QUE ESTE ARQUIVO RESPONDE. As Fases 1, 3 e 5 construíram catálogo
 * global/regional, Gestão Assistida, Auditoria Mensal, planos e evidências, cada
 * uma provando a própria regra. Este arquivo pergunta outra coisa: **a superfície
 * inteira resiste a um chamador hostil?** Não "a tela impede", não "a RPC tem um
 * `if`" — mas: o servidor recusa, recusa SEM EFEITO, e recusa sem contar o que o
 * chamador não podia saber.
 *
 * Quatro propriedades são medidas, e nenhuma delas é observável pela interface:
 *
 *   (1) INVENTÁRIO — toda `security definer` com `search_path` fixo, dono
 *       conhecido, `PUBLIC`/`anon` sem EXECUTE, e `authenticated` com o mínimo;
 *   (2) ESCRITA DIRETA — as tabelas RPC-only recusam INSERT/UPDATE/DELETE/
 *       TRUNCATE pelo PostgREST, inclusive DENTRO do próprio escopo;
 *   (3) ZERO EFEITO — toda chamada recusada é comparada contra um retrato do
 *       banco tirado imediatamente antes: nenhuma linha, nenhum `row_version`,
 *       nenhum `updated_at`, nenhum evento de trilha;
 *   (4) NÃO ENUMERAÇÃO — UUID inexistente e UUID existente fora do escopo
 *       respondem a MESMA frase, e a resposta idempotente nunca devolve o objeto
 *       de outro antes de verificar o alcance do ator.
 *
 * Dados 100% SINTÉTICOS (§23). Nenhum ambiente remoto é tocado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

/** Catálogo desta bateria — duas regiões espelhadas, para o ataque cruzado. */
const F6 = {
  themeG: '00000000-0000-0000-0000-0000000f6001',
  themeGV: '00000000-0000-0000-0000-0000000f6002',
  themeR1: '00000000-0000-0000-0000-0000000f6011',
  themeR1V: '00000000-0000-0000-0000-0000000f6012',
  themeR2: '00000000-0000-0000-0000-0000000f6021',
  themeR2V: '00000000-0000-0000-0000-0000000f6022',
  def: '00000000-0000-0000-0000-0000000f6031',
  ver: '00000000-0000-0000-0000-0000000f6032',
  cfg1: '00000000-0000-0000-0000-0000000f6041',
  cfg1V: '00000000-0000-0000-0000-0000000f6042',
  cfg2: '00000000-0000-0000-0000-0000000f6051',
  cfg2V: '00000000-0000-0000-0000-0000000f6052',
  crit1: '00000000-0000-0000-0000-0000000f6061',
  crit1V: '00000000-0000-0000-0000-0000000f6062',
  crit2: '00000000-0000-0000-0000-0000000f6071',
  crit2V: '00000000-0000-0000-0000-0000000f6072',
  /** Indicador SEM critério — serve ao teste negativo 27. */
  defSem: '00000000-0000-0000-0000-0000000f6081',
  verSem: '00000000-0000-0000-0000-0000000f6082',
} as const;

/** UUID que não existe em lugar nenhum — o outro lado da comparação de mensagens. */
const NADA = '00000000-0000-0000-0000-0000dead0001';

/** As 13 tabelas criadas nas Fases 1, 3, 5, 7 e 8. */
const TABELAS_NOVAS = [
  'themes', 'theme_versions',
  'indicator_regional_configs', 'indicator_regional_config_versions',
  'audit_criteria', 'audit_criteria_versions',
  'assisted_cycles', 'assisted_cycle_entries',
  'evaluation_criteria', 'evaluation_criterion_answers',
  'evaluation_criterion_answer_evidence',
  // Fase 7 e Fase 8: a superfície nova entra na MESMA bateria, e não numa
  // paralela — senão "a superfície inteira resiste" deixa de ser verdade.
  'system_settings', 'region_weightings',
] as const;

/** As 25 RPCs públicas criadas nas Fases 1, 3 e 5, com uma chamada sintática válida. */
const RPCS_NOVAS: Array<{ nome: string; chamada: string }> = [
  { nome: 'catalog_create_theme', chamada: `select public.catalog_create_theme('global',null,'X','{}'::jsonb)` },
  { nome: 'catalog_add_theme_version', chamada: `select public.catalog_add_theme_version('${NADA}','{}'::jsonb)` },
  { nome: 'catalog_publish_theme_version', chamada: `select public.catalog_publish_theme_version('${NADA}')` },
  { nome: 'catalog_set_theme_lifecycle', chamada: `select public.catalog_set_theme_lifecycle('${NADA}','active')` },
  { nome: 'catalog_create_indicator', chamada: `select public.catalog_create_indicator('global',null,'X','{}'::jsonb)` },
  { nome: 'catalog_add_indicator_version', chamada: `select public.catalog_add_indicator_version('${NADA}','{}'::jsonb)` },
  { nome: 'catalog_publish_indicator_version', chamada: `select public.catalog_publish_indicator_version('${NADA}')` },
  { nome: 'catalog_set_indicator_lifecycle', chamada: `select public.catalog_set_indicator_lifecycle('${NADA}','active')` },
  { nome: 'catalog_save_regional_config_draft', chamada: `select public.catalog_save_regional_config_draft('${NADA}','${NADA}','{}'::jsonb)` },
  { nome: 'catalog_publish_regional_config_version', chamada: `select public.catalog_publish_regional_config_version('${NADA}')` },
  { nome: 'catalog_create_criterion', chamada: `select public.catalog_create_criterion('${NADA}','X','{}'::jsonb)` },
  { nome: 'catalog_add_criterion_version', chamada: `select public.catalog_add_criterion_version('${NADA}','{}'::jsonb)` },
  { nome: 'catalog_publish_criterion_version', chamada: `select public.catalog_publish_criterion_version('${NADA}')` },
  { nome: 'catalog_set_criterion_lifecycle', chamada: `select public.catalog_set_criterion_lifecycle('${NADA}','active')` },
  { nome: 'open_assisted_cycle', chamada: `select public.open_assisted_cycle('${NADA}',null)` },
  { nome: 'save_assisted_entry', chamada: `select public.save_assisted_entry('${NADA}','{}'::jsonb)` },
  { nome: 'close_assisted_cycle', chamada: `select public.close_assisted_cycle('${NADA}')` },
  { nome: 'get_assisted_cycle', chamada: `select public.get_assisted_cycle('${NADA}',null)` },
  { nome: 'list_assisted_cycles', chamada: `select public.list_assisted_cycles('${NADA}',10)` },
  { nome: 'start_monthly_audit', chamada: `select public.start_monthly_audit('${NADA}','2026-07')` },
  { nome: 'save_criterion_answer', chamada: `select public.save_criterion_answer('${NADA}','{}'::jsonb)` },
  { nome: 'submit_monthly_audit', chamada: `select public.submit_monthly_audit('${NADA}')` },
  { nome: 'get_monthly_audit', chamada: `select public.get_monthly_audit('${NADA}','2026-07')` },
  { nome: 'list_monthly_audits', chamada: `select public.list_monthly_audits('${NADA}',10)` },
  { nome: 'get_monthly_audit_snapshot', chamada: `select public.get_monthly_audit_snapshot('${NADA}')` },
  // Fase 7 (0047)
  { nome: 'get_system_settings', chamada: `select public.get_system_settings()` },
  { nome: 'admin_set_weekly_audit_cutover', chamada: `select public.admin_set_weekly_audit_cutover(null,false)` },
  // Fase 8 (0048)
  { nome: 'catalog_save_region_weighting_draft', chamada: `select public.catalog_save_region_weighting_draft('${NADA}','{}'::jsonb)` },
  { nome: 'catalog_publish_region_weighting', chamada: `select public.catalog_publish_region_weighting('${NADA}')` },
  { nome: 'get_weighting_status', chamada: `select public.get_weighting_status(null)` },
  { nome: 'get_dashboard_aggregates', chamada: `select public.get_dashboard_aggregates('{}'::jsonb)` },
  { nome: 'get_matrix_dataset', chamada: `select public.get_matrix_dataset('{}'::jsonb)` },
];

interface Retrato { [k: string]: number | string | null }

describe('Fase 6 — autorização server-side sobre a superfície inteira (0036–0044)', () => {
  let db: TestDb;
  /** Auditoria mensal de opA (região 1), autorada pelo GC A. */
  let auditA: { id: string; answerId: string; criterionId: string };
  /** Auditoria mensal de opC (região 2), autorada pelo GC C. */
  let auditC: { id: string; answerId: string };
  /** Ciclo semanal de opA e de opC. */
  let cicloA: { id: string; entryId: string };
  let cicloC: { id: string };

  /**
   * Retrato determinístico do banco. Cobre contagem de TODA tabela mutável pelos
   * fluxos novos, mais os campos que uma escrita parcial mexeria sem criar linha:
   * status, `row_version`, `updated_at` e a trilha.
   */
  const retrato = async (): Promise<Retrato> => {
    const r = await db.query<{ j: Retrato }>(`
      select jsonb_build_object(
        'themes',        (select count(*) from public.themes),
        'themeVersions', (select count(*) from public.theme_versions),
        'configs',       (select count(*) from public.indicator_regional_configs),
        'configVersions',(select count(*) from public.indicator_regional_config_versions),
        'criteria',      (select count(*) from public.audit_criteria),
        'criteriaVers',  (select count(*) from public.audit_criteria_versions),
        'indicators',    (select count(*) from public.indicator_definitions),
        'indVersions',   (select count(*) from public.indicator_versions),
        'cycles',        (select count(*) from public.assisted_cycles),
        'entries',       (select count(*) from public.assisted_cycle_entries),
        'evaluations',   (select count(*) from public.evaluations),
        'evalCriteria',  (select count(*) from public.evaluation_criteria),
        'answers',       (select count(*) from public.evaluation_criterion_answers),
        'answerEvid',    (select count(*) from public.evaluation_criterion_answer_evidence),
        'legacyAnswers', (select count(*) from public.evaluation_answers),
        'plans',         (select count(*) from public.action_plans),
        'snapshots',     (select count(*) from public.official_snapshots),
        'validations',   (select count(*) from public.validations),
        'evidences',     (select count(*) from public.evidence_files),
        'reservations',  (select count(*) from public.evidence_upload_reservations),
        'auditLogs',     (select count(*) from public.audit_logs),
        'evalState',     (select coalesce(string_agg(id::text||':'||status||':'||coalesce(score,0)::text
                                  ||':'||coalesce(submitted_at::text,'-')||':'||coalesce(approved_at::text,'-'),
                                  '|' order by id), '')
                            from public.evaluations),
        'answerState',   (select coalesce(string_agg(id::text||':'||status||':'||row_version::text
                                  ||':'||coalesce(justification,'')||':'||updated_at::text,
                                  '|' order by id), '')
                            from public.evaluation_criterion_answers),
        'cycleState',    (select coalesce(string_agg(id::text||':'||status||':'||row_version::text
                                  ||':'||updated_at::text, '|' order by id), '')
                            from public.assisted_cycles),
        'entryState',    (select coalesce(string_agg(id::text||':'||status||':'||coalesce(actual,-1)::text
                                  ||':'||updated_at::text, '|' order by id), '')
                            from public.assisted_cycle_entries),
        'planState',     (select coalesce(string_agg(id::text||':'||status||':'||coalesce(validated_by::text,'-')
                                  ||':'||updated_at::text, '|' order by id), '')
                            from public.action_plans),
        'themeState',    (select coalesce(string_agg(id::text||':'||lifecycle||':'||code, '|' order by id), '')
                            from public.themes),
        'cfgVerState',   (select coalesce(string_agg(id::text||':'||status||':'||include_in_monthly_audit::text
                                  ||':'||target::text, '|' order by id), '')
                            from public.indicator_regional_config_versions),
        'evalCritState', (select coalesce(string_agg(id::text||':'||question||':'||required::text, '|' order by id), '')
                            from public.evaluation_criteria)
      ) as j`);
    return r[0].j;
  };

  /** Executa `fn`, exige recusa, e prova que o banco não mudou uma vírgula. */
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
    const depois = await retrato();
    expect(depois).toEqual(antes);
    return msg;
  };

  /** Mesma ideia, mas para SQL cru sob RLS (escrita direta pelo PostgREST). */
  const recusaSqlSemEfeito = (userId: string, sql: string, params: unknown[] = []) =>
    recusaSemEfeito(() => db.asUser(userId, (tx) => tx.query(sql, params)));

  const rpc = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    db.asUser(userId, (tx) => tx.query<{ r: T }>(sql, params)).then((x) => x[0]?.r);

  /**
   * Escrita direta COM identidade, mas SEM as restrições de `authenticated`:
   * papel `postgres` (ignora grants e RLS) com o claim JWT injetado. É o pior
   * caso possível para um gatilho — quem escreve tem todo privilégio de tabela e
   * mesmo assim é recusado. Sem o claim, `auth.uid()` é nulo e vários gatilhos
   * abrem exceção deliberada para manutenção (0025, 0042).
   */
  const superComJwt = async (userId: string, sql: string, params: unknown[] = []) => {
    await db.exec('begin');
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ role: 'authenticated', sub: userId })]);
      const r = await db.query(sql, params);
      await db.exec('commit');
      return r;
    } catch (e) {
      await db.exec('rollback').catch(() => undefined);
      throw e;
    }
  };

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);

    // --- catálogo: um tema global, um tema regional por região, um indicador
    // global adotado pelas duas regiões, um critério publicado em cada.
    await db.exec(`
      insert into public.themes (id, code, scope_kind, region_id, lifecycle, created_by) values
        ('${F6.themeG}','TEMA-F6-G','global',null,'active','${ID.uAdmin}'),
        ('${F6.themeR1}','TEMA-F6-R1','regional','${ID.region}','active','${ID.uAdmin}'),
        ('${F6.themeR2}','TEMA-F6-R2','regional','${ID2.region2}','active','${ID.uAdmin}');

      insert into public.theme_versions (id, theme_id, version_number, name, sort_order, status, active) values
        ('${F6.themeGV}','${F6.themeG}',1,'Tema global F6',1,'published',true),
        ('${F6.themeR1V}','${F6.themeR1}',1,'Tema da regiao 1',1,'published',true),
        ('${F6.themeR2V}','${F6.themeR2}',1,'Tema da regiao 2',1,'published',true);

      insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind) values
        ('${F6.def}','IND-F6','Indicador auditado F6','active','global'),
        ('${F6.defSem}','IND-F6-SEM','Indicador sem criterio','active','global');
      insert into public.indicator_versions
        (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, name, status) values
        ('${F6.ver}','${F6.def}',1,'%','higher_better',0,0,1,'Indicador auditado F6','published'),
        ('${F6.verSem}','${F6.defSem}',1,'%','higher_better',0,0,1,'Indicador sem criterio','published');

      insert into public.indicator_regional_configs (id, region_id, indicator_definition_id, created_by) values
        ('${F6.cfg1}','${ID.region}','${F6.def}','${ID.uAdmin}'),
        ('${F6.cfg2}','${ID2.region2}','${F6.def}','${ID.uAdmin}');

      insert into public.audit_criteria (id, config_id, code, lifecycle, created_by) values
        ('${F6.crit1}','${F6.cfg1}','CRIT-F6-R1','active','${ID.uAdmin}'),
        ('${F6.crit2}','${F6.cfg2}','CRIT-F6-R2','active','${ID.uAdmin}');
      insert into public.audit_criteria_versions
        (id, criterion_id, version_number, question, description, guidance, sort_order,
         required, evidence_required, allows_na, requires_justification, status, active) values
        ('${F6.crit1V}','${F6.crit1}',1,'A rotina da regiao 1 existe?','','',1,true,false,false,false,'published',true),
        ('${F6.crit2V}','${F6.crit2}',1,'A rotina da regiao 2 existe?','','',1,true,false,false,false,'published',true);

      insert into public.indicator_regional_config_versions
        (id, config_id, version_number, indicator_version_id, theme_version_id, sort_order,
         target, tolerance, weight, active, include_in_assisted_management, include_in_monthly_audit, status) values
        ('${F6.cfg1V}','${F6.cfg1}',1,'${F6.ver}','${F6.themeR1V}',1,80,5,1,true,true,true,'published'),
        ('${F6.cfg2V}','${F6.cfg2}',1,'${F6.ver}','${F6.themeR2V}',1,90,5,1,true,true,true,'published');
    `);

    // --- Gestão Assistida: um ciclo em cada região, pelo GC responsável.
    const cA = await rpc<{ id: string; entries: Array<{ id: string }> }>(
      ID.uGcA, `select public.open_assisted_cycle($1,$2) as r`, [ID.opA, '2026-07-06']);
    cicloA = { id: cA.id, entryId: cA.entries[0].id };
    const cC = await rpc<{ id: string }>(
      ID2.uGcC, `select public.open_assisted_cycle($1,$2) as r`, [ID2.opC, '2026-07-06']);
    cicloC = { id: cC.id };

    // --- Auditoria Mensal: uma em cada região, pelo GC responsável.
    type Aud = { id: string; criteria: Array<{ id: string; answer: { id: string } }> };
    const aA = await rpc<Aud>(ID.uGcA, `select public.start_monthly_audit($1,$2) as r`, [ID.opA, '2026-07']);
    auditA = { id: aA.id, answerId: aA.criteria[0].answer.id, criterionId: aA.criteria[0].id };
    const aC = await rpc<Aud>(ID2.uGcC, `select public.start_monthly_audit($1,$2) as r`, [ID2.opC, '2026-07']);
    auditC = { id: aC.id, answerId: aC.criteria[0].answer.id };
  });

  afterAll(async () => db.close());

  // =========================================================================
  // A · INVENTÁRIO — as propriedades de segurança de cada função
  // =========================================================================
  describe('A · inventário das funções', () => {
    it('TODA função `security definer` de public/app tem search_path fixo', async () => {
      const r = await db.query<{ n: string }>(`
        select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as n
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','app') and p.prosecdef
           and (p.proconfig is null
                or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))`);
      expect(r.map((x) => x.n)).toEqual([]);
    });

    it('as `security definer` das Fases 1/3/5 usam exatamente `search_path=public, app`', async () => {
      const r = await db.query<{ n: string; cfg: string }>(`
        select p.proname as n, array_to_string(p.proconfig,',') as cfg
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.prosecdef
           and p.proname ~ '^(catalog_|reaches_region|can_manage_catalog|guard_|assisted_|is_assisted|monthly_|criterion_dto|theme_dto|regional_config_dto|open_assisted|save_assisted|close_assisted|get_assisted|list_assisted|start_monthly|save_criterion|submit_monthly|get_monthly|list_monthly)'`);
      expect(r.length).toBeGreaterThan(30);
      for (const f of r) expect(f.cfg).toBe('search_path=public, app');
    });

    it('todas têm o MESMO dono, e é o dono do schema — nenhuma função órfã', async () => {
      const r = await db.query<{ owner: string; n: number }>(`
        select pg_get_userbyid(p.proowner) as owner, count(*)::int as n
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','app') and p.prosecdef
         group by 1`);
      expect(r).toHaveLength(1);
      expect(r[0].owner).toBe('postgres');
    });

    it('nenhuma RPC nova concede EXECUTE a PUBLIC ou a anon', async () => {
      for (const { nome } of RPCS_NOVAS) {
        const r = await db.query<{ pub: boolean; anon: boolean }>(`
          select has_function_privilege('public', p.oid, 'EXECUTE') as pub,
                 has_function_privilege('anon',   p.oid, 'EXECUTE') as anon
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname = $1`, [nome]);
        expect(r.length).toBeGreaterThan(0);
        for (const x of r) {
          expect(`${nome}/PUBLIC=${x.pub}`).toBe(`${nome}/PUBLIC=false`);
          expect(`${nome}/anon=${x.anon}`).toBe(`${nome}/anon=false`);
        }
      }
    });

    it('todas as RPCs novas são executáveis por authenticated — grant mínimo, não ausente', async () => {
      for (const { nome } of RPCS_NOVAS) {
        const r = await db.query<{ ok: boolean }>(`
          select has_function_privilege('authenticated', p.oid, 'EXECUTE') as ok
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname=$1`, [nome]);
        expect(`${nome}=${r[0].ok}`).toBe(`${nome}=true`);
      }
    });

    it('os DTOs internos de `app` não são executáveis por ninguém além do dono', async () => {
      const dtos = ['theme_dto', 'catalog_indicator_dto', 'regional_config_dto', 'criterion_dto',
        'assisted_cycle_dto', 'assisted_entry_dto', 'monthly_audit_dto', 'monthly_criterion_dto'];
      for (const d of dtos) {
        const r = await db.query<{ a: boolean; b: boolean; c: boolean }>(`
          select has_function_privilege('authenticated', p.oid,'EXECUTE') a,
                 has_function_privilege('anon', p.oid,'EXECUTE') b,
                 has_function_privilege('public', p.oid,'EXECUTE') c
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='app' and p.proname=$1`, [d]);
        expect(`${d}=${r[0].a}${r[0].b}${r[0].c}`).toBe(`${d}=falsefalsefalse`);
      }
    });

    it('os wrappers `app.*_legacy` existem e são inalcançáveis pelo cliente', async () => {
      const r = await db.query<{ n: string; a: boolean; b: boolean; c: boolean }>(`
        select p.proname n,
               has_function_privilege('authenticated', p.oid,'EXECUTE') a,
               has_function_privilege('anon', p.oid,'EXECUTE') b,
               has_function_privilege('public', p.oid,'EXECUTE') c
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='app' and p.proname like '%\\_legacy'
         order by 1`);
      // Cinco: os dois da 0044, mais `remove_evidence` e
      // `reserve_evidence_upload` (0046, para fechar o O-18) e
      // `start_evaluation` (0047, para a guarda de cutover). Em todos, o corpo
      // legado foi MOVIDO por `pg_get_functiondef`, nunca copiado.
      expect(r.map((x) => x.n)).toEqual([
        'official_audit_report_legacy',
        'remove_evidence_legacy',
        'reserve_evidence_upload_legacy',
        'start_evaluation_legacy',
        'submit_evaluation_legacy',
      ]);
      for (const x of r) expect(`${x.n}=${x.a}${x.b}${x.c}`).toBe(`${x.n}=falsefalsefalse`);
    });

    it('nenhuma RPC nova monta SQL dinâmico — não há EXECUTE de string no corpo', async () => {
      const r = await db.query<{ n: string }>(`
        select p.proname as n
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname in ('public','app')
           and p.proname ~ '^(catalog_|open_assisted|save_assisted|close_assisted|get_assisted|list_assisted|start_monthly|save_criterion|submit_monthly|get_monthly|list_monthly|guard_|assisted_|monthly_audit_score|is_assisted_operator|reaches_region|can_manage_catalog)'
           and p.prosrc ~* '(^|[^_[:alnum:]])execute[[:space:]]+'`);
      expect(r.map((x) => x.n)).toEqual([]);
    });
  });

  // =========================================================================
  // B · VIEWS — nenhuma contorna a RLS silenciosamente
  // =========================================================================
  describe('B · views', () => {
    it('as Fases 1/3/5 NÃO criaram view alguma — a superfície de view é a de 1.3.4', async () => {
      const r = await db.query<{ n: string }>(`
        select c.relname n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
         where ns.nspname='public' and c.relkind in ('v','m') order by 1`);
      expect(r.map((x) => x.n)).toEqual([
        'ui_action_plans', 'ui_admin_partners', 'ui_evaluation_people', 'ui_evaluations',
        'ui_evidences', 'ui_indicators', 'ui_operation_people', 'ui_operations', 'ui_users',
      ]);
    });

    it('nenhuma materialized view existe — não há caminho de leitura pré-computada', async () => {
      const r = await db.query(`select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname in ('public','app') and c.relkind='m'`);
      expect(r).toHaveLength(0);
    });

    it('toda view SEM `security_invoker` repete a checagem de escopo no próprio corpo', async () => {
      const r = await db.query<{ n: string; def: string }>(`
        select c.relname n, pg_get_viewdef(c.oid) def
          from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
         where ns.nspname='public' and c.relkind='v'
           and not coalesce(array_to_string(c.reloptions,',') like '%security_invoker=true%', false)`);
      // Só duas, e ambas são de 0026, deliberadas e documentadas.
      expect(r.map((x) => x.n).sort()).toEqual(['ui_evaluation_people', 'ui_operation_people']);
      for (const v of r) expect(v.def).toMatch(/has_operation_access/);
    });

    it('a view sem invoker não vaza linha de outra operação — medido, não presumido', async () => {
      const doGcB = await db.asUser(ID.uGcB, (tx) =>
        tx.query(`select * from public.ui_operation_people where "operationId"=$1`, [ID.opA]));
      expect(doGcB).toHaveLength(0);
      const doGcA = await db.asUser(ID.uGcA, (tx) =>
        tx.query(`select * from public.ui_operation_people where "operationId"=$1`, [ID.opA]));
      expect(doGcA).toHaveLength(1);
    });

    it('as views não estão ao alcance de anon quando revogadas — e as demais dependem de RLS', async () => {
      for (const v of ['ui_operation_people', 'ui_evaluation_people']) {
        const r = await db.query<{ ok: boolean }>(
          `select has_table_privilege('anon', $1, 'SELECT') as ok`, [`public.${v}`]);
        expect(`${v}=${r[0].ok}`).toBe(`${v}=false`);
      }
    });
  });

  // =========================================================================
  // C · RLS, GRANTS E DML DIRETO — as tabelas novas são RPC-only
  // =========================================================================
  describe('C · RLS e escrita direta', () => {
    it('as 11 tabelas novas têm RLS habilitada E forçada', async () => {
      for (const t of TABELAS_NOVAS) {
        const r = await db.query<{ a: boolean; b: boolean }>(`
          select c.relrowsecurity a, c.relforcerowsecurity b
            from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname=$1`, [t]);
        expect(`${t}=${r[0].a}/${r[0].b}`).toBe(`${t}=true/true`);
      }
    });

    it('as 11 tabelas novas só têm policy de SELECT — não existe policy de escrita', async () => {
      const r = await db.query<{ t: string; cmd: string }>(`
        select tablename t, cmd from pg_policies
         where schemaname='public' and tablename = any($1) and cmd <> 'SELECT'`,
      [TABELAS_NOVAS as unknown as string[]]);
      expect(r).toEqual([]);
    });

    it('anon não tem grant algum nas 11 tabelas novas', async () => {
      for (const t of TABELAS_NOVAS) {
        const r = await db.query<{ p: string[] }>(`
          select coalesce(array_agg(privilege_type order by privilege_type),'{}') p
            from information_schema.role_table_grants
           where table_schema='public' and table_name=$1 and grantee='anon'`, [t]);
        expect(`${t}=${JSON.stringify(r[0].p)}`).toBe(`${t}=[]`);
      }
    });

    it('PUBLIC não tem grant algum nas 11 tabelas novas', async () => {
      for (const t of TABELAS_NOVAS) {
        const r = await db.query<{ p: string[] }>(`
          select coalesce(array_agg(privilege_type order by privilege_type),'{}') p
            from information_schema.role_table_grants
           where table_schema='public' and table_name=$1 and grantee='PUBLIC'`, [t]);
        expect(`${t}=${JSON.stringify(r[0].p)}`).toBe(`${t}=[]`);
      }
    });

    it('authenticated tem SELECT e NADA MAIS nas 11 tabelas novas', async () => {
      const fora: string[] = [];
      for (const t of TABELAS_NOVAS) {
        const r = await db.query<{ p: string[] }>(`
          select coalesce(array_agg(privilege_type order by privilege_type),'{}') p
            from information_schema.role_table_grants
           where table_schema='public' and table_name=$1 and grantee='authenticated'`, [t]);
        if (JSON.stringify(r[0].p) !== '["SELECT"]') fora.push(`${t}=${JSON.stringify(r[0].p)}`);
      }
      expect(fora).toEqual([]);
    });

    it('authenticated NÃO pode criar gatilho nas tabelas novas', async () => {
      const podem: string[] = [];
      for (const t of TABELAS_NOVAS) {
        const r = await db.query<{ ok: boolean }>(
          `select has_table_privilege('authenticated', $1, 'TRIGGER') as ok`, [`public.${t}`]);
        if (r[0].ok) podem.push(t);
      }
      expect(podem).toEqual([]);
    });

    it('INSERT/UPDATE/DELETE/TRUNCATE diretos são recusados em toda tabela nova — inclusive no próprio escopo', async () => {
      // O ator é o GC A, que ALCANÇA opA: a recusa não vem de escopo, vem de a
      // escrita direta simplesmente não existir.
      await recusaSqlSemEfeito(ID.uGcA,
        `insert into public.themes (code, scope_kind, lifecycle) values ('TEMA-INVASOR','global','active')`);
      await recusaSqlSemEfeito(ID.uGcA, `update public.themes set lifecycle='inactive' where id=$1`, [F6.themeR1]);
      await recusaSqlSemEfeito(ID.uGcA, `delete from public.themes where id=$1`, [F6.themeR1]);
      await recusaSqlSemEfeito(ID.uGcA, `truncate public.themes cascade`);

      await recusaSqlSemEfeito(ID.uGcA,
        `update public.assisted_cycle_entries set actual=999 where id=$1`, [cicloA.entryId]);
      await recusaSqlSemEfeito(ID.uGcA,
        `update public.assisted_cycles set status='closed' where id=$1`, [cicloA.id]);
      await recusaSqlSemEfeito(ID.uGcA, `delete from public.assisted_cycle_entries where id=$1`, [cicloA.entryId]);

      await recusaSqlSemEfeito(ID.uGcA,
        `update public.evaluation_criterion_answers set status='conforme' where id=$1`, [auditA.answerId]);
      await recusaSqlSemEfeito(ID.uGcA,
        `insert into public.evaluation_criterion_answers (evaluation_id, evaluation_criterion_id)
           values ($1,$2)`, [auditA.id, auditA.criterionId]);
      await recusaSqlSemEfeito(ID.uGcA, `delete from public.evaluation_criteria where evaluation_id=$1`, [auditA.id]);
      await recusaSqlSemEfeito(ID.uGcA, `truncate public.evaluation_criterion_answers cascade`);
    });

    it('nem o ADMIN escreve direto: a autoridade administrativa não abre a porta do PostgREST', async () => {
      await recusaSqlSemEfeito(ID.uAdmin,
        `insert into public.themes (code, scope_kind, lifecycle) values ('TEMA-ADMIN-DIRETO','global','active')`);
      await recusaSqlSemEfeito(ID.uAdmin,
        `update public.indicator_regional_config_versions set target=1 where id=$1`, [F6.cfg1V]);
    });
  });

  // =========================================================================
  // D · MATRIZ NEGATIVA 19–36 (Matriz de Permissões §8)
  // =========================================================================
  describe('D · testes negativos 19–36', () => {
    it('19 · GC cria tema → sem permissão', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.catalog_create_theme($1,$2,$3,$4::jsonb) as r`,
          ['regional', ID.region, 'TEMA-GC', JSON.stringify({ name: 'Do GC' })]));
      expect(m).toBe('sem permissao para administrar o catalogo desta regiao');
    });

    it('20 · GC edita a meta de um indicador → sem permissão', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.catalog_save_regional_config_draft($1,$2,$3::jsonb) as r`,
          [ID.region, F6.def, JSON.stringify({
            indicatorVersionId: F6.ver, themeVersionId: F6.themeR1V, target: 10,
          })]));
      expect(m).toBe('sem permissao para administrar o catalogo desta regiao');
    });

    it('21 · GC marca include_in_monthly_audit → sem permissão', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.catalog_save_regional_config_draft($1,$2,$3::jsonb) as r`,
          [ID.region, F6.def, JSON.stringify({
            indicatorVersionId: F6.ver, themeVersionId: F6.themeR1V, includeInMonthlyAudit: true,
          })]));
      expect(m).toBe('sem permissao para administrar o catalogo desta regiao');
    });

    it('22 · Coordenador cria indicador → sem permissão', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uCoord1, `select public.catalog_create_indicator($1,$2,$3,$4::jsonb) as r`,
          ['regional', ID.region, 'IND-COORD', JSON.stringify({ name: 'Do coordenador', unit: '%', direction: 'higher_better' })]));
      expect(m).toBe('sem permissao para administrar o catalogo desta regiao');
    });

    it('23 · Regional edita tema de OUTRA região → fora do escopo, com a mesma frase do inexistente', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID2.uReg2, `select public.catalog_add_theme_version($1,$2::jsonb) as r`,
          [F6.themeR1, JSON.stringify({ name: 'Renomeado por invasor' })]));
      expect(m).toBe('tema inexistente ou fora do escopo');

      const mInexistente = await recusaSemEfeito(() =>
        rpc(ID2.uReg2, `select public.catalog_add_theme_version($1,$2::jsonb) as r`,
          [NADA, JSON.stringify({ name: 'x' })]));
      expect(mInexistente).toBe(m);
    });

    it('23b · Regional NÃO administra catálogo global, mesmo dentro da própria região', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uReg, `select public.catalog_add_theme_version($1,$2::jsonb) as r`,
          [F6.themeG, JSON.stringify({ name: 'Global reescrito pelo regional' })]));
      expect(m).toBe('tema inexistente ou fora do escopo');
    });

    it('23c · Regional edita tema da PRÓPRIA região com sucesso — a recusa não é indiscriminada', async () => {
      const r = await rpc<{ versions: unknown[] }>(ID.uReg,
        `select public.catalog_add_theme_version($1,$2::jsonb) as r`,
        [F6.themeR1, JSON.stringify({ name: 'Tema da regiao 1 v2' })]);
      expect(r.versions.length).toBe(2);
    });

    it('24 · Regional configura indicador de OUTRA região → sem permissão', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID2.uReg2, `select public.catalog_save_regional_config_draft($1,$2,$3::jsonb) as r`,
          [ID.region, F6.def, JSON.stringify({
            indicatorVersionId: F6.ver, themeVersionId: F6.themeR1V, target: 1,
          })]));
      expect(m).toBe('sem permissao para administrar o catalogo desta regiao');
    });

    it('25 · excluir tema com histórico → recusado por gatilho, mesmo como superusuário', async () => {
      const e = await db.query(`select 1`).then(async () => {
        try { await db.exec(`delete from public.themes where id='${F6.themeR1}'`); return null; }
        catch (err) { return err as Error; }
      });
      expect(e?.message).toMatch(/em uso por configuracao regional: inative em vez de excluir|ja publicado: inative em vez de excluir/);
    });

    it('26 · excluir indicador com histórico → recusado por gatilho', async () => {
      const e = await (async () => {
        try { await db.exec(`delete from public.indicator_definitions where id='${F6.def}'`); return null; }
        catch (err) { return err as Error; }
      })();
      expect(e?.message).toBe('indicador IND-F6 configurado por alguma regiao: inative em vez de excluir');
    });

    it('27 · publicar indicador auditável SEM critério ativo → recusado', async () => {
      const draft = await rpc<{ versions: Array<{ id: string; status: string }> }>(
        ID.uAdmin, `select public.catalog_save_regional_config_draft($1,$2,$3::jsonb) as r`,
        [ID.region, F6.defSem, JSON.stringify({
          indicatorVersionId: F6.verSem, themeVersionId: F6.themeR1V,
          includeInMonthlyAudit: true, target: 50,
        })]);
      const versao = draft.versions.find((v) => v.status === 'draft');
      const m = await recusaSemEfeito(() =>
        rpc(ID.uAdmin, `select public.catalog_publish_regional_config_version($1) as r`, [versao!.id]));
      expect(m).toBe('auditoria mensal exige ao menos um criterio publicado e ativo para este indicador na regiao');
    });

    it('28 · segundo ciclo semanal na mesma semana → recusa da CONSTRAINT do banco', async () => {
      const e = await (async () => {
        try {
          await db.exec(`insert into public.assisted_cycles (operation_id, week_start_date, author_user_id)
                         values ('${ID.opA}','2026-07-06','${ID.uGcA}')`);
          return null;
        } catch (err) { return err as Error; }
      })();
      expect(e?.message).toMatch(/assisted_cycles_week_uk/);
    });

    it('29 · fechar ciclo com desvio sem diagnóstico/plano → recusado, nomeando o indicador', async () => {
      await rpc(ID.uGcA, `select public.save_assisted_entry($1,$2::jsonb) as r`, [
        cicloA.entryId, JSON.stringify({ actual: 10, sourcePeriod: '2026-07', sourceConsultedAt: '2026-07-06' }),
      ]);
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.close_assisted_cycle($1) as r`, [cicloA.id]));
      expect(m).toContain('IND-F6');
      expect(m).toMatch(/diagnostico|plano/);
    });

    it('30 · GC abre ciclo em parceiro de OUTRO GC → fora do escopo', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.open_assisted_cycle($1,$2) as r`, [ID.opA, '2026-07-13']));
      expect(m).toBe('operacao fora do escopo');
    });

    it('31 · quem criou o plano não o valida — recusa por REGRA DE ATOR, com o plano em `done`', async () => {
      const plano = await rpc<{ id: string }>(ID.uCoord1, `select public.save_action_plan($1::jsonb) as r`, [
        JSON.stringify({
          operationId: ID.opA, action: 'Plano criado pelo coordenador', problem: 'p',
          owner: 'Responsavel', dueDate: '2099-12-31', priority: 'high',
        }),
      ]);
      await rpc(ID.uCoord1, `select public.update_action_status($1,$2) as r`, [plano.id, 'in_progress']);
      await rpc(ID.uCoord1, `select public.update_action_status($1,$2) as r`, [plano.id, 'completed']);
      const emDone = await db.query<{ s: string }>(
        `select status s from public.action_plans where id=$1`, [plano.id]);
      expect(emDone[0].s).toBe('done');
      const permitida = await db.query<{ ok: boolean }>(
        `select app.action_transition_allowed('done','validated') as ok`);
      expect(permitida[0].ok).toBe(true);

      const m = await recusaSemEfeito(() =>
        db.asUser(ID.uCoord1, (tx) =>
          tx.query(`update public.action_plans set status='validated', validated_by=auth.uid(), validated_at=now() where id=$1`,
            [plano.id])));
      expect(m).toBe('quem criou o plano nao pode valida-lo');

      // E o GC, que nem papel de validação tem, é barrado antes disso.
      const mGc = await recusaSemEfeito(() =>
        db.asUser(ID.uGcA, (tx) =>
          tx.query(`update public.action_plans set status='validated', validated_by=auth.uid(), validated_at=now() where id=$1`,
            [plano.id])));
      expect(mGc).toBe('apenas coordenacao, regional ou administracao registram validado');
    });

    it('32 · alterar critério materializado de auditoria criada → recusado', async () => {
      const m = await recusaSqlSemEfeito(ID.uGcA,
        `update public.evaluation_criteria set question='pergunta trocada' where evaluation_id=$1`, [auditA.id]);
      expect(m).toMatch(/permission denied|nao aceita alteracao/);
      // E como superusuário, o gatilho de congelamento continua sendo a autoridade
      // — a auditoria em rascunho aceita, a enviada não. Provado em (E).
    });

    it('33 · anon em CADA RPC nova → recusado antes de qualquer efeito', async () => {
      for (const { nome, chamada } of RPCS_NOVAS) {
        const e = await db.asAnon((tx) => tx.expectError(chamada));
        expect(`${nome}: ${e.message}`).toMatch(/permission denied for function/);
      }
    });

    it('34 · anon em CADA tabela nova → sem privilégio, nunca conjunto de linhas', async () => {
      for (const t of TABELAS_NOVAS) {
        const e = await db.asAnon((tx) => tx.expectError(`select * from public.${t}`));
        expect(`${t}: ${e.message}`).toMatch(/permission denied for table/);
      }
    });

    it('35 · listagem fora do escopo devolve só o permitido — nunca erro que revele o resto', async () => {
      // A RPC de exportação (`export_dataset`) é da Fase 9 e NÃO existe: o que se
      // mede aqui é a superfície de leitura em escopo que já existe.
      const listaGcA = await rpc<unknown[]>(ID.uGcA, `select public.list_monthly_audits($1,50) as r`, [ID.opA]);
      expect(listaGcA).toHaveLength(1);

      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.list_monthly_audits($1,50) as r`, [ID2.opC]));
      expect(m).toBe('operacao fora do escopo');

      // Leitura direta sob RLS: o GC A vê as próprias linhas e ZERO das outras —
      // conjunto vazio, não erro.
      const criterios = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ n: number }>(`select count(*)::int n from public.evaluation_criteria where evaluation_id=$1`,
          [auditC.id]));
      expect(criterios[0].n).toBe(0);
      const ciclosAlheios = await db.asUser(ID.uGcA, (tx) =>
        tx.query<{ n: number }>(`select count(*)::int n from public.assisted_cycles where id=$1`, [cicloC.id]));
      expect(ciclosAlheios[0].n).toBe(0);

      // O ADMIN alcança tudo — a restrição é de escopo, não de existência.
      const doAdmin = await db.asUser(ID.uAdmin, (tx) =>
        tx.query<{ n: number }>(`select count(*)::int n from public.assisted_cycles`));
      expect(doAdmin[0].n).toBe(2);
    });

    it('36 · gravar `overdue` manualmente → recusado, pela RPC e pela escrita direta', async () => {
      const plano = await rpc<{ id: string }>(ID.uGcA, `select public.save_action_plan($1::jsonb) as r`, [
        JSON.stringify({
          operationId: ID.opA, action: 'Plano para o teste 36', problem: 'p',
          owner: 'Responsavel', dueDate: '2099-12-31', priority: 'medium',
        }),
      ]);
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.update_action_status($1,$2) as r`, [plano.id, 'overdue']));
      expect(m).toBe('vencido e derivado da data, nao e escolha manual');

      const mDireto = await recusaSqlSemEfeito(ID.uGcA,
        `update public.action_plans set status='overdue' where id=$1`, [plano.id]);
      expect(mDireto).toBe('vencido e derivado da data, nao e escolha manual');
    });
  });

  // =========================================================================
  // E · ISOLAMENTO ENTRE O MODELO LEGADO E O MENSAL
  // =========================================================================
  describe('E · isolamento legado × mensal', () => {
    it('a RPC legada de envio recusa a auditoria mensal', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.submit_evaluation($1) as r`, [auditA.id]));
      expect(m).toBe('esta auditoria segue o modelo por criterios: use submit_monthly_audit');
    });

    it('a RPC mensal de envio recusa a avaliação legada', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.submit_monthly_audit($1) as r`, [ID.evalA]));
      expect(m).toBe('esta auditoria segue o modelo antigo: use submit_evaluation');
    });

    it('a leitura de snapshot mensal recusa a avaliação legada', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.get_monthly_audit_snapshot($1) as r`, [ID.evalA]));
      expect(m).toBe('esta auditoria segue o modelo antigo: use get_official_audit_report_data');
    });

    it('o relatório oficial legado recusa a auditoria mensal citando A-05', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.get_official_audit_report_data($1) as r`, [auditA.id]));
      expect(m).toContain('pendencia A-05');
      expect(m).toContain('get_monthly_audit_snapshot');
    });

    it('avaliação legada NÃO pode existir sem template; mensal NÃO pode carregá-lo', async () => {
      const semTpl = await (async () => {
        try {
          await db.exec(`insert into public.evaluations (operation_id, template_version_id, author_user_id, status, score, evaluation_model)
                         values ('${ID.opA}', null, '${ID.uGcA}', 'draft', 0, 'legacy_template')`);
          return null;
        } catch (e) { return e as Error; }
      })();
      expect(semTpl?.message).toMatch(/evaluations_model_template_ck|check constraint/i);

      const comTpl = await (async () => {
        try {
          await db.exec(`insert into public.evaluations (operation_id, template_version_id, author_user_id, status, score, evaluation_model, frequency, period_start, period_end)
                         values ('${ID.opA}', '${ID.templateV1}', '${ID.uGcA}', 'draft', 0, 'monthly_criteria', 'monthly', '2020-01-01','2020-01-31')`);
          return null;
        } catch (e) { return e as Error; }
      })();
      expect(comTpl?.message).toMatch(/evaluations_model_template_ck|check constraint/i);
    });

    it('resposta de critério não existe em auditoria do modelo legado', async () => {
      const e = await (async () => {
        try {
          await db.exec(`insert into public.evaluation_criterion_answers (evaluation_id, evaluation_criterion_id)
                         values ('${ID.evalA}','${auditA.criterionId}')`);
          return null;
        } catch (err) { return err as Error; }
      })();
      expect(e?.message).toBe('resposta nao pertence a auditoria do criterio');
    });

    it('resposta de critério repontada para OUTRA auditoria mensal é recusada', async () => {
      const m = await recusaSemEfeito(async () => {
        await db.exec(`update public.evaluation_criterion_answers
                          set evaluation_id='${auditC.id}' where id='${auditA.answerId}'`);
      });
      expect(m).toBe('resposta nao pertence a auditoria do criterio');
    });

    it('plano `monthly_audit` sem resposta de critério é recusado pelo CHECK', async () => {
      const e = await (async () => {
        try {
          await db.exec(`insert into public.action_plans
              (operation_id, source, description, action_text, problem, owner_name, due_date, priority, created_by)
            values ('${ID.opA}','monthly_audit','x','x','y','r','2099-01-01','high','${ID.uGcA}')`);
          return null;
        } catch (err) { return err as Error; }
      })();
      expect(e?.message).toMatch(/action_plans_source_ck|check constraint/i);
    });

    it('plano da Gestão Assistida NÃO satisfaz o portão da auditoria legada', async () => {
      const r = await db.query<{ n: number }>(`
        select count(*)::int n from public.action_plans
         where source='assisted' and (evaluation_id is not null or item_id is not null)`);
      expect(r[0].n).toBe(0);
    });

    it('a aprovação não muda o modelo da avaliação, e o snapshot herda o modelo certo', async () => {
      // Preenche e envia a auditoria de opC (região 2), depois aprova pelo coordenador 3.
      await rpc(ID2.uGcC, `select public.save_criterion_answer($1,$2::jsonb) as r`,
        [auditC.answerId, JSON.stringify({ status: 'conforme' })]);
      await rpc(ID2.uGcC, `select public.submit_monthly_audit($1) as r`, [auditC.id]);
      await rpc(ID2.uCoord3, `select public.validate_evaluation($1,$2,$3) as r`, [auditC.id, 'approved', 'ok']);

      const r = await db.query<{ m: string; sm: string; tpl: string | null }>(`
        select e.evaluation_model m, s.evaluation_model sm, s.template_version_id::text tpl
          from public.evaluations e join public.official_snapshots s on s.evaluation_id=e.id
         where e.id=$1`, [auditC.id]);
      expect(r[0].m).toBe('monthly_criteria');
      expect(r[0].sm).toBe('monthly_criteria');
      expect(r[0].tpl).toBeNull();
    });

    it('auditoria aprovada não aceita alteração — nem com todo privilégio de tabela', async () => {
      const m = await recusaSemEfeito(() => superComJwt(ID2.uGcC,
        `update public.evaluation_criterion_answers set observation='depois' where id=$1`, [auditC.answerId]));
      expect(m).toBe('auditoria aprovada nao aceita alteracao');

      const m2 = await recusaSemEfeito(() => superComJwt(ID2.uGcC,
        `update public.evaluation_criteria set question='trocada' where evaluation_id=$1`, [auditC.id]));
      expect(m2).toBe('auditoria aprovada nao aceita alteracao');

      // E pelo caminho oficial, a recusa é a de estado, não a de gatilho.
      const m3 = await recusaSemEfeito(() =>
        rpc(ID2.uGcC, `select public.save_criterion_answer($1,$2::jsonb) as r`,
          [auditC.answerId, JSON.stringify({ status: 'nao_conforme' })]));
      expect(m3).toBe('respostas so podem mudar em rascunho/devolvida');
    });
  });

  // =========================================================================
  // F · ISOLAMENTO REGIONAL E HIERÁRQUICO — os quatro papéis
  // =========================================================================
  describe('F · isolamento regional e hierárquico', () => {
    it('ADMIN, REGIONAL e COORDENADOR consultam a Gestão Assistida mas NÃO a executam', async () => {
      for (const [papel, uid] of [['admin', ID.uAdmin], ['regional', ID.uReg], ['coordenador', ID.uCoord1]] as const) {
        const m = await recusaSemEfeito(() =>
          rpc(uid, `select public.open_assisted_cycle($1,$2) as r`, [ID.opA, '2026-08-03']));
        expect(`${papel}: ${m}`).toBe(`${papel}: apenas o gerente de canal responsavel executa a Gestao Assistida`);
      }
    });

    it('ADMIN, REGIONAL e COORDENADOR não iniciam a Auditoria Mensal', async () => {
      for (const [papel, uid] of [['admin', ID.uAdmin], ['regional', ID.uReg], ['coordenador', ID.uCoord1]] as const) {
        const m = await recusaSemEfeito(() =>
          rpc(uid, `select public.start_monthly_audit($1,$2) as r`, [ID.opA, '2026-09']));
        expect(`${papel}: ${m}`).toBe(`${papel}: apenas o gerente de canal responsavel executa a Auditoria Mensal`);
      }
    });

    it('GC de outra coordenadoria não alcança a auditoria alheia — e a frase não distingue do inexistente', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.save_criterion_answer($1,$2::jsonb) as r`,
          [auditA.answerId, JSON.stringify({ status: 'conforme' })]));
      expect(m).toBe('resposta inexistente ou fora do escopo');

      const mNada = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.save_criterion_answer($1,$2::jsonb) as r`,
          [NADA, JSON.stringify({ status: 'conforme' })]));
      expect(mNada).toBe(m);
    });

    it('quem apenas ALCANÇA a operação não responde: só o autor', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uCoord1, `select public.save_criterion_answer($1,$2::jsonb) as r`,
          [auditA.answerId, JSON.stringify({ status: 'conforme' })]));
      expect(m).toBe('apenas o autor da auditoria responde aos criterios');
    });

    it('coordenador de OUTRA coordenadoria não valida a avaliação alheia', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uCoord2, `select public.validate_evaluation($1,$2,$3) as r`, [ID.evalA, 'approved', 'x']));
      expect(m).toBe('avaliacao inexistente ou fora do escopo');
    });

    it('regional de OUTRA região não valida, não consulta e não lista', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID2.uReg2, `select public.validate_evaluation($1,$2,$3) as r`, [ID.evalA, 'approved', 'x']));
      expect(m).toBe('avaliacao inexistente ou fora do escopo');

      const m2 = await recusaSemEfeito(() =>
        rpc(ID2.uReg2, `select public.list_assisted_cycles($1,10) as r`, [ID.opA]));
      expect(m2).toBe('operacao fora do escopo');

      const m3 = await recusaSemEfeito(() =>
        rpc(ID2.uReg2, `select public.get_monthly_audit($1,$2) as r`, [ID.opA, '2026-07']));
      expect(m3).toBe('operacao fora do escopo');
    });

    it('usuário SEM escopo nenhum não alcança nada, e a recusa é a mesma dos demais', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uNoScope, `select public.get_monthly_audit($1,$2) as r`, [ID.opA, '2026-07']));
      expect(m).toBe('operacao fora do escopo');

      const linhas = await db.asUser(ID.uNoScope, (tx) =>
        tx.query<{ n: number }>(`select
            (select count(*) from public.assisted_cycles)
          + (select count(*) from public.evaluation_criteria)
          + (select count(*) from public.evaluation_criterion_answers) as n`));
      expect(Number(linhas[0].n)).toBe(0);
    });

    it('tema regional de outra região não é sequer LISTÁVEL', async () => {
      const r1 = await db.asUser(ID.uReg, (tx) =>
        tx.query<{ code: string }>(`select code from public.themes order by code`));
      expect(r1.map((x) => x.code)).toContain('TEMA-F6-R1');
      expect(r1.map((x) => x.code)).not.toContain('TEMA-F6-R2');

      const r2 = await db.asUser(ID2.uReg2, (tx) =>
        tx.query<{ code: string }>(`select code from public.themes order by code`));
      expect(r2.map((x) => x.code)).toContain('TEMA-F6-R2');
      expect(r2.map((x) => x.code)).not.toContain('TEMA-F6-R1');

      // O tema GLOBAL é visto pelos dois: é catálogo comum.
      expect(r1.map((x) => x.code)).toContain('TEMA-F6-G');
      expect(r2.map((x) => x.code)).toContain('TEMA-F6-G');
    });

    it('critério de outra região não é listável nem pelo regional nem pelo coordenador', async () => {
      const r = await db.asUser(ID2.uReg2, (tx) =>
        tx.query<{ code: string }>(`select code from public.audit_criteria order by code`));
      expect(r.map((x) => x.code)).toEqual(['CRIT-F6-R2']);

      const c = await db.asUser(ID.uCoord1, (tx) =>
        tx.query<{ code: string }>(`select code from public.audit_criteria order by code`));
      expect(c.map((x) => x.code)).toEqual(['CRIT-F6-R1']);
    });

    it('IDs individualmente válidos, misturados entre operações, são recusados', async () => {
      // Plano de opA apontando para a resposta da auditoria de opC.
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.save_action_plan($1::jsonb) as r`, [JSON.stringify({
          operationId: ID.opA, evaluationId: auditC.id, monthlyCriterionAnswerId: auditC.answerId,
          action: 'Plano cruzado', problem: 'p', owner: 'r', dueDate: '2099-12-31', priority: 'high',
        })]));
      expect(m.length).toBeGreaterThan(0);
    });

    it('evidência de outra auditoria não pode ser vinculada a esta resposta', async () => {
      const ev = await db.query<{ id: string }>(`select id from public.evidence_files limit 1`);
      if (ev.length > 0) {
        const m = await recusaSemEfeito(async () => {
          await db.exec(`insert into public.evaluation_criterion_answer_evidence (answer_id, evidence_id)
                         values ('${auditA.answerId}','${ev[0].id}')`);
        });
        expect(m).toMatch(/evidencia de outra auditoria|resposta ou evidencia inexistente/);
      }
    });
  });

  // =========================================================================
  // G · IDEMPOTÊNCIA E NÃO ENUMERAÇÃO
  // =========================================================================
  describe('G · idempotência e não enumeração', () => {
    it('`open_assisted_cycle` idempotente devolve o MESMO ciclo, e só para quem alcança', async () => {
      const a = await rpc<{ id: string }>(ID.uGcA, `select public.open_assisted_cycle($1,$2) as r`,
        [ID.opA, '2026-07-06']);
      expect(a.id).toBe(cicloA.id);

      // O GC B não recebe o ID do ciclo de A por chamar a mesma idempotência.
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.open_assisted_cycle($1,$2) as r`, [ID.opA, '2026-07-06']));
      expect(m).toBe('operacao fora do escopo');
    });

    it('a trilha registra a abertura UMA vez, mesmo com chamada repetida', async () => {
      const r = await db.query<{ n: number }>(`
        select count(*)::int n from public.audit_logs
         where event='assisted_cycle_opened' and object_id=$1`, [cicloA.id]);
      expect(r[0].n).toBe(1);
    });

    it('`start_monthly_audit` idempotente não devolve auditoria de outro escopo', async () => {
      const a = await rpc<{ id: string }>(ID.uGcA, `select public.start_monthly_audit($1,$2) as r`,
        [ID.opA, '2026-07']);
      expect(a.id).toBe(auditA.id);

      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.start_monthly_audit($1,$2) as r`, [ID.opA, '2026-07']));
      expect(m).toBe('operacao fora do escopo');
    });

    it('UUID inexistente e UUID fora do escopo dão a MESMA frase nas RPCs de objeto', async () => {
      const casos: Array<[string, string, string, unknown[]]> = [
        ['save_assisted_entry', ID.uGcB, `select public.save_assisted_entry($1,'{}'::jsonb) as r`, [cicloA.entryId]],
        ['save_criterion_answer', ID.uGcB, `select public.save_criterion_answer($1,'{}'::jsonb) as r`, [auditA.answerId]],
        ['catalog_add_theme_version', ID2.uReg2, `select public.catalog_add_theme_version($1,'{"name":"x"}'::jsonb) as r`, [F6.themeR1]],
        ['catalog_set_criterion_lifecycle', ID2.uReg2, `select public.catalog_set_criterion_lifecycle($1,'inactive') as r`, [F6.crit1]],
      ];
      for (const [nome, uid, sql, params] of casos) {
        const foraDoEscopo = await recusaSemEfeito(() => rpc(uid, sql, params));
        const inexistente = await recusaSemEfeito(() => rpc(uid, sql, [NADA]));
        expect(`${nome}: ${foraDoEscopo}`).toBe(`${nome}: ${inexistente}`);
      }
    });

    it('a fronteira de MODELO não pode preceder a de escopo — senão vira oráculo de existência', async () => {
      // Um usuário que NÃO alcança opA pede o relatório da auditoria mensal de opA.
      // A resposta tem de ser indistinguível da de um UUID que não existe; se
      // diferir, o chamador aprendeu (a) que o objeto existe e (b) qual é o
      // modelo dele — sobre um objeto inteiramente fora do seu alcance.
      const foraDoEscopo = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.get_official_audit_report_data($1) as r`, [auditA.id]));
      const inexistente = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.get_official_audit_report_data($1) as r`, [NADA]));
      expect(`report/foraDoEscopo: ${foraDoEscopo}`).toBe(`report/foraDoEscopo: ${inexistente}`);

      // `submit_evaluation` é wrapper de uma função de 0006/0025/0027 que já
      // distinguia "inexistente" de "sem permissao" — achado O-18, HERDADO e
      // não corrigido aqui (corrigi-lo exigiria reescrever o corpo legado, que a
      // técnica de wrapper existe justamente para não tocar). O que a 0045 tinha
      // de garantir, e garante, é que o WRAPPER não acrescenta informação: a
      // auditoria MENSAL alheia e a avaliação LEGADA alheia recebem a MESMA
      // frase, e portanto o modelo deixa de ser observável de fora do escopo.
      const mensalAlheia = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [auditA.id]));
      const legadaAlheia = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [ID.evalA]));
      expect(`submit/mensal: ${mensalAlheia}`).toBe(`submit/mensal: ${legadaAlheia}`);
      expect(mensalAlheia).not.toContain('criterios');
    });

    it('O-18 · a distinção herdada entre inexistente e sem permissão está FECHADA (0046)', async () => {
      // Este caso nasceu na Fase 6 registrando o defeito: as RPCs de
      // 0006/0025/0027/0028 respondiam `avaliacao inexistente` a um UUID que não
      // existe e `sem permissao` a um que existe fora do alcance. A migration
      // 0046 uniformizou as três, e o caso passa a medir o contrato novo.
      // A bateria dedicada é `src/db/legacy_error_uniformity.integration.test.ts`.
      const inexistente = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [NADA]));
      const foraDoEscopo = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [ID.evalA]));
      expect(inexistente).toBe('avaliacao inexistente ou fora do escopo');
      expect(foraDoEscopo).toBe(inexistente);
    });

    it('a fronteira de modelo continua valendo para quem ALCANÇA o objeto', async () => {
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.get_official_audit_report_data($1) as r`, [auditA.id]));
      expect(m).toContain('pendencia A-05');
    });
  });

  // =========================================================================
  // H · FALSIFICAÇÃO DE CAMPOS — o cliente não controla nada autoritativo
  // =========================================================================
  describe('H · falsificação de campos', () => {
    it('nenhuma RPC nova aceita ator, papel, score ou status como PARÂMETRO', async () => {
      // `p_region_id` existe nas RPCs de catálogo e é legítimo: é a região DO
      // OBJETO administrado, e `app.can_manage_catalog` a confronta com o escopo
      // do ator. O que não pode existir é o ator declarar quem é.
      const r = await db.query<{ n: string; args: string }>(`
        select p.proname n, pg_get_function_identity_arguments(p.oid) args
          from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='public'
           and p.proname ~ '^(catalog_|open_assisted|save_assisted|close_assisted|get_assisted|list_assisted|start_monthly|save_criterion|submit_monthly|get_monthly|list_monthly|get_system_settings|admin_set_weekly_audit_cutover|get_weighting_status|get_dashboard_aggregates|get_matrix_dataset)'`);
      expect(r.length).toBe(RPCS_NOVAS.length);
      for (const f of r) {
        expect(`${f.n}(${f.args})`).not.toMatch(/p_(actor|actor_id|user_id|uid|role|score|status|created_by|validated_by|approved_by)\b/);
      }
    });

    it('`p_region_id` é a região do OBJETO, e é confrontada com o escopo do ator', async () => {
      // O regional 2 pede um tema regional dizendo que a região é a 1: recusado.
      const m = await recusaSemEfeito(() =>
        rpc(ID2.uReg2, `select public.catalog_create_theme($1,$2,$3,$4::jsonb) as r`,
          ['regional', ID.region, 'TEMA-F6-FORJADO', JSON.stringify({ name: 'Regiao alheia' })]));
      expect(m).toBe('sem permissao para administrar o catalogo desta regiao');
    });

    it('`status` do item semanal é do SERVIDOR: `conforme` forjado é sobrescrito pelo gatilho', async () => {
      await db.exec(`update public.assisted_cycle_entries set status='conforme' where id='${cicloA.entryId}'`);
      const r = await db.query<{ s: string }>(
        `select status s from public.assisted_cycle_entries where id=$1`, [cicloA.entryId]);
      expect(r[0].s).toBe('nao_conforme');
    });

    it('`score` da auditoria mensal é recalculado no envio — o cliente não o envia', async () => {
      await db.exec(`update public.evaluations set score=99 where id='${auditA.id}'`);
      await rpc(ID.uGcA, `select public.save_criterion_answer($1,$2::jsonb) as r`,
        [auditA.answerId, JSON.stringify({ status: 'conforme' })]);
      const r = await db.query<{ s: string }>(`select score::text s from public.evaluations where id=$1`, [auditA.id]);
      expect(Number(r[0].s)).toBe(100);
    });

    it('`created_by` e `validated_by` do plano são derivados do ator, não do payload', async () => {
      const plano = await rpc<{ id: string }>(ID.uGcA, `select public.save_action_plan($1::jsonb) as r`, [
        JSON.stringify({
          operationId: ID.opA, action: 'Autoria forjada', problem: 'p', owner: 'r',
          dueDate: '2099-12-31', priority: 'low', createdBy: ID.uAdmin, validatedBy: ID.uAdmin,
          validatedAt: '2020-01-01', rowVersion: 99,
        }),
      ]);
      const r = await db.query<{ c: string; v: string | null; s: string }>(
        `select created_by::text c, validated_by::text v, status s from public.action_plans where id=$1`,
        [plano.id]);
      expect(r[0].c).toBe(ID.uGcA);
      expect(r[0].v).toBeNull();
      expect(r[0].s).toBe('open');
    });

    it('plano não pode NASCER `validated` nem `overdue`, mesmo que o payload peça', async () => {
      for (const s of ['validated', 'overdue']) {
        const m = await recusaSemEfeito(() =>
          rpc(ID.uGcA, `select public.save_action_plan($1::jsonb) as r`, [
            JSON.stringify({
              operationId: ID.opA, action: `Nascer ${s}`, problem: 'p', owner: 'r',
              dueDate: '2099-12-31', priority: 'low', status: s,
            }),
          ]));
        expect(m).toMatch(/plano novo nao pode nascer/);
      }
    });

    it('`rule_version` do item é do servidor e não vem do cliente', async () => {
      const r = await db.query<{ rv: string; esperado: string }>(`
        select e.rule_version rv, app.assisted_rule_version() esperado
          from public.assisted_cycle_entries e where e.id=$1`, [cicloA.entryId]);
      expect(r[0].rv).toBe(r[0].esperado);
    });

    it('`region_id` de tema global é forçado a nulo, mesmo se o cliente mandar região', async () => {
      const t = await rpc<{ id: string; regionId: string | null; scopeKind: string }>(
        ID.uAdmin, `select public.catalog_create_theme($1,$2,$3,$4::jsonb) as r`,
        ['global', ID.region, 'TEMA-F6-HIBRIDO', JSON.stringify({ name: 'Tentativa de hibrido' })]);
      expect(t.scopeKind).toBe('global');
      expect(t.regionId).toBeNull();
    });

    it('`evaluation_id` da resposta é verificado por gatilho contra o critério', async () => {
      const m = await recusaSemEfeito(async () => {
        await db.exec(`insert into public.evaluation_criterion_answers (evaluation_id, evaluation_criterion_id)
                       values ('${auditC.id}','${auditA.criterionId}')`);
      });
      expect(m).toBe('resposta nao pertence a auditoria do criterio');
    });

    it('`approved_by`/`validated_by` da avaliação não são aceitos do cliente na validação', async () => {
      const r = await db.query<{ n: string }>(`
        select pg_get_function_identity_arguments(p.oid) n
          from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='public' and p.proname='validate_evaluation'`);
      expect(r[0].n).toBe('p_evaluation_id uuid, p_decision text, p_note text');
    });
  });

  // =========================================================================
  // I · ZERO EFEITO NAS RECUSAS — o retrato completo, uma vez mais
  // =========================================================================
  describe('I · zero efeitos laterais', () => {
    it('uma bateria de recusas seguidas deixa o banco byte a byte igual', async () => {
      const antes = await retrato();

      const tentativas: Array<() => Promise<unknown>> = [
        () => rpc(ID.uGcA, `select public.catalog_create_theme('global',null,'X-1','{"name":"x"}'::jsonb) as r`),
        () => rpc(ID.uCoord1, `select public.catalog_create_indicator('global',null,'X-2','{"name":"x","unit":"%","direction":"higher_better"}'::jsonb) as r`),
        () => rpc(ID2.uReg2, `select public.catalog_set_theme_lifecycle($1,'inactive') as r`, [F6.themeR1]),
        () => rpc(ID.uGcB, `select public.open_assisted_cycle($1,null) as r`, [ID.opA]),
        () => rpc(ID.uGcB, `select public.close_assisted_cycle($1) as r`, [cicloA.id]),
        () => rpc(ID.uGcB, `select public.start_monthly_audit($1,'2026-10') as r`, [ID.opA]),
        () => rpc(ID.uGcB, `select public.save_criterion_answer($1,'{"status":"conforme"}'::jsonb) as r`, [auditA.answerId]),
        () => rpc(ID.uGcB, `select public.submit_monthly_audit($1) as r`, [auditA.id]),
        () => rpc(ID.uGcA, `select public.submit_monthly_audit($1) as r`, [auditC.id]),
        () => rpc(ID.uGcA, `select public.validate_evaluation($1,'approved','x') as r`, [auditA.id]),
        () => rpc(ID.uNoScope, `select public.list_monthly_audits($1,10) as r`, [ID.opA]),
        () => rpc(ID.uGcA, `select public.get_monthly_audit_snapshot($1) as r`, [auditA.id]),
      ];
      for (const t of tentativas) {
        try { await t(); throw new Error('ESPERAVA RECUSA'); }
        catch (e) { if ((e as Error).message === 'ESPERAVA RECUSA') throw e; }
      }

      const depois = await retrato();
      expect(depois).toEqual(antes);
    });

    it('a trilha não registra evento de SUCESSO para nenhuma tentativa recusada', async () => {
      const r = await db.query<{ e: string; n: number }>(`
        select event e, count(*)::int n from public.audit_logs group by 1 order by 1`);
      const eventos = Object.fromEntries(r.map((x) => [x.e, x.n]));
      // Duas auditorias mensais iniciadas, dois ciclos abertos — e nada além disso
      // vindo das dezenas de chamadas recusadas.
      expect(eventos['monthly_audit_started']).toBe(2);
      expect(eventos['assisted_cycle_opened']).toBe(2);
      expect(eventos['monthly_audit_submitted']).toBe(1);
      expect(Object.keys(eventos)).not.toContain('assisted_cycle_closed');
    });

    it('nenhuma recusa deixou reserva de evidência órfã', async () => {
      const r = await db.query<{ n: number }>(`select count(*)::int n from public.evidence_upload_reservations`);
      expect(r[0].n).toBe(0);
    });
  });
});
