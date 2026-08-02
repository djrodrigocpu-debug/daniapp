-- ===========================================================================
-- 0049 — CONTRATO SERVER-SIDE DE EXPORTAÇÃO (AAPEx 1.3.5, Fase 9)
--
-- D9: quatro módulos — Gestão Assistida · Auditoria Mensal · Planos · Resumo —,
-- em CSV e XLSX, com os oito filtros canônicos. E a frase que governa tudo:
-- *"autorização, escopo e filtros são resolvidos no servidor. O arquivo não pode
-- ser um caminho para contornar a RLS."* (Modelo Operacional §8; RT-08.)
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA PORTA E QUATRO CORPOS
-- ---------------------------------------------------------------------------
-- `export_dataset(module, filters)` é a única porta. Por trás dela há quatro
-- funções internas, uma por módulo. Uma função monolítica com quatro `if`
-- gigantes seria impossível de ler e pior ainda de testar; quatro RPCs públicas
-- seriam quatro superfícies de autorização para manter em sincronia — e é
-- exatamente assim que uma delas fica para trás no primeiro conserto.
--
-- A porta faz ator, módulo, filtros e escopo. Os corpos só montam linhas, sobre
-- o conjunto de operações que a porta já resolveu.
--
-- ---------------------------------------------------------------------------
-- COLUNAS TIPADAS, E POR QUE ISSO É SEGURANÇA E NÃO ESTÉTICA
-- ---------------------------------------------------------------------------
-- Cada dataset declara suas colunas com `type` ∈ {text, number, date, boolean}.
-- Duas consequências diretas:
--
--   * o XLSX escreve número como número, data como data e booleano como
--     booleano (D9), em vez de despejar tudo como texto;
--   * a neutralização de CSV injection se aplica **somente** a `text`. Sem o
--     tipo, prefixar todo campo iniciado por `-` corromperia todo número
--     negativo real — e é justamente isso que D9 proíbe.
--
-- ---------------------------------------------------------------------------
-- O QUE NUNCA SAI DAQUI
-- ---------------------------------------------------------------------------
-- Nenhuma URL assinada, nenhum token, nenhuma credencial, nenhum caminho de
-- objeto no armazenamento, nenhum e-mail e nenhuma coluna interna sem utilidade
-- empresarial. O ator solicitante aparece pelo NOME de exibição, resolvido por
-- `app.user_display_name` — nunca pelo identificador nem pelo e-mail.
--
-- ---------------------------------------------------------------------------
-- O RESUMO É TÉCNICO E PROVISÓRIO — A-06 CONTINUA ABERTA
-- ---------------------------------------------------------------------------
-- D9 nomeia a aba; ninguém definiu o conteúdo (pendência **A-06**). O módulo
-- `summary` entrega o mínimo **derivado dos outros três**, e nada além: período,
-- filtros efetivos, número de parceiros, cobertura dos dois módulos, planos por
-- estado, os dois eixos, suficiência, estado da ponderação, índice quando
-- legalmente calculável, e as versões das regras.
--
-- **Nenhum ranking, nenhuma meta, nenhum semáforo executivo novo, nenhuma
-- coluna financeira, nenhum KPI e nenhuma fórmula adicional.** O conteúdo se
-- identifica como *"Resumo tecnico provisorio"*, e A-06 permanece pendente.
--
-- ADITIVA. Cria seis funções. Não cria tabela, coluna, tipo, gatilho, policy ou
-- índice, e não altera nada existente. Migrations 0001–0048 intactas.
--
-- ROLLBACK: `drop function` das seis.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Módulos conhecidos
-- ---------------------------------------------------------------------------
-- Lista fechada. Módulo desconhecido é recusado POR NOME, e antes de qualquer
-- leitura: a mensagem fala do parâmetro, nunca do banco.
create or replace function app.export_modules() returns text[]
  language sql immutable set search_path = public, app as $$
  select array['assisted', 'monthly_audit', 'plans', 'summary']::text[]
$$;

revoke all on function app.export_modules() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Gestão Assistida — uma linha por item de ciclo
-- ---------------------------------------------------------------------------
create or replace function app.export_rows_assisted(
  p_ops uuid[], p_from date, p_to date, p_filters jsonb
) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(x order by x->>'partnerName', x->>'weekStartDate',
                            x->>'themeCode', x->>'indicatorCode'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'partnerName',       o.partner_name,
        'weekStartDate',     c.week_start_date::text,
        'cycleStatus',       c.status::text,
        'themeCode',         e.theme_code,
        'themeName',         e.theme_name,
        'indicatorCode',     e.indicator_code,
        'indicatorName',     e.indicator_name,
        'unit',              e.unit,
        'target',            e.target::double precision,
        'tolerance',         e.tolerance::double precision,
        'actual',            e.actual::double precision,
        'status',            e.status::text,
        'sourcePeriod',      e.source_period,
        'sourceConsultedAt', e.source_consulted_at::text,
        'diagnosis',         e.diagnosis,
        'observation',       e.observation,
        'hasPlan',           exists (select 1 from public.action_plans a
                                      where a.assisted_entry_id = e.id)
      ) as x
        from public.assisted_cycle_entries e
        join public.assisted_cycles c on c.id = e.cycle_id
        join public.operations o on o.id = c.operation_id
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
    ) s
$$;

-- ---------------------------------------------------------------------------
-- 3. Auditoria Mensal — uma linha por resposta de critério
-- ---------------------------------------------------------------------------
create or replace function app.export_rows_monthly(
  p_ops uuid[], p_from date, p_to date, p_filters jsonb
) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(x order by x->>'partnerName', x->>'competence',
                            x->>'criterionCode'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'partnerName',      o.partner_name,
        'competence',       to_char(ev.period_start, 'YYYY-MM'),
        'auditStatus',      ev.status::text,
        'auditScore',       ev.score::double precision,
        'themeCode',        k.theme_code,
        'indicatorCode',    k.indicator_code,
        'criterionCode',    k.criterion_code,
        'question',         k.question,
        'required',         k.required,
        'evidenceRequired', k.evidence_required,
        'status',           a.status::text,
        'justification',    a.justification,
        'diagnosis',        a.diagnosis,
        'observation',      a.observation,
        'answeredAt',       a.answered_at::date::text,
        'evidenceCount',    (select count(*) from public.evaluation_criterion_answer_evidence l
                              where l.answer_id = a.id)
      ) as x
        from public.evaluation_criterion_answers a
        join public.evaluation_criteria k on k.id = a.evaluation_criterion_id
        join public.evaluations ev on ev.id = a.evaluation_id
        join public.operations o on o.id = ev.operation_id
       where ev.operation_id = any(p_ops)
         and ev.evaluation_model = 'monthly_criteria'
         and (p_from is null or ev.period_end   >= p_from)
         and (p_to   is null or ev.period_start <= p_to)
         and (app.filter_len(p_filters, 'themeIds') = 0
              or k.theme_id::text in (select jsonb_array_elements_text(p_filters->'themeIds')))
         and (app.filter_len(p_filters, 'indicatorIds') = 0
              or k.indicator_definition_id::text in
                 (select jsonb_array_elements_text(p_filters->'indicatorIds')))
         and (app.filter_len(p_filters, 'statuses') = 0
              or a.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
    ) s
$$;

-- ---------------------------------------------------------------------------
-- 4. Planos — uma linha por plano, com `overdue` DERIVADO
-- ---------------------------------------------------------------------------
create or replace function app.export_rows_plans(
  p_ops uuid[], p_from date, p_to date, p_filters jsonb
) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(x order by x->>'partnerName', x->>'dueDate', x->>'action'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'partnerName',  o.partner_name,
        'source',       p.source::text,
        'themeCode',    coalesce(p.theme_code, ''),
        'action',       coalesce(nullif(p.action_text, ''), p.description),
        'problem',      coalesce(p.problem, ''),
        'owner',        coalesce(p.owner_name, ''),
        'dueDate',      p.due_date::text,
        'priority',     p.priority,
        'status',       app.action_status_to_ui(p.status),
        -- DERIVADO da data, como desde a 0025. Nunca lido de coluna gravada.
        'overdue',      (p.status not in ('validated','done','cancelled_justified')
                         and p.due_date < app.assisted_today()),
        'createdAt',    p.created_at::date::text,
        'validatedAt',  p.validated_at::date::text
      ) as x
        from public.action_plans p
        join public.operations o on o.id = p.operation_id
       where p.operation_id = any(p_ops)
         and (p_from is null or p.due_date >= p_from)
         and (p_to   is null or p.due_date <= p_to)
         and (app.filter_len(p_filters, 'statuses') = 0
              or app.action_status_to_ui(p.status) in
                 (select jsonb_array_elements_text(p_filters->'statuses')))
         and (app.filter_len(p_filters, 'modules') = 0
              or coalesce(p_filters->'modules' ? 'plans', false)
              or (coalesce(p_filters->'modules' ? 'assisted', false) and p.source = 'assisted')
              or (coalesce(p_filters->'modules' ? 'monthly_audit', false) and p.source = 'monthly_audit'))
    ) s
$$;

-- ---------------------------------------------------------------------------
-- 5. Resumo técnico PROVISÓRIO — uma linha por parceiro
-- ---------------------------------------------------------------------------
-- Deriva de `app.matrix_entry_dto` (0048), e não de conta própria: se um dia a
-- Matriz mudar, a exportação muda junto — em vez de divergir em silêncio.
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
          'assistedConforme',      (m.e->'performance'->>'conforme')::int,
          'assistedAtencao',       (m.e->'performance'->>'atencao')::int,
          'assistedNaoConforme',   (m.e->'performance'->>'naoConforme')::int,
          'assistedSemDado',       (m.e->'performance'->>'semDado')::int,
          'processAxis',           m.e->'process'->>'axis',
          'processScore',          (m.e->'process'->>'score')::double precision,
          'quadrant',              coalesce(m.e->>'quadrant', 'sem_dado_suficiente'),
          'dataSufficient',        (m.e->'dataSufficiency'->>'sufficient')::boolean,
          'weightingConfigured',   (m.e->'weighting'->>'configured')::boolean,
          'assistedWeight',        (m.e->'weighting'->>'assistedWeight')::double precision,
          'auditWeight',           (m.e->'weighting'->>'auditWeight')::double precision,
          'weightedIndex',         (m.e->'weightedIndex'->>'value')::double precision,
          'weightedIndexProvisional', coalesce((m.e->'weightedIndex'->>'provisional')::boolean, false),
          'openPlans',             (select count(*) from public.action_plans a
                                     where a.operation_id = o.id
                                       and a.status not in ('validated','done','cancelled_justified'))
        ) from m
      ) as x
        from public.operations o where o.id = any(p_ops)
    ) s
$$;

revoke all on function app.export_rows_assisted(uuid[], date, date, jsonb) from public, anon, authenticated;
revoke all on function app.export_rows_monthly(uuid[], date, date, jsonb)  from public, anon, authenticated;
revoke all on function app.export_rows_plans(uuid[], date, date, jsonb)    from public, anon, authenticated;
revoke all on function app.export_rows_summary(uuid[], date, date, jsonb)  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. A porta
-- ---------------------------------------------------------------------------
create or replace function public.export_dataset(
  p_module text, p_filters jsonb default '{}'::jsonb
) returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_uid   uuid;
  v_f     jsonb := coalesce(p_filters, '{}'::jsonb);
  v_ops   uuid[];
  v_from  date;
  v_to    date;
  v_rows  jsonb;
  v_cols  jsonb;
  v_extra jsonb := '{}'::jsonb;
begin
  -- (1) ATOR.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) MÓDULO. Antes de qualquer leitura: a recusa fala do parâmetro.
  if p_module is null or not (p_module = any(app.export_modules())) then
    raise exception 'modulo de exportacao desconhecido: %', coalesce(p_module, '(nulo)')
      using errcode = 'invalid_parameter_value';
  end if;

  -- (3) FILTROS. Chave e tipo, com as mesmas regras do painel — fonte única.
  perform app.validate_dashboard_filters(v_f);

  -- (4) ESCOPO. `app.dashboard_operations` recusa filtro cuja interseção com o
  -- alcance do ator seja VAZIA, com a mesma frase de um UUID inexistente. É o
  -- teste 35 na forma canônica: zero linhas, zero arquivo útil, e nenhuma
  -- confirmação de existência.
  v_ops  := app.dashboard_operations(v_f);
  v_from := nullif(v_f->>'periodFrom','')::date;
  v_to   := nullif(v_f->>'periodTo','')::date;

  -- (5) LINHAS.
  if p_module = 'assisted' then
    v_rows := app.export_rows_assisted(v_ops, v_from, v_to, v_f);
    v_cols := '[
      {"key":"partnerName","label":"Parceiro AACE","type":"text"},
      {"key":"weekStartDate","label":"Semana (segunda-feira)","type":"date"},
      {"key":"cycleStatus","label":"Situacao do ciclo","type":"text"},
      {"key":"themeCode","label":"Tema","type":"text"},
      {"key":"themeName","label":"Nome do tema","type":"text"},
      {"key":"indicatorCode","label":"Indicador","type":"text"},
      {"key":"indicatorName","label":"Nome do indicador","type":"text"},
      {"key":"unit","label":"Unidade","type":"text"},
      {"key":"target","label":"Meta","type":"number"},
      {"key":"tolerance","label":"Tolerancia","type":"number"},
      {"key":"actual","label":"Realizado","type":"number"},
      {"key":"status","label":"Situacao","type":"text"},
      {"key":"sourcePeriod","label":"Periodo da fonte","type":"text"},
      {"key":"sourceConsultedAt","label":"Data da consulta","type":"date"},
      {"key":"diagnosis","label":"Diagnostico","type":"text"},
      {"key":"observation","label":"Observacao","type":"text"},
      {"key":"hasPlan","label":"Tem plano de acao","type":"boolean"}
    ]'::jsonb;

  elsif p_module = 'monthly_audit' then
    v_rows := app.export_rows_monthly(v_ops, v_from, v_to, v_f);
    v_cols := '[
      {"key":"partnerName","label":"Parceiro AACE","type":"text"},
      {"key":"competence","label":"Competencia","type":"text"},
      {"key":"auditStatus","label":"Situacao da auditoria","type":"text"},
      {"key":"auditScore","label":"Pontuacao (provisoria, A-10)","type":"number"},
      {"key":"themeCode","label":"Tema","type":"text"},
      {"key":"indicatorCode","label":"Indicador","type":"text"},
      {"key":"criterionCode","label":"Criterio","type":"text"},
      {"key":"question","label":"Pergunta","type":"text"},
      {"key":"required","label":"Obrigatorio","type":"boolean"},
      {"key":"evidenceRequired","label":"Evidencia obrigatoria","type":"boolean"},
      {"key":"status","label":"Resposta","type":"text"},
      {"key":"justification","label":"Justificativa","type":"text"},
      {"key":"diagnosis","label":"Diagnostico","type":"text"},
      {"key":"observation","label":"Observacao","type":"text"},
      {"key":"answeredAt","label":"Respondido em","type":"date"},
      {"key":"evidenceCount","label":"Evidencias anexadas","type":"number"}
    ]'::jsonb;

  elsif p_module = 'plans' then
    v_rows := app.export_rows_plans(v_ops, v_from, v_to, v_f);
    v_cols := '[
      {"key":"partnerName","label":"Parceiro AACE","type":"text"},
      {"key":"source","label":"Origem","type":"text"},
      {"key":"themeCode","label":"Tema","type":"text"},
      {"key":"action","label":"Acao","type":"text"},
      {"key":"problem","label":"Problema","type":"text"},
      {"key":"owner","label":"Responsavel","type":"text"},
      {"key":"dueDate","label":"Prazo","type":"date"},
      {"key":"priority","label":"Prioridade","type":"text"},
      {"key":"status","label":"Situacao","type":"text"},
      {"key":"overdue","label":"Vencido","type":"boolean"},
      {"key":"createdAt","label":"Criado em","type":"date"},
      {"key":"validatedAt","label":"Validado em","type":"date"}
    ]'::jsonb;

  else
    v_rows := app.export_rows_summary(v_ops, v_from, v_to, v_f);
    v_cols := '[
      {"key":"partnerName","label":"Parceiro AACE","type":"text"},
      {"key":"performanceAxis","label":"Eixo de desempenho","type":"text"},
      {"key":"performanceScore","label":"Nota de desempenho (provisoria, A-11)","type":"number"},
      {"key":"assistedConforme","label":"Conformes","type":"number"},
      {"key":"assistedAtencao","label":"Em atencao","type":"number"},
      {"key":"assistedNaoConforme","label":"Nao conformes","type":"number"},
      {"key":"assistedSemDado","label":"Sem dado","type":"number"},
      {"key":"processAxis","label":"Eixo de processo","type":"text"},
      {"key":"processScore","label":"Nota de processo (provisoria, A-10)","type":"number"},
      {"key":"quadrant","label":"Quadrante","type":"text"},
      {"key":"dataSufficient","label":"Dados suficientes","type":"boolean"},
      {"key":"weightingConfigured","label":"Ponderacao configurada","type":"boolean"},
      {"key":"assistedWeight","label":"Peso do desempenho","type":"number"},
      {"key":"auditWeight","label":"Peso do processo","type":"number"},
      {"key":"weightedIndex","label":"Indice ponderado (provisorio)","type":"number"},
      {"key":"weightedIndexProvisional","label":"Indice provisorio","type":"boolean"},
      {"key":"openPlans","label":"Planos em aberto","type":"number"}
    ]'::jsonb;

    -- O bloco agregado do Resumo. **Técnico e conservador (A-06 aberta).**
    v_extra := jsonb_build_object('summary', jsonb_build_object(
      'label',                  'Resumo tecnico provisorio',
      'a06',                    'A composicao empresarial final da aba Resumo continua pendente (A-06).',
      'partners',               coalesce(array_length(v_ops, 1), 0),
      'partnersWithAssisted',   (select count(distinct c.operation_id) from public.assisted_cycles c
                                  where c.operation_id = any(v_ops)
                                    and (v_from is null or c.week_start_date >= v_from)
                                    and (v_to   is null or c.week_start_date <= v_to)),
      'partnersWithMonthlyAudit', (select count(distinct e.operation_id) from public.evaluations e
                                  where e.operation_id = any(v_ops)
                                    and e.evaluation_model = 'monthly_criteria'
                                    and (v_from is null or e.period_end   >= v_from)
                                    and (v_to   is null or e.period_start <= v_to)),
      'plansByStatus', (
        select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
          select app.action_status_to_ui(p.status) k, count(*) n
            from public.action_plans p
           where p.operation_id = any(v_ops)
             and (v_from is null or p.due_date >= v_from)
             and (v_to   is null or p.due_date <= v_to)
           group by 1) t),
      'plansOverdue', (
        select count(*) from public.action_plans p
         where p.operation_id = any(v_ops)
           and p.status not in ('validated','done','cancelled_justified')
           and p.due_date < app.assisted_today())
    ));
  end if;

  -- (6) RESPOSTA. Metadados de filtro, contrato e proveniência viajam sempre.
  return jsonb_build_object(
    'contractVersion', '1.3.5-export-1',
    'module',          p_module,
    'generatedAt',     now(),
    'today',           app.assisted_today()::text,
    -- Nome de EXIBIÇÃO, nunca identificador nem e-mail.
    'requestedBy',     app.user_display_name(v_uid),
    'scope', jsonb_build_object(
      'operationCount', coalesce(array_length(v_ops, 1), 0)),
    'filters',         app.dashboard_filters_dto(v_f, v_ops),
    'ruleProvenance',  app.dashboard_rule_provenance(),
    'columns',         v_cols,
    'rowCount',        jsonb_array_length(v_rows),
    'rows',            v_rows
  ) || v_extra;
end $$;

revoke all on function public.export_dataset(text, jsonb) from public, anon;
-- Matriz §6 concede exportação aos QUATRO papéis, cada um no próprio escopo —
-- inclusive ao Gerente de Canal, nos seus parceiros. Não é inferência: está na
-- linha "Exportar" da matriz canônica. Quem recorta é `app.dashboard_operations`.
grant execute on function public.export_dataset(text, jsonb) to authenticated;

comment on function public.export_dataset(text, jsonb) is
  'Porta unica de exportacao (0049). Ator, modulo, filtros e escopo no servidor; colunas tipadas.';
