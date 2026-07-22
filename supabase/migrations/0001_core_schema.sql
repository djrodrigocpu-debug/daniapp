-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0001: esquema central
-- Masterplan §11.2 (entidades) e Anexo C (dicionário de dados).
-- =============================================================================
-- Princípios (§11.1): UUIDs não significativos; timestamps UTC; created_by/
-- updated_by; versionamento; constraints no banco; idempotency_key; row_version.
-- Reversível: ver 0001_core_schema.down.sql (drop schema app cascade + tabelas).
-- =============================================================================

create extension if not exists "pgcrypto";

-- Schema utilitário para funções de autorização (SECURITY DEFINER).
create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums de domínio (§6.3)
-- ---------------------------------------------------------------------------
create type app.role_code            as enum ('admin', 'regional', 'coordinator', 'channel_manager');
create type app.user_status          as enum ('invited', 'active', 'suspended', 'inactive');
create type app.visit_type           as enum ('weekly', 'monthly');
create type app.visit_status         as enum ('planned', 'draft', 'ready', 'submitted', 'returned', 'approved', 'cancelled');
create type app.evaluation_status    as enum ('draft', 'submitted', 'returned', 'approved', 'superseded');
create type app.action_status        as enum ('open', 'in_progress', 'blocked', 'done', 'overdue', 'cancelled_justified');
create type app.evidence_status      as enum ('local_pending', 'uploading', 'stored', 'failed', 'expired');
create type app.indicator_lifecycle  as enum ('draft', 'active', 'inactive');
create type app.traffic_light        as enum ('green', 'yellow', 'red', 'not_evaluated', 'not_applicable');
create type app.indicator_direction  as enum ('higher_better', 'lower_better', 'target_band');
create type app.calendar_exception   as enum ('holiday', 'rescheduled', 'cancelled_justified', 'not_performed');
create type app.validation_decision  as enum ('approved', 'returned');

-- ---------------------------------------------------------------------------
-- Estrutura organizacional (§11.2)
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.regions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id),
  name             text not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.units (
  id          uuid primary key default gen_random_uuid(),
  region_id   uuid not null references public.regions(id),
  name        text not null,
  timezone    text not null default 'America/Sao_Paulo',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (region_id, name)
);

create table public.coordinations (
  id                    uuid primary key default gen_random_uuid(),
  region_id             uuid not null references public.regions(id),
  name                  text not null,
  coordinator_user_id   uuid,               -- FK adicionada após public.users
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (region_id, name)
);

-- ---------------------------------------------------------------------------
-- Identidade e escopo (§5, Anexo C)
-- ---------------------------------------------------------------------------
create table public.users (
  id               uuid primary key references auth.users(id) on delete restrict,
  display_name     text not null,
  corporate_email  text not null unique,
  status           app.user_status not null default 'invited',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.coordinations
  add constraint coordinations_coordinator_fk
  foreign key (coordinator_user_id) references public.users(id);

create table public.operations (
  id                       uuid primary key default gen_random_uuid(),
  unit_id                  uuid not null references public.units(id),
  coordination_id          uuid not null references public.coordinations(id),
  partner_name             text not null,
  office_name              text not null,
  city                     text not null,
  state                    text not null check (state in ('PR', 'SC')),
  channel_manager_user_id  uuid references public.users(id),
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index operations_coordination_idx on public.operations(coordination_id);
create index operations_unit_idx on public.operations(unit_id);
create index operations_gc_idx on public.operations(channel_manager_user_id);

-- Vínculo usuário × papel × escopo, com vigência (§5.4)
create table public.user_scopes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id),
  role             app.role_code not null,
  region_id        uuid references public.regions(id),
  coordination_id  uuid references public.coordinations(id),
  unit_id          uuid references public.units(id),
  valid_from       timestamptz not null default now(),
  valid_to         timestamptz,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.users(id)
);
create index user_scopes_user_idx on public.user_scopes(user_id) where active;

-- Operações diretamente atribuídas a um GC (N:N) — §5.1
create table public.operation_assignments (
  operation_id  uuid not null references public.operations(id),
  user_id       uuid not null references public.users(id),
  valid_from    timestamptz not null default now(),
  valid_to      timestamptz,
  active        boolean not null default true,
  primary key (operation_id, user_id)
);
create index operation_assignments_user_idx on public.operation_assignments(user_id) where active;

-- ---------------------------------------------------------------------------
-- Calendário (§6.1/§6.2)
-- ---------------------------------------------------------------------------
create table public.visit_rules (
  id                          uuid primary key default gen_random_uuid(),
  unit_id                     uuid not null references public.units(id) unique,
  weekly_visit_weekday        int not null default 2 check (weekly_visit_weekday between 0 and 6),   -- terça
  monthly_audit_week_ordinal  int not null default 1 check (monthly_audit_week_ordinal between 1 and 5),
  monthly_audit_weekday       int not null default 1 check (monthly_audit_weekday between 0 and 6),  -- segunda
  tolerance_days              int not null default 2 check (tolerance_days >= 0),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table public.calendar_exceptions (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id),
  exception_date  date not null,
  kind            app.calendar_exception not null,
  reason          text not null,
  rescheduled_to  date,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id)
);
create index calendar_exceptions_unit_date_idx on public.calendar_exceptions(unit_id, exception_date);

-- ---------------------------------------------------------------------------
-- Templates de auditoria versionados (§6.1, §7.4, §11.4)
-- ---------------------------------------------------------------------------
create table public.audit_templates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  title       text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.audit_template_versions (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.audit_templates(id),
  version_number  int not null,
  effective_from  timestamptz not null default now(),
  locked          boolean not null default false,   -- true após uso (imutável §11.4)
  created_at      timestamptz not null default now(),
  unique (template_id, version_number)
);

create table public.audit_items (
  id                   uuid primary key default gen_random_uuid(),
  template_version_id  uuid not null references public.audit_template_versions(id),
  code                 text not null,
  title                text not null,
  pillar               text not null,
  weight               numeric(6,2) not null check (weight >= 0),
  frequency            app.visit_type not null,
  required             boolean not null default true,
  evidence_required    boolean not null default false,
  unique (template_version_id, code)
);
create index audit_items_version_idx on public.audit_items(template_version_id);

-- ---------------------------------------------------------------------------
-- Indicadores versionados (§8, §11.3)
-- ---------------------------------------------------------------------------
create table public.indicator_definitions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,         -- estável, ex.: IND-012
  name        text not null,
  lifecycle   app.indicator_lifecycle not null default 'draft',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id)
);

create table public.indicator_versions (
  id                uuid primary key default gen_random_uuid(),
  definition_id     uuid not null references public.indicator_definitions(id),
  version_number    int not null,
  unit              text not null,
  direction         app.indicator_direction not null,
  target            numeric(14,4) not null,
  yellow_tolerance  numeric(14,4) not null default 0,
  weight            numeric(6,2) not null default 1 check (weight >= 0),
  effective_from    timestamptz not null default now(),
  limitations       text,
  created_at        timestamptz not null default now(),
  unique (definition_id, version_number)
);

create table public.measurements (
  id                    uuid primary key default gen_random_uuid(),
  operation_id          uuid not null references public.operations(id),
  indicator_version_id  uuid not null references public.indicator_versions(id),
  period                text not null,      -- YYYY-MM
  target_value          numeric(14,4) not null,
  actual_value          numeric(14,4) not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references public.users(id),
  unique (operation_id, indicator_version_id, period)
);
create index measurements_operation_idx on public.measurements(operation_id);

-- ---------------------------------------------------------------------------
-- Visitas, avaliações, respostas (§6, §11.4)
-- ---------------------------------------------------------------------------
create table public.visits (
  id            uuid primary key default gen_random_uuid(),
  operation_id  uuid not null references public.operations(id),
  visit_type    app.visit_type not null,
  scheduled_at  timestamptz not null,
  status        app.visit_status not null default 'planned',
  author_user_id uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index visits_operation_idx on public.visits(operation_id);

create table public.evaluations (
  id                   uuid primary key default gen_random_uuid(),
  operation_id         uuid not null references public.operations(id),
  visit_id             uuid references public.visits(id),
  template_version_id  uuid not null references public.audit_template_versions(id),
  author_user_id       uuid not null references public.users(id),
  status               app.evaluation_status not null default 'draft',
  score                numeric(6,2) not null default 0,
  row_version          int not null default 1,
  submitted_at         timestamptz,
  approved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index evaluations_operation_idx on public.evaluations(operation_id);
create index evaluations_status_idx on public.evaluations(status);

create table public.evaluation_answers (
  id             uuid primary key default gen_random_uuid(),
  evaluation_id  uuid not null references public.evaluations(id) on delete cascade,
  item_id        uuid not null references public.audit_items(id),
  status         app.traffic_light not null default 'not_evaluated',
  measured_value text not null default '',
  observation    text not null default '',
  unique (evaluation_id, item_id)
);

-- Snapshot oficial imutável (§11.4)
create table public.official_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  evaluation_id        uuid not null references public.evaluations(id),
  operation_id         uuid not null references public.operations(id),
  period               text not null,
  score                numeric(6,2) not null,
  template_version_id  uuid not null references public.audit_template_versions(id),
  payload              jsonb not null,        -- respostas + versões + responsáveis
  approved_by_user_id  uuid not null references public.users(id),
  created_at           timestamptz not null default now()
);
create index official_snapshots_operation_idx on public.official_snapshots(operation_id, period);

-- ---------------------------------------------------------------------------
-- Evidências (§11.5)
-- ---------------------------------------------------------------------------
create table public.evidence_files (
  id               uuid primary key default gen_random_uuid(),
  bucket           text not null,
  path             text not null,
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes >= 0),
  sha256           text,
  author_user_id   uuid not null references public.users(id),
  source_object_id uuid not null,
  status           app.evidence_status not null default 'local_pending',
  retention_until  date,
  created_at       timestamptz not null default now(),
  unique (bucket, path)
);
create index evidence_source_idx on public.evidence_files(source_object_id);

create table public.evaluation_answer_evidence (
  answer_id    uuid not null references public.evaluation_answers(id) on delete cascade,
  evidence_id  uuid not null references public.evidence_files(id),
  primary key (answer_id, evidence_id)
);

-- ---------------------------------------------------------------------------
-- Diagnóstico, planos, validação (§7.6/§7.7/§7.8)
-- ---------------------------------------------------------------------------
create table public.diagnoses (
  id             uuid primary key default gen_random_uuid(),
  evaluation_id  uuid not null references public.evaluations(id),
  item_id        uuid not null references public.audit_items(id),
  finding        text not null,
  probable_cause text not null,
  impact         text not null,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.users(id)
);

create table public.action_plans (
  id                     uuid primary key default gen_random_uuid(),
  operation_id           uuid not null references public.operations(id),
  evaluation_id          uuid references public.evaluations(id),
  item_id                uuid references public.audit_items(id),
  description            text not null,
  origin                 text not null default '',
  owner_user_id          uuid references public.users(id),
  due_date               date not null,
  priority               text not null check (priority in ('high', 'medium', 'low')),
  completion_criterion   text not null default '',
  status                 app.action_status not null default 'open',
  completion_evidence_id uuid references public.evidence_files(id),
  row_version            int not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references public.users(id)
);
create index action_plans_operation_idx on public.action_plans(operation_id);
create index action_plans_status_idx on public.action_plans(status);

create table public.validations (
  id                 uuid primary key default gen_random_uuid(),
  evaluation_id      uuid not null references public.evaluations(id),
  validator_user_id  uuid not null references public.users(id),
  decision           app.validation_decision not null,
  reason             text not null,
  created_at         timestamptz not null default now()
);
create index validations_evaluation_idx on public.validations(evaluation_id);

create table public.best_practices (
  id              uuid primary key default gen_random_uuid(),
  operation_id    uuid references public.operations(id),
  author_user_id  uuid not null references public.users(id),
  title           text not null,
  content         text not null,
  published       boolean not null default false,
  moderated_by    uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trilha de auditoria append-only (§15.1) e sincronização (§12.3)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_user_id uuid references public.users(id),
  event        text not null,
  object_type  text,
  object_id    text,
  result       text,
  correlation  text,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs(actor_user_id);
create index audit_logs_event_idx on public.audit_logs(event);
create index audit_logs_created_idx on public.audit_logs(created_at);

create table public.sync_operations (
  id                    uuid primary key default gen_random_uuid(),
  idempotency_key       text not null unique,   -- garante processamento único (§12.3)
  user_id               uuid references public.users(id),
  device_id             text,
  kind                  text not null,
  payload               jsonb,
  expected_row_version  int,
  status                text not null default 'pending' check (status in ('pending', 'processed', 'failed', 'conflict')),
  attempts              int not null default 0,
  last_error            text,
  created_at            timestamptz not null default now(),
  processed_at          timestamptz
);
create index sync_operations_status_idx on public.sync_operations(status);
