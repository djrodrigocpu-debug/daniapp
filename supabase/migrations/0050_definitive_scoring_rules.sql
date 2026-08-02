-- ===========================================================================
-- AAPEx 1.3.5 — 0050: as regras empresariais DEFINITIVAS
-- ===========================================================================
-- Decisões A-10, A-11 e A-06, confirmadas pelo proprietário em 02/08/2026 e
-- registradas em `docs/architecture/ADR-135-004-PONTUACOES-RESUMO-E-RELATORIO-MENSAL.md`
-- ANTES desta migration.
--
-- ---------------------------------------------------------------------------
-- 1. A-10 — o que NÃO muda, e por quê
-- ---------------------------------------------------------------------------
-- `app.monthly_audit_score` já calculava `conformes / (conformes + nao_conformes)`
-- com `nao_aplicavel` fora dos dois lados. A decisão CONFIRMA essa aritmética, e
-- por isso ela NÃO é reescrita: o escopo proíbe alteração funcional falsa apenas
-- para trocar rótulo.
--
-- O que muda é UMA BORDA REAL: o `coalesce(..., 0)` fazia denominador zero
-- devolver ZERO. Uma auditoria inteiramente `nao_aplicavel` recebia nota zero —
-- e zero é uma afirmação sobre o parceiro que ninguém fez. A decisão diz que
-- ausência de critérios aplicáveis é DADOS INSUFICIENTES, e nunca zero.
--
-- É a quinta camada da lição L-04 ("sem dado nunca é zero"), e era a única que
-- ainda vazava.
--
-- ---------------------------------------------------------------------------
-- 2. A-11 — o que MUDA, e é mudança funcional real
-- ---------------------------------------------------------------------------
--   conforme = 100 · atencao = 50 · nao_conforme = 0 · sem_dado = insuficiência
--   nota = SOMA(pontos x peso_materializado) / SOMA(pesos_materializados)
--
-- Três diferenças contra a regra provisória da 0048, todas materiais:
--   (a) `atencao` valia 0 e passa a valer 50. A Fase 8 registrou a razão de ter
--       escolhido zero: "não há decisão que a torne meia conformidade". Agora HÁ;
--   (b) não havia peso e passa a haver — o MATERIALIZADO em
--       `assisted_cycle_entries.weight`, copiado no ato do registro (0039);
--   (c) `sem_dado` era descartado e passa a tornar o eixo INSUFICIENTE.
--       Descartar premiava quem não mediu, que é o mesmo defeito que a proibição
--       de renormalizar evita entre módulos.
--
-- NUNCA o peso vivo do catálogo. Ler `indicator_regional_config_versions.weight`
-- ao recalcular histórico seria reescrever o passado — é a armadilha nº 1 do
-- programa, na direção inversa.
--
-- NENHUMA OPCIONALIDADE NOVA. O modelo assistido não tem semântica de indicador
-- opcional (varredura por `required`/`optional` em 0039: zero ocorrências), e a
-- decisão prevê exatamente esse caso: todo item materializado é obrigatório.
--
-- ---------------------------------------------------------------------------
-- 3. O que esta migration NÃO faz
-- ---------------------------------------------------------------------------
--   - NÃO toca `app.official_audit_report_legacy` nem nenhuma `app.*_legacy`;
--   - NÃO semeia peso: `region_weightings` continua VAZIA (A-04 aberta);
--   - NÃO ativa o cutover: `weekly_audit_cutover_date` continua JSON null;
--   - NÃO renormaliza peso por módulo ausente;
--   - NÃO faz `UPDATE`/`DELETE` retroativo em tabela histórica;
--   - NÃO cria tabela, e por isso NÃO precisa entrar no teardown do harness.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 4. `score` deixa de ser `not null`, com um CHECK MAIS FORTE no lugar
-- ---------------------------------------------------------------------------
-- Mesma técnica que a decisão D-M (ADR-135-003) usou para `template_version_id`,
-- e pela mesma razão: o modelo declara qual das duas formas vale.
--
-- Antes, `not null default 0` obrigava toda avaliação a ter nota — inclusive uma
-- auditoria mensal sem nenhum critério aplicável, que passava a "valer zero". O
-- CHECK que entra é mais forte para o caminho legado (continua exigindo nota) e
-- honesto para o modelo novo (permite a ausência que a decisão determina).
--
-- `drop not null` NÃO reescreve linha nenhuma: é alteração de catálogo.
alter table public.evaluations       alter column score drop not null;
alter table public.official_snapshots alter column score drop not null;

do $$ begin
  alter table public.evaluations add constraint evaluations_score_by_model_ck check (
    evaluation_model <> 'legacy_template' or score is not null
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.official_snapshots add constraint official_snapshots_score_by_model_ck check (
    evaluation_model <> 'legacy_template' or score is not null
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 5. A-10 DEFINITIVA — a mesma matemática, sem o zero fabricado
-- ---------------------------------------------------------------------------
create or replace function app.monthly_audit_score(p_eval uuid) returns numeric
  language sql stable set search_path = public, app as $$
  select round(
      count(*) filter (where a.status = 'conforme')::numeric
      / nullif(count(*) filter (where a.status in ('conforme', 'nao_conforme')), 0) * 100
    , 2)
  from public.evaluation_criterion_answers a
  where a.evaluation_id = p_eval
$$;

revoke all on function app.monthly_audit_score(uuid) from public, anon;
grant execute on function app.monthly_audit_score(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. As duas proveniências DEFINITIVAS
-- ---------------------------------------------------------------------------
-- Os identificadores não podem continuar dizendo "pendente": as regras deixaram
-- de ser provisórias. O histórico de que FORAM provisórias fica na documentação,
-- não no contrato de dados.
create or replace function app.performance_score_rule() returns text
  language sql immutable as $$ select 'desempenho-ponderado-status/1.3.5'::text $$;

create or replace function app.process_score_rule() returns text
  language sql immutable as $$ select 'conformidade-simples-processo/1.3.5'::text $$;

revoke all on function app.performance_score_rule() from public, anon, authenticated;
revoke all on function app.process_score_rule()     from public, anon, authenticated;

create or replace function app.dashboard_rule_provenance() returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'assistedStatusRule',     app.assisted_rule_version(),
    'performanceScoreRule',   app.performance_score_rule(),
    'performanceProvisional', false,
    'monthlyScoreRule',       app.process_score_rule(),
    'monthlyProvisional',     false,
    'weightingRule',          'ponderacao-regional-publicada/1.3.5',
    'quadrantRule',           '1.3.4-quadrants-1',
    'trafficLightRule',       'app.score_traffic_light/0004',
    -- A-10 e A-11 saíram. A-04 fica: decidir COMO ponderar não é decidir COM
    -- QUANTO, e sem peso publicado continua não havendo índice.
    'openDecisions',          jsonb_build_array('A-04')
  )
$$;

revoke all on function app.dashboard_rule_provenance() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. A fonte filtrada do desempenho passa a carregar o PESO MATERIALIZADO
-- ---------------------------------------------------------------------------
-- `drop` e `create`, e não `create or replace`: mudar o tipo de retorno de uma
-- função que devolve conjunto é recusado pelo PostgreSQL. A coluna nova entra no
-- FIM, e todos os consumidores leem por nome — nenhum é afetado.
drop function if exists app.assisted_entries_in_scope(uuid[], date, date, jsonb);

create function app.assisted_entries_in_scope(
  p_ops uuid[], p_from date, p_to date, p_filters jsonb
) returns table (
  operation_id uuid, week_start_date date, status app.assisted_status,
  indicator_code text, indicator_name text, theme_code text,
  weight numeric
)
  language sql stable security definer set search_path = public, app as $$
  select c.operation_id, c.week_start_date, e.status,
         e.indicator_code, e.indicator_name, e.theme_code,
         e.weight
    from public.assisted_cycle_entries e
    join public.assisted_cycles c on c.id = e.cycle_id
   where c.operation_id = any(p_ops)
     and (p_from is null or c.week_start_date >= p_from)
     and (p_to   is null or c.week_start_date <= p_to)
     and (app.filter_len(p_filters, 'themeIds') = 0
          or e.theme_id::text in (select jsonb_array_elements_text(p_filters->'themeIds')))
     and (app.filter_len(p_filters, 'indicatorIds') = 0
          or e.indicator_definition_id::text in
             (select jsonb_array_elements_text(p_filters->'indicatorIds')))
     and (app.filter_len(p_filters, 'statuses') = 0
          or e.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
     and (app.filter_len(p_filters, 'modules') = 0
          or coalesce(p_filters->'modules' ? 'assisted', false))
$$;

revoke all on function app.assisted_entries_in_scope(uuid[], date, date, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. A-11 DEFINITIVA — o eixo de desempenho, ponderado e com suficiência
-- ---------------------------------------------------------------------------
-- PORTA ÚNICA. Dashboard, Matriz, exportação e Resumo consomem esta função —
-- nenhuma delas recalcula. Fórmula duplicada em duas telas é como duas telas
-- passam a discordar.
create or replace function app.assisted_performance_dto(
  p_ops uuid[], p_from date, p_to date, p_filters jsonb
) returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_conf bigint; v_aten bigint; v_nc bigint; v_sd bigint;
  v_wsum numeric; v_points numeric;
  v_axis text; v_reasons jsonb := '[]'::jsonb; v_score numeric := null;
begin
  select count(*) filter (where e.status = 'conforme'),
         count(*) filter (where e.status = 'atencao'),
         count(*) filter (where e.status = 'nao_conforme'),
         count(*) filter (where e.status = 'sem_dado'),
         coalesce(sum(e.weight) filter
           (where e.status in ('conforme','atencao','nao_conforme')), 0),
         coalesce(sum(e.weight * case e.status
                                   when 'conforme'     then 100
                                   when 'atencao'      then 50
                                   when 'nao_conforme' then 0
                                 end) filter
           (where e.status in ('conforme','atencao','nao_conforme')), 0)
    into v_conf, v_aten, v_nc, v_sd, v_wsum, v_points
    from app.assisted_entries_in_scope(p_ops, p_from, p_to, p_filters) e;

  -- Eixo qualitativo: gravidade máxima vence, como na 1.3.4. NÃO é a nota, e
  -- continua existindo mesmo quando a nota não pode ser calculada.
  v_axis := case
    when v_nc   > 0 then 'critical'
    when v_aten > 0 then 'attention'
    when v_conf > 0 then 'on_target'
    else 'no_measurement' end;

  if (v_conf + v_aten + v_nc + v_sd) = 0 then
    -- Nada no recorte. NÃO é nota zero: é ausência de medição.
    v_reasons := v_reasons || '["missing_measurement"]'::jsonb;
  else
    -- Todo item materializado é obrigatório (não há opcionalidade no modelo).
    if v_sd > 0     then v_reasons := v_reasons || '["incomplete_measurement"]'::jsonb; end if;
    if v_wsum <= 0  then v_reasons := v_reasons || '["weight_sum_not_positive"]'::jsonb; end if;
  end if;

  if jsonb_array_length(v_reasons) = 0 then
    v_score := round(v_points / v_wsum, 2);
  end if;

  return jsonb_build_object(
    'axis',                 v_axis,
    'score',                v_score::double precision,
    'sufficient',           jsonb_array_length(v_reasons) = 0,
    'insufficiencyReasons', v_reasons,
    'conforme',             v_conf,
    'atencao',              v_aten,
    'naoConforme',          v_nc,
    'semDado',              v_sd,
    'weightSum',            v_wsum::double precision,
    'rule',                 app.performance_score_rule()
  );
end $$;

revoke all on function app.assisted_performance_dto(uuid[], date, date, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. A-10 DEFINITIVA — o eixo de processo, com suficiência
-- ---------------------------------------------------------------------------
-- A REGRA TEMPORAL DA 0048 É PRESERVADA LETRA POR LETRA: a auditoria mensal
-- APROVADA mais recente cujo período intersecta o recorte, desempatada por
-- `period_start desc, id desc`. Nada de período novo, nada de seleção nova.
create or replace function app.monthly_process_dto(
  p_op uuid, p_from date, p_to date
) returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_eval uuid; v_score numeric; v_audits bigint;
  v_light app.traffic_light; v_reasons jsonb := '[]'::jsonb;
  v_conf bigint := 0; v_nc bigint := 0; v_na bigint := 0; v_ne bigint := 0;
begin
  select e.id, e.score, count(*) over () into v_eval, v_score, v_audits
    from public.evaluations e
   where e.operation_id = p_op
     and e.evaluation_model = 'monthly_criteria'
     and e.status = 'approved'
     and (p_from is null or e.period_end   >= p_from)
     and (p_to   is null or e.period_start <= p_to)
   order by e.period_start desc, e.id desc
   limit 1;

  if v_eval is null then
    return jsonb_build_object(
      'axis', 'no_audit', 'score', null, 'sufficient', false,
      'insufficiencyReasons', '["missing_audit"]'::jsonb,
      'trafficLight', app.score_traffic_light(null)::text,
      'auditsConsidered', 0,
      'conforme', 0, 'naoConforme', 0, 'naoAplicavel', 0, 'naoAvaliado', 0,
      'rule', app.process_score_rule());
  end if;

  select count(*) filter (where a.status = 'conforme'),
         count(*) filter (where a.status = 'nao_conforme'),
         count(*) filter (where a.status = 'nao_aplicavel'),
         count(*) filter (where a.status = 'nao_avaliado')
    into v_conf, v_nc, v_na, v_ne
    from public.evaluation_criterion_answers a
   where a.evaluation_id = v_eval;

  -- Nota nula com auditoria aprovada só acontece por UM motivo: nenhum critério
  -- aplicável. `nao_aplicavel` está fora do numerador E do denominador.
  if v_score is null then
    v_reasons := '["no_applicable_criteria"]'::jsonb;
  end if;

  v_light := app.score_traffic_light(v_score);

  return jsonb_build_object(
    'axis',                 case when v_score is null then 'no_score' else v_light::text end,
    'score',                v_score::double precision,
    'sufficient',           jsonb_array_length(v_reasons) = 0,
    'insufficiencyReasons', v_reasons,
    'trafficLight',         v_light::text,
    'auditsConsidered',     coalesce(v_audits, 0),
    'conforme',             v_conf,
    'naoConforme',          v_nc,
    'naoAplicavel',         v_na,
    'naoAvaliado',          v_ne,
    'rule',                 app.process_score_rule()
  );
end $$;

revoke all on function app.monthly_process_dto(uuid, date, date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. A entrada da Matriz — os dois eixos, o quadrante e o índice
-- ---------------------------------------------------------------------------
create or replace function app.matrix_entry_dto(
  p_op uuid, p_from date, p_to date, p_filters jsonb
) returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_region uuid; v_name text;
  v_perf jsonb; v_proc jsonb;
  v_quadrant text; v_reasons jsonb := '[]'::jsonb;
  v_w jsonb; v_index jsonb := null;
  v_ps numeric; v_cs numeric;
begin
  select o.partner_name, u.region_id into v_name, v_region
    from public.operations o join public.units u on u.id = o.unit_id where o.id = p_op;

  v_perf := app.assisted_performance_dto(array[p_op]::uuid[], p_from, p_to, p_filters);
  v_proc := app.monthly_process_dto(p_op, p_from, p_to);

  -- Suficiência do conjunto. O processo vem primeiro para que "só falta
  -- auditoria" continue sendo exatamente `["missing_audit"]`, como já era.
  v_reasons := (v_proc->'insufficiencyReasons') || (v_perf->'insufficiencyReasons');

  -- QUADRANTE — a tabela de quatro células da 1.3.4, sem limite novo.
  if jsonb_array_length(v_reasons) > 0 then
    v_quadrant := null;
  else
    v_quadrant := case
      when (v_proc->>'trafficLight') = 'green' and (v_perf->>'axis') = 'on_target' then 'healthy'
      when (v_proc->>'trafficLight') = 'green'                                     then 'ineffective_routine'
      when (v_perf->>'axis') = 'on_target'                                         then 'result_without_process'
      else 'critical' end;
  end if;

  -- ÍNDICE CONSOLIDADO — só com ponderação publicada E OS DOIS EIXOS
  -- SUFICIENTES. Sem renormalização: faltando um módulo, não há índice. Ponto.
  v_w  := app.region_weighting_dto(v_region);
  v_ps := nullif(v_perf->>'score','')::numeric;
  v_cs := nullif(v_proc->>'score','')::numeric;

  if (v_w->>'configured')::boolean
     and (v_perf->>'sufficient')::boolean
     and (v_proc->>'sufficient')::boolean
     and v_ps is not null and v_cs is not null then
    v_index := jsonb_build_object(
      'value', round(v_ps * (v_w->>'assistedWeight')::numeric / 100
                   + v_cs * (v_w->>'auditWeight')::numeric / 100, 2)::double precision,
      'assistedComponent',  v_ps::double precision,
      'auditComponent',     v_cs::double precision,
      'weightingVersionId', v_w->>'id',
      'performanceRule',    app.performance_score_rule(),
      'processRule',        app.process_score_rule());
  end if;

  return jsonb_build_object(
    'operationId', p_op,
    'partnerName', v_name,
    'regionId',    v_region,
    'performance', v_perf,
    'process',     v_proc,
    'quadrant',    v_quadrant,
    'dataSufficiency', jsonb_build_object(
      'sufficient', jsonb_array_length(v_reasons) = 0,
      'reasons',    v_reasons),
    'weighting',     v_w,
    'weightedIndex', v_index
  );
end $$;

revoke all on function app.matrix_entry_dto(uuid, date, date, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. A-06 DEFINITIVA — as linhas do Resumo
-- ---------------------------------------------------------------------------
-- Continua derivando de `app.matrix_entry_dto`, e não de conta própria: se a
-- Matriz mudar, a exportação muda junto, em vez de divergir em silêncio.
create or replace function app.export_rows_summary(
  p_ops uuid[], p_from date, p_to date, p_filters jsonb
) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(x order by x->>'partnerName'), '[]'::jsonb)
    from (
      select (
        with m as (select app.matrix_entry_dto(o.id, p_from, p_to, p_filters) as e)
        select jsonb_build_object(
          'partnerName',           o.partner_name,
          'performanceAxis',       m.e->'performance'->>'axis',
          'performanceScore',      (m.e->'performance'->>'score')::double precision,
          'performanceSufficient', (m.e->'performance'->>'sufficient')::boolean,
          'assistedConforme',      (m.e->'performance'->>'conforme')::int,
          'assistedAtencao',       (m.e->'performance'->>'atencao')::int,
          'assistedNaoConforme',   (m.e->'performance'->>'naoConforme')::int,
          'assistedSemDado',       (m.e->'performance'->>'semDado')::int,
          'processAxis',           m.e->'process'->>'axis',
          'processScore',          (m.e->'process'->>'score')::double precision,
          'processSufficient',     (m.e->'process'->>'sufficient')::boolean,
          'quadrant',              coalesce(m.e->>'quadrant', 'sem_dado_suficiente'),
          'dataSufficient',        (m.e->'dataSufficiency'->>'sufficient')::boolean,
          'weightingConfigured',   (m.e->'weighting'->>'configured')::boolean,
          'assistedWeight',        (m.e->'weighting'->>'assistedWeight')::double precision,
          'auditWeight',           (m.e->'weighting'->>'auditWeight')::double precision,
          'consolidatedIndex',     (m.e->'weightedIndex'->>'value')::double precision,
          'openPlans',             (select count(*) from public.action_plans a
                                     where a.operation_id = o.id
                                       and a.status not in ('validated','done','cancelled_justified'))
        ) from m
      ) as x
        from public.operations o where o.id = any(p_ops)
    ) s
$$;

revoke all on function app.export_rows_summary(uuid[], date, date, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. A-06 DEFINITIVA — o bloco agregado do Resumo
-- ---------------------------------------------------------------------------
-- Os DOZE itens do contrato, e nada além. Sem ranking, sem meta inventada, sem
-- semáforo executivo, sem projeção financeira, sem KPI novo, sem fórmula
-- adicional e sem comparação fora do escopo do ator.
--
-- A proibição de RANKING não é estética: o Resumo é recortado por
-- `app.dashboard_operations`, e posição relativa dentro de um conjunto que o
-- ator não enxerga inteiro REVELA O TAMANHO do conjunto oculto.
create or replace function app.export_summary_block(
  p_ops uuid[], p_from date, p_to date, p_filters jsonb
) returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_perf jsonb; v_rows jsonb; v_w jsonb;
  v_regions uuid[];
begin
  -- Eixo de desempenho do recorte inteiro, pela MESMA função da Matriz.
  v_perf := app.assisted_performance_dto(p_ops, p_from, p_to, p_filters);
  v_rows := app.export_rows_summary(p_ops, p_from, p_to, p_filters);

  select coalesce(array_agg(distinct u.region_id), array[]::uuid[]) into v_regions
    from public.operations o join public.units u on u.id = o.unit_id
   where o.id = any(p_ops);

  -- Ponderação UTILIZADA — uma entrada por região alcançada. Quando as regiões
  -- divergem, o Resumo diz isso em vez de escolher uma.
  v_w := coalesce((
    select jsonb_agg(jsonb_build_object(
             'regionId', r, 'weighting', app.region_weighting_dto(r)) order by r::text)
      from unnest(v_regions) r), '[]'::jsonb);

  return jsonb_build_object(
    'label', 'Resumo',

    -- 1 · período
    'period', jsonb_build_object('from', p_from, 'to', p_to),

    -- 2 · filtros efetivamente aplicados
    'appliedFilters', app.dashboard_filters_dto(p_filters, p_ops),

    -- 3 · parceiros abrangidos
    'partners', coalesce(array_length(p_ops, 1), 0),

    -- 4 · cobertura da Gestão Assistida
    'assistedCoverage', jsonb_build_object(
      'partnersWithData', (select count(distinct c.operation_id) from public.assisted_cycles c
                            where c.operation_id = any(p_ops)
                              and (p_from is null or c.week_start_date >= p_from)
                              and (p_to   is null or c.week_start_date <= p_to)),
      'partners',         coalesce(array_length(p_ops, 1), 0)),

    -- 5 · cobertura da Auditoria Mensal
    'monthlyAuditCoverage', jsonb_build_object(
      'partnersWithData', (select count(distinct e.operation_id) from public.evaluations e
                            where e.operation_id = any(p_ops)
                              and e.evaluation_model = 'monthly_criteria'
                              and (p_from is null or e.period_end   >= p_from)
                              and (p_to   is null or e.period_start <= p_to)),
      'partnersApproved', (select count(distinct e.operation_id) from public.evaluations e
                            where e.operation_id = any(p_ops)
                              and e.evaluation_model = 'monthly_criteria'
                              and e.status = 'approved'
                              and (p_from is null or e.period_end   >= p_from)
                              and (p_to   is null or e.period_start <= p_to)),
      'partners',         coalesce(array_length(p_ops, 1), 0)),

    -- 6 · eixo de desempenho
    'performanceAxis', v_perf,

    -- 7 · eixo de processo — agregado por CONTAGEM de respostas, nunca por média
    --     de notas: média de médias inventaria um número que ninguém calculou.
    'processAxis', (
      select jsonb_build_object(
        'conforme',     count(*) filter (where a.status = 'conforme'),
        'naoConforme',  count(*) filter (where a.status = 'nao_conforme'),
        'naoAplicavel', count(*) filter (where a.status = 'nao_aplicavel'),
        'naoAvaliado',  count(*) filter (where a.status = 'nao_avaliado'),
        'rule',         app.process_score_rule())
        from app.monthly_answers_in_scope(p_ops, p_from, p_to, p_filters) a),

    -- 8 · planos por estado
    'plansByStatus', (
      select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
        select app.action_status_to_ui(p.status) k, count(*) n
          from public.action_plans p
         where p.operation_id = any(p_ops)
           and (p_from is null or p.due_date >= p_from)
           and (p_to   is null or p.due_date <= p_to)
         group by 1) t),

    -- 9 · suficiência dos dados
    'dataSufficiency', jsonb_build_object(
      'partnersSufficient',   (select count(*) from jsonb_array_elements(v_rows) r
                                where (r->>'dataSufficient')::boolean),
      'partnersInsufficient', (select count(*) from jsonb_array_elements(v_rows) r
                                where not (r->>'dataSufficient')::boolean),
      'performanceSufficient', (v_perf->>'sufficient')::boolean),

    -- 10 · ponderação utilizada
    'weighting', v_w,

    -- 11 · índice consolidado — SOMENTE quando permitido, por parceiro
    'consolidatedIndex', jsonb_build_object(
      'partnersWithIndex', (select count(*) from jsonb_array_elements(v_rows) r
                             where r->'consolidatedIndex' <> 'null'::jsonb),
      'partnersWithout',   (select count(*) from jsonb_array_elements(v_rows) r
                             where r->'consolidatedIndex' =  'null'::jsonb),
      'note', 'O indice consolidado so existe com ponderacao publicada e os dois eixos suficientes. Nao ha renormalizacao.'),

    -- 12 · versões das regras utilizadas
    'ruleVersions', app.dashboard_rule_provenance()
  );
end $$;

revoke all on function app.export_summary_block(uuid[], date, date, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13. `export_dataset` vira WRAPPER — e o corpo de 0049 é MOVIDO, não copiado
-- ---------------------------------------------------------------------------
-- O Resumo precisa de colunas novas e de um bloco agregado novo, e os dois são
-- literais DENTRO de `public.export_dataset`. Reescrever a função inteira para
-- trocar dois literais é exatamente o caminho que a 0044 tentou com
-- `submit_evaluation` e que custou, em silêncio, a guarda de estado da 0027.
--
-- Aqui o corpo vigente é MOVIDO por `pg_get_functiondef`, e o wrapper só
-- pós-processa o módulo `summary`. Os outros três módulos passam pelo mesmo
-- objeto de sempre, byte a byte.
--
-- ESTA É A SEXTA CAMADA DE WRAPPER DO PROGRAMA (RT-15), e a regra do O-16 vale
-- aqui como nas cinco anteriores: **este wrapper DELEGA PRIMEIRO**. Ator,
-- módulo, filtros e escopo são resolvidos dentro da função movida, e nada é dito
-- sobre o objeto antes disso. `app.dashboard_operations` só é chamada DEPOIS de
-- a delegação ter passado — quando a autorização já aconteceu.
do $$
declare v_def text;
begin
  if to_regprocedure('app.export_dataset_legacy(text, jsonb)') is null then
    select pg_get_functiondef('public.export_dataset(text, jsonb)'::regprocedure) into v_def;
    if position('public.export_dataset(' in v_def) = 0 then
      raise exception 'nao foi possivel localizar o corpo vigente de public.export_dataset';
    end if;
    v_def := replace(v_def, 'public.export_dataset(', 'app.export_dataset_legacy(');
    execute v_def;
  end if;
end $$;

revoke all on function app.export_dataset_legacy(text, jsonb) from public, anon, authenticated;

create or replace function public.export_dataset(
  p_module text, p_filters jsonb default '{}'::jsonb
) returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_out  jsonb;
  v_f    jsonb := coalesce(p_filters, '{}'::jsonb);
  v_ops  uuid[];
  v_from date;
  v_to   date;
begin
  -- DELEGA PRIMEIRO. Toda a autorização de 0049 acontece aqui dentro.
  v_out := app.export_dataset_legacy(p_module, p_filters);

  if p_module <> 'summary' then
    return v_out;
  end if;

  -- A partir daqui a autorização JÁ passou: recalcular o recorte é seguro.
  v_ops  := app.dashboard_operations(v_f);
  v_from := nullif(v_f->>'periodFrom','')::date;
  v_to   := nullif(v_f->>'periodTo','')::date;

  -- A-06: rótulos sem "provisória" e sem citar pendência fechada.
  v_out := jsonb_set(v_out, '{columns}', '[
      {"key":"partnerName","label":"Parceiro AACE","type":"text"},
      {"key":"performanceAxis","label":"Eixo de desempenho","type":"text"},
      {"key":"performanceScore","label":"Nota de desempenho","type":"number"},
      {"key":"performanceSufficient","label":"Desempenho suficiente","type":"boolean"},
      {"key":"assistedConforme","label":"Conformes","type":"number"},
      {"key":"assistedAtencao","label":"Em atencao","type":"number"},
      {"key":"assistedNaoConforme","label":"Nao conformes","type":"number"},
      {"key":"assistedSemDado","label":"Sem dado","type":"number"},
      {"key":"processAxis","label":"Eixo de processo","type":"text"},
      {"key":"processScore","label":"Nota de processo","type":"number"},
      {"key":"processSufficient","label":"Processo suficiente","type":"boolean"},
      {"key":"quadrant","label":"Quadrante","type":"text"},
      {"key":"dataSufficient","label":"Dados suficientes","type":"boolean"},
      {"key":"weightingConfigured","label":"Ponderacao configurada","type":"boolean"},
      {"key":"assistedWeight","label":"Peso do desempenho","type":"number"},
      {"key":"auditWeight","label":"Peso do processo","type":"number"},
      {"key":"consolidatedIndex","label":"Indice consolidado","type":"number"},
      {"key":"openPlans","label":"Planos em aberto","type":"number"}
    ]'::jsonb);

  return jsonb_set(v_out, '{summary}',
                   app.export_summary_block(v_ops, v_from, v_to, v_f));
end $$;

revoke all on function public.export_dataset(text, jsonb) from public, anon;
grant execute on function public.export_dataset(text, jsonb) to authenticated;

comment on function public.export_dataset(text, jsonb) is
  'Porta unica de exportacao (0049) + Resumo definitivo A-06 (0050). Delega antes de pos-processar.';
