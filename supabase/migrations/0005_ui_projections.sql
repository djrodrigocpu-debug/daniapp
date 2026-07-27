-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0005: projeções de leitura ui_* (Masterplan §8)
-- =============================================================================
-- Views que mapeiam o modelo corporativo (snake_case, normalizado) para a forma
-- que a UI consome (camelCase — src/types). São o que os adapters
-- `src/data/repositories/Supabase*Repository.ts` leem via PostgREST.
--
-- SEGURANÇA (crítico): todas usam `security_invoker = true`. Assim a RLS das
-- tabelas-base é avaliada no papel do USUÁRIO que consulta (não no dono da view),
-- preservando o escopo por perfil (§5.1). Sem isso, uma view vazaria todas as
-- linhas — anti-requisito. Colunas numéricas de score são projetadas como
-- double precision para serializarem como número JSON (numeric viraria string).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ui_operations  →  src/types Operation
-- ---------------------------------------------------------------------------
create or replace view public.ui_operations
  with (security_invoker = true) as
select
  o.id                          as "id",
  o.partner_name                as "partnerName",
  o.office_name                 as "officeName",
  o.city                        as "city",
  o.state                       as "state",
  c.coordinator_user_id         as "coordinatorId",
  o.channel_manager_user_id     as "managerId",
  o.active                      as "active",
  coalesce((
    select s.score from public.official_snapshots s
    where s.operation_id = o.id order by s.created_at desc limit 1
  ), 0)::double precision       as "currentScore",
  coalesce((
    select s.score from public.official_snapshots s
    where s.operation_id = o.id order by s.created_at desc offset 1 limit 1
  ), 0)::double precision       as "previousScore",
  (
    select s.created_at::date::text from public.official_snapshots s
    where s.operation_id = o.id order by s.created_at desc limit 1
  )                             as "lastAudit",
  coalesce((
    select min(v.scheduled_at)::date from public.visits v
    where v.operation_id = o.id and v.status = 'planned' and v.scheduled_at >= now()
  ), current_date)::text        as "nextAudit",
  (case
     when exists (select 1 from public.official_snapshots s where s.operation_id = o.id)
     then app.score_traffic_light(coalesce((
       select s.score from public.official_snapshots s
       where s.operation_id = o.id order by s.created_at desc limit 1), 0))
     else 'not_evaluated'::app.traffic_light
   end)::text                   as "status",
  (
    select count(*)::int from public.action_plans a
    where a.operation_id = o.id
      and a.status in ('open','in_progress','blocked','overdue')
  )                             as "openActions"
from public.operations o
left join public.coordinations c on c.id = o.coordination_id;

-- ---------------------------------------------------------------------------
-- ui_evaluations  →  src/types Evaluation (respostas aninhadas por tema)
-- ---------------------------------------------------------------------------
create or replace view public.ui_evaluations
  with (security_invoker = true) as
select
  e.id                          as "id",
  e.operation_id                as "operationId",
  coalesce(e.cycle_label, '')   as "cycleLabel",
  e.period_start::text          as "periodStart",
  e.period_end::text            as "periodEnd",
  coalesce(e.frequency, (
    select v.visit_type from public.visits v where v.id = e.visit_id
  ))::text                      as "frequency",
  e.author_user_id              as "evaluatorId",
  e.submitted_at                as "submittedAt",
  e.validated_at                as "validatedAt",
  e.validator_user_id           as "validatorId",
  e.validator_note              as "validatorNote",
  (case when e.status = 'superseded' then 'approved' else e.status::text end) as "status",
  e.score::double precision     as "score",
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'themeId',       ai.code,
        'status',        ea.status,
        'measuredValue', ea.measured_value,
        'observation',   ea.observation,
        'evidenceIds',   coalesce((
          select jsonb_agg(link.evidence_id)
          from public.evaluation_answer_evidence link
          where link.answer_id = ea.id
        ), '[]'::jsonb)
      ) order by ai.code
    )
    from public.evaluation_answers ea
    join public.audit_items ai on ai.id = ea.item_id
    where ea.evaluation_id = e.id
  ), '[]'::jsonb)               as "answers",
  e.created_at                  as "createdAt",
  e.updated_at                  as "updatedAt"
from public.evaluations e;

-- ---------------------------------------------------------------------------
-- ui_action_plans  →  src/types ActionPlan
-- ---------------------------------------------------------------------------
create or replace view public.ui_action_plans
  with (security_invoker = true) as
select
  a.id                                        as "id",
  a.operation_id                              as "operationId",
  coalesce(a.evaluation_id::text, '')         as "evaluationId",
  coalesce(a.theme_code, (
    select ai.code from public.audit_items ai where ai.id = a.item_id
  ), '')                                      as "themeId",
  a.problem                                   as "problem",
  a.root_cause                                as "rootCause",
  coalesce(nullif(a.action_text, ''), a.description) as "action",
  coalesce(nullif(a.owner_name, ''), a.owner_user_id::text, '') as "owner",
  a.due_date::text                            as "dueDate",
  a.priority                                  as "priority",
  a.expected_evidence                         as "expectedEvidence",
  app.action_status_to_ui(a.status)           as "status",
  a.completion_note                           as "completionNote",
  a.created_at                                as "createdAt",
  a.updated_at                                as "updatedAt"
from public.action_plans a;

-- ---------------------------------------------------------------------------
-- ui_users  →  src/types User (perfil + papel/região do escopo ativo)
-- ---------------------------------------------------------------------------
create or replace view public.ui_users
  with (security_invoker = true) as
select
  u.id                                        as "id",
  u.display_name                              as "name",
  u.corporate_email                           as "email",
  (
    select s.role::text from public.user_scopes s
    where s.user_id = u.id and s.active
      and (s.valid_to is null or s.valid_to > now())
    order by s.valid_from desc limit 1
  )                                           as "role",
  null::text                                  as "coordinatorId",
  coalesce((
    select r.name from public.user_scopes s
    join public.regions r on r.id = s.region_id
    where s.user_id = u.id and s.active and s.region_id is not null
    order by s.valid_from desc limit 1
  ), '')                                      as "region",
  upper(
    coalesce(left(split_part(u.display_name, ' ', 1), 1), '') ||
    coalesce(left(nullif(split_part(u.display_name, ' ', 2), ''), 1),
             substr(coalesce(split_part(u.display_name, ' ', 1), ''), 2, 1))
  )                                           as "avatarInitials",
  (u.status = 'active')                       as "active"
from public.users u;

-- ---------------------------------------------------------------------------
-- ui_indicators  →  src/types AdminIndicator (com versões aninhadas)
-- ---------------------------------------------------------------------------
create or replace view public.ui_indicators
  with (security_invoker = true) as
select
  d.id                                        as "id",
  d.code                                      as "code",
  d.name                                      as "name",
  (case when d.lifecycle = 'inactive' then 'inactive' else 'active' end) as "lifecycle",
  d.created_at                                as "createdAt",
  (
    select count(*)::int
    from public.measurements m
    join public.indicator_versions iv on iv.id = m.indicator_version_id
    where iv.definition_id = d.id
  )                                           as "usageCount",
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',              v.id,
        'versionNumber',   v.version_number,
        'unit',            v.unit,
        'direction',       v.direction,
        'target',          v.target,
        'yellowTolerance', v.yellow_tolerance,
        'weight',          v.weight,
        'effectiveFrom',   v.effective_from
      ) order by v.version_number
    )
    from public.indicator_versions v
    where v.definition_id = d.id
  ), '[]'::jsonb)                             as "versions"
from public.indicator_definitions d;

-- ---------------------------------------------------------------------------
-- Grants: leitura das projeções para autenticados (a RLS-base faz o filtro).
-- ---------------------------------------------------------------------------
grant select on public.ui_operations   to authenticated;
grant select on public.ui_evaluations  to authenticated;
grant select on public.ui_action_plans to authenticated;
grant select on public.ui_users        to authenticated;
grant select on public.ui_indicators   to authenticated;
