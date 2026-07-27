-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0004: extensão de domínio (Gestão Assistida §7)
-- =============================================================================
-- Acrescenta o que a camada de aplicação (src/data/repositories) consome e que
-- não existia no núcleo 0001–0003:
--   * tabelas `indicator_results` e `visit_reports` (tipos IndicatorResult /
--     VisitReport de src/types) — RLS por escopo de operação, como measurements;
--   * funções auxiliares de tradução entre o enum de banco `app.action_status`
--     e a união de status usada pela UI, e o farol de nota (getScoreStatus §15).
-- RLS/triggers são explicitados aqui porque os loops de 0002/0003 já executaram.
-- Reversível: ver supabase/rollback/0001_core_schema.down.sql (drops adicionados nesta entrega).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Farol de nota — espelha src/utils/format.ts getScoreStatus (§15)
--   >= 80 green ; >= 70 yellow ; caso contrário red.
-- ---------------------------------------------------------------------------
create or replace function app.score_traffic_light(p_score numeric)
  returns app.traffic_light
  language sql immutable as $$
  select case
    when p_score is null then 'not_evaluated'::app.traffic_light
    when p_score >= 80 then 'green'::app.traffic_light
    when p_score >= 70 then 'yellow'::app.traffic_light
    else 'red'::app.traffic_light
  end
$$;

-- ---------------------------------------------------------------------------
-- Tradução do status de plano de ação: enum de banco  <->  união da UI
-- (o banco é a autoridade histórica; a UI usa um vocabulário mais granular).
-- ---------------------------------------------------------------------------
create or replace function app.action_status_to_ui(p_status app.action_status)
  returns text language sql immutable as $$
  select case p_status
    when 'open'                then 'not_started'
    when 'in_progress'         then 'in_progress'
    when 'blocked'             then 'waiting_internal'
    when 'done'                then 'completed'
    when 'overdue'             then 'overdue'
    when 'cancelled_justified' then 'completed'
  end
$$;

create or replace function app.action_status_to_db(p_status text)
  returns app.action_status language sql immutable as $$
  select case p_status
    when 'not_started'      then 'open'::app.action_status
    when 'in_progress'      then 'in_progress'::app.action_status
    when 'waiting_partner'  then 'blocked'::app.action_status
    when 'waiting_internal' then 'blocked'::app.action_status
    when 'completed'        then 'done'::app.action_status
    when 'validated'        then 'done'::app.action_status
    when 'overdue'          then 'overdue'::app.action_status
    else 'open'::app.action_status
  end
$$;

-- ---------------------------------------------------------------------------
-- Colunas nativas do modelo de UI ausentes no núcleo (round-trip fiel das
-- projeções ui_*). São aditivas e idempotentes; o núcleo 0001 permanece intacto.
--   * evaluations: rótulo/período/frequência do ciclo e trilha do validador
--     (a UI trata a "visita/auditoria" como a própria Evaluation — §6);
--   * action_plans: campos do plano no vocabulário da UI (problema, causa raiz,
--     ação, responsável, evidência esperada) — o núcleo guardava só description.
-- ---------------------------------------------------------------------------
alter table public.evaluations
  add column if not exists frequency         app.visit_type,
  add column if not exists cycle_label       text,
  add column if not exists period_start      date,
  add column if not exists period_end        date,
  add column if not exists validator_user_id uuid references public.users(id),
  add column if not exists validator_note    text,
  add column if not exists validated_at      timestamptz;

alter table public.action_plans
  add column if not exists problem           text not null default '',
  add column if not exists root_cause        text not null default '',
  add column if not exists action_text       text not null default '',
  add column if not exists owner_name        text not null default '',
  add column if not exists theme_code        text,
  add column if not exists expected_evidence text not null default '',
  add column if not exists completion_note   text;

-- ---------------------------------------------------------------------------
-- Resultados de indicadores por operação/período (Masterplan §7.5, §8)
-- ---------------------------------------------------------------------------
create table public.indicator_results (
  id               uuid primary key default gen_random_uuid(),
  operation_id     uuid not null references public.operations(id),
  indicator_id     uuid not null references public.indicator_definitions(id),
  period           text not null,                 -- YYYY-MM
  target           numeric(14,4) not null default 0,
  actual           numeric(14,4) not null default 0,
  previous_actual  numeric(14,4) not null default 0,
  diagnosis        text,
  observation      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.users(id),
  unique (operation_id, indicator_id, period)
);
create index indicator_results_operation_idx on public.indicator_results(operation_id);

-- ---------------------------------------------------------------------------
-- Relatórios de visita produtiva / retroalimentação (Masterplan §7.6)
-- ---------------------------------------------------------------------------
create table public.visit_reports (
  id                  uuid primary key default gen_random_uuid(),
  operation_id        uuid not null references public.operations(id),
  objective           text not null default '',
  summary             text not null default '',
  critical_indicators text[] not null default '{}',
  action_plan_ids     uuid[] not null default '{}',
  next_review_date    date,
  created_at          timestamptz not null default now(),
  created_by          uuid not null references public.users(id)
);
create index visit_reports_operation_idx on public.visit_reports(operation_id);

-- ---------------------------------------------------------------------------
-- RLS por escopo de operação (mesma autoridade de measurements/action_plans)
-- ---------------------------------------------------------------------------
alter table public.indicator_results enable row level security;
alter table public.indicator_results force row level security;
alter table public.visit_reports enable row level security;
alter table public.visit_reports force row level security;

create policy indresults_read on public.indicator_results for select to authenticated
  using (app.has_operation_access(operation_id));
create policy indresults_write on public.indicator_results for all to authenticated
  using (app.has_operation_access(operation_id)) with check (app.has_operation_access(operation_id));

create policy visitreports_read on public.visit_reports for select to authenticated
  using (app.has_operation_access(operation_id));
create policy visitreports_write on public.visit_reports for all to authenticated
  using (app.has_operation_access(operation_id)) with check (app.has_operation_access(operation_id));

-- updated_at automático (a função existe desde 0003)
create trigger trg_touch_indicator_results before update on public.indicator_results
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Grants equivalentes ao ambiente Supabase (RLS é o gate real).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.indicator_results to authenticated;
grant select, insert, update, delete on public.visit_reports to authenticated;
