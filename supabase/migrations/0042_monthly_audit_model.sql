-- =============================================================================
-- AAPEX 1.3.5 — Migration 0042: MODELO da Auditoria Mensal materializada
-- =============================================================================
-- DECISÃO QUE ESTA MIGRATION MATERIALIZA. ADR-135-003, alternativa (c):
-- `evaluations` continua sendo o AGREGADO da auditoria, e o que muda é DE QUE
-- ELA É FEITA, declarado por um discriminador explícito.
--
--   legacy_template   -> audit_items         -> evaluation_answers            (INTACTO)
--   monthly_criteria  -> evaluation_criteria -> evaluation_criterion_answers  (NOVO)
--
-- O QUE ESTA MIGRATION NÃO FAZ, E POR QUÊ. Não cria `audit_template_versions`
-- vazio nem `audit_items` por critério. Fazer isso deixaria a auditoria nova
-- PARECER legada, e todo consumidor do modelo antigo — `app.evaluation_score`,
-- `submit_evaluation`, `get_official_audit_report_data`, `ui_evaluations` —
-- passaria a operar sobre dados que ninguém preencheu, produzindo nota,
-- relatório e código de integridade a partir de ficção. `audit_items.weight` é
-- `not null` e critério NÃO TEM PESO: os dez campos de D4 não incluem um.
--
-- ADITIVA. Uma coluna com default em `evaluations`, uma em `official_snapshots`,
-- uma relaxação de `not null` acompanhada de CHECK MAIS FORTE, e quatro tabelas
-- novas. Nenhuma linha existente é reescrita: toda avaliação de hoje nasce
-- `legacy_template` pelo DEFAULT DA COLUNA, que é o que ela sempre foi.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
-- Blocos defensivos pelo mesmo motivo da 0036 e da 0039: o rollback 0001 derruba
-- `schema app cascade` e o harness reaplica todas as migrations sobre o mesmo
-- banco.
do $$ begin
  create type app.evaluation_model as enum ('legacy_template', 'monthly_criteria');
exception when duplicate_object then null; end $$;

-- QUATRO valores, contra os cinco de `app.traffic_light`. A diferença é o
-- AMARELO, e ela é deliberada (ADR-135-003, D-N): a auditoria de processo
-- pergunta se o processo EXISTE E É EXECUTADO, e não há resposta intermediária
-- para isso. Inventar "parcialmente executado" seria regra empresarial que
-- ninguém declarou.
do $$ begin
  create type app.criterion_answer_status as enum
    ('nao_avaliado', 'conforme', 'nao_conforme', 'nao_aplicavel');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. O discriminador em `evaluations`
-- ---------------------------------------------------------------------------
alter table public.evaluations
  add column if not exists evaluation_model app.evaluation_model not null default 'legacy_template';

-- `template_version_id` deixa de ser `not null` — mas o CHECK que entra no lugar
-- é MAIS FORTE que a restrição que substitui: antes, nada impedia uma avaliação
-- legada de existir sem template no futuro; agora o modelo declara qual das duas
-- formas vale, e a outra é impossível.
--
-- monthly_criteria NÃO USA template legado, e não pode fingir que usa: preencher
-- com "o template mais recente" faria o relatório histórico enriquecer respostas
-- com itens de um checklist que a auditoria nunca respondeu.
alter table public.evaluations alter column template_version_id drop not null;

do $$ begin
  alter table public.evaluations add constraint evaluations_model_template_ck check (
    (evaluation_model = 'legacy_template'  and template_version_id is not null)
    or (evaluation_model = 'monthly_criteria' and template_version_id is null)
  );
exception when duplicate_object then null; end $$;

create index if not exists evaluations_model_idx on public.evaluations(evaluation_model);

-- Competência: no MÁXIMO uma Auditoria Mensal do modelo novo por parceiro por
-- competência.
--
-- A competência é `period_start`, e NÃO uma coluna nova: `period_start` já
-- existe e duplicar a informação criaria duas verdades. O que faz `period_start`
-- ser competência, e não uma data qualquer, é o CHECK abaixo — mesma técnica que
-- a 0039 usa para `week_start_date` ser sempre segunda-feira. Sem ele, a
-- unicidade seria por dia, não por mês.
--
-- `to_char(period_start, 'YYYY-MM')` seria a expressão natural e NÃO SERVE:
-- `to_char(timestamp, text)` é STABLE (depende de DateStyle e lc_time) e o
-- PostgreSQL recusa função não-IMMUTABLE em expressão de índice.
do $$ begin
  alter table public.evaluations add constraint evaluations_monthly_competence_ck check (
    evaluation_model <> 'monthly_criteria'
    or (
      period_start is not null
      and period_end is not null
      and extract(day from period_start) = 1
      and period_end = (period_start + interval '1 month' - interval '1 day')::date
    )
  );
exception when duplicate_object then null; end $$;

-- Índice único PARCIAL, porque a restrição é só do modelo novo: o legado
-- continua podendo ter várias avaliações mensais no mesmo período, que é o
-- comportamento histórico e não pode mudar retroativamente.
create unique index if not exists evaluations_monthly_competence_uk
  on public.evaluations (operation_id, period_start)
  where evaluation_model = 'monthly_criteria';

-- ---------------------------------------------------------------------------
-- 3. O mesmo par em `official_snapshots`
-- ---------------------------------------------------------------------------
alter table public.official_snapshots
  add column if not exists evaluation_model app.evaluation_model not null default 'legacy_template';

alter table public.official_snapshots alter column template_version_id drop not null;

do $$ begin
  alter table public.official_snapshots add constraint official_snapshots_model_template_ck check (
    (evaluation_model = 'legacy_template'  and template_version_id is not null)
    or (evaluation_model = 'monthly_criteria' and template_version_id is null)
  );
exception when duplicate_object then null; end $$;

-- Os gatilhos de imutabilidade de 0033/0034 continuam valendo e NÃO são tocados:
-- snapshot aprovado não muda, seja de que modelo for.

-- ---------------------------------------------------------------------------
-- 4. Critérios MATERIALIZADOS na criação da auditoria
-- ---------------------------------------------------------------------------
-- Cópia congelada. Alterar o catálogo depois NÃO muda auditoria existente — é o
-- que D4 exige, e é o mesmo princípio que `assisted_cycle_entries` aplica ao
-- ciclo semanal.
--
-- Dois blocos, como na 0039: PROVENIÊNCIA (a que objetos do catálogo esta linha
-- se refere) e CÓPIA (o que a auditoria efetivamente usa para exibir e validar).
create table if not exists public.evaluation_criteria (
  id             uuid primary key default gen_random_uuid(),
  evaluation_id  uuid not null references public.evaluations(id) on delete cascade,

  -- proveniência
  regional_config_id          uuid not null references public.indicator_regional_configs(id),
  regional_config_version_id  uuid not null references public.indicator_regional_config_versions(id),
  indicator_definition_id     uuid not null references public.indicator_definitions(id),
  indicator_version_id        uuid not null references public.indicator_versions(id),
  theme_id                    uuid not null references public.themes(id),
  theme_version_id            uuid not null references public.theme_versions(id),
  criterion_id                uuid not null references public.audit_criteria(id),
  criterion_version_id        uuid not null references public.audit_criteria_versions(id),

  -- cópia congelada: identificação
  criterion_code  text not null,
  indicator_code  text not null,
  indicator_name  text not null,
  theme_code      text not null,
  theme_name      text not null,

  -- cópia congelada: os dez campos de D4
  question                text not null,
  description             text not null default '',
  guidance                text not null default '',
  sort_order              int  not null default 0,
  required                boolean not null default true,
  evidence_required       boolean not null default false,
  allows_na               boolean not null default false,
  requires_justification  boolean not null default false,
  effective_from          timestamptz not null,
  effective_to            timestamptz,

  created_at  timestamptz not null default now(),

  -- Um critério entra UMA VEZ em cada auditoria, pela sua IDENTIDADE
  -- (`criterion_id`) e não pela versão: duas versões do mesmo critério na mesma
  -- auditoria seriam duas linhas para a mesma pergunta.
  constraint evaluation_criteria_uk unique (evaluation_id, criterion_id)
);
create index if not exists evaluation_criteria_eval_idx
  on public.evaluation_criteria(evaluation_id, sort_order, criterion_code);

-- ---------------------------------------------------------------------------
-- 5. RESPOSTAS aos critérios materializados
-- ---------------------------------------------------------------------------
-- Tabela PRÓPRIA, e não `evaluation_answers` com FKs anuláveis: `item_id` é
-- `not null` desde 0001 e é lido por seis consumidores, cada um deles uma chance
-- de mexer no determinismo já provado. Ver ADR-135-003, alternativa (b).
create table if not exists public.evaluation_criterion_answers (
  id                       uuid primary key default gen_random_uuid(),
  evaluation_id            uuid not null references public.evaluations(id) on delete cascade,
  evaluation_criterion_id  uuid not null references public.evaluation_criteria(id) on delete cascade,

  status         app.criterion_answer_status not null default 'nao_avaliado',
  justification  text not null default '',
  observation    text not null default '',
  diagnosis      text not null default '',

  answered_by  uuid references public.users(id),
  answered_at  timestamptz,
  row_version  int not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Uma resposta por critério materializado.
  constraint evaluation_criterion_answers_uk unique (evaluation_criterion_id)
);
create index if not exists evaluation_criterion_answers_eval_idx
  on public.evaluation_criterion_answers(evaluation_id);

-- ---------------------------------------------------------------------------
-- 6. Vínculo PRÓPRIO de evidência
-- ---------------------------------------------------------------------------
-- `evaluation_answer_evidence.answer_id` é `not null` para `evaluation_answers`
-- e não serve aqui. O que NÃO é duplicado é o caminho FÍSICO: reserva -> objeto
-- no bucket -> confirmação, com a trava D-02, a higiene de reservas abandonadas
-- e as policies do bucket privado. Esse caminho é estendido na 0044, não
-- reescrito.
create table if not exists public.evaluation_criterion_answer_evidence (
  answer_id    uuid not null references public.evaluation_criterion_answers(id) on delete cascade,
  evidence_id  uuid not null references public.evidence_files(id),
  primary key (answer_id, evidence_id)
);

-- A reserva de upload passa a saber os dois destinos. `answer_id` deixa de ser
-- `not null` e ganha CHECK de exclusividade — mesma técnica de `action_plans`.
alter table public.evidence_upload_reservations
  add column if not exists criterion_answer_id uuid
    references public.evaluation_criterion_answers(id) on delete cascade;

alter table public.evidence_upload_reservations alter column answer_id drop not null;

do $$ begin
  alter table public.evidence_upload_reservations
    add constraint evidence_reservation_target_ck check (
      (answer_id is not null and criterion_answer_id is null)
      or (answer_id is null and criterion_answer_id is not null)
    );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 7. Guardas de integridade
-- ---------------------------------------------------------------------------
-- POR QUE EM GATILHO. As policies da seção 8 não abrem escrita direta, mas o
-- padrão desta base (0025, cabeçalho; 0039, §7) é não depender disso: um
-- invariante que só existe dentro de uma `security definer` deixa de valer no
-- dia em que alguém acrescentar uma policy de escrita.

-- 7.1 · A resposta pertence à MESMA auditoria do critério, e a auditoria é do
-- modelo certo. Sem isto, um cliente poderia forjar `evaluation_id` e pendurar
-- a resposta de um critério na auditoria de outro parceiro.
create or replace function app.guard_criterion_answer_coherence() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare
  v_crit_eval  uuid;
  v_model      app.evaluation_model;
  v_allows_na  boolean;
  v_req_just   boolean;
begin
  select ec.evaluation_id, ec.allows_na, ec.requires_justification
    into v_crit_eval, v_allows_na, v_req_just
    from public.evaluation_criteria ec where ec.id = new.evaluation_criterion_id;

  if v_crit_eval is null then
    raise exception 'criterio materializado inexistente'
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_crit_eval is distinct from new.evaluation_id then
    raise exception 'resposta nao pertence a auditoria do criterio'
      using errcode = 'integrity_constraint_violation';
  end if;

  select evaluation_model into v_model from public.evaluations where id = new.evaluation_id;
  if v_model is distinct from 'monthly_criteria' then
    raise exception 'resposta de criterio so existe em auditoria do modelo mensal'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- N/A só quando o critério materializado permitir. A parametrização vale a que
  -- estava vigente NA CRIAÇÃO da auditoria — mudar o catálogo depois não abre
  -- nem fecha essa porta retroativamente.
  if new.status = 'nao_aplicavel' and not v_allows_na then
    raise exception 'este criterio nao admite Nao aplicavel'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Justificativa exigida vale SÓ para N/A: é o "não se aplica por quê". Para
  -- conforme e não conforme o campo próprio é `observation`/`diagnosis`.
  if new.status = 'nao_aplicavel' and v_req_just
     and not app.na_reason_is_valid(new.justification) then
    raise exception 'Nao aplicavel neste criterio exige justificativa'
      using errcode = 'integrity_constraint_violation';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_criterion_answer_coherence on public.evaluation_criterion_answers;
create trigger trg_criterion_answer_coherence
  before insert or update on public.evaluation_criterion_answers
  for each row execute function app.guard_criterion_answer_coherence();

-- 7.2 · IMUTABILIDADE depois de enviada.
-- `submitted` e `approved` congelam o conteúdo. `returned` reabre — é o que
-- devolver significa. `superseded` é histórico e não volta.
--
-- Sessões sem JWT (migrations, manutenção, `postgres`) seguem o padrão de
-- `app.guard_action_plan_write` (0025) e NÃO são restringidas.
create or replace function app.guard_monthly_audit_frozen() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare v_status app.evaluation_status; v_eval uuid;
begin
  if auth.uid() is null then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  v_eval := case tg_op when 'DELETE' then old.evaluation_id else new.evaluation_id end;
  select status into v_status from public.evaluations where id = v_eval;

  if v_status in ('submitted', 'approved', 'superseded') then
    raise exception 'auditoria % nao aceita alteracao',
      (case v_status when 'submitted' then 'enviada' else 'aprovada' end)
      using errcode = 'integrity_constraint_violation';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end $$;

-- Sufixo `zz_` deliberado: a recusa por estado deve ser a última palavra, e não
-- competir com a validação de conteúdo pela mensagem de erro (gatilhos de mesmo
-- momento disparam em ordem alfabética).
drop trigger if exists trg_zz_criterion_answer_frozen on public.evaluation_criterion_answers;
create trigger trg_zz_criterion_answer_frozen
  before insert or update or delete on public.evaluation_criterion_answers
  for each row execute function app.guard_monthly_audit_frozen();

drop trigger if exists trg_zz_evaluation_criteria_frozen on public.evaluation_criteria;
create trigger trg_zz_evaluation_criteria_frozen
  before update or delete on public.evaluation_criteria
  for each row execute function app.guard_monthly_audit_frozen();

-- 7.3 · A evidência vinculada é do mesmo fluxo autorizado.
-- `evidence_files.source_object_id` é a avaliação de origem nos DOIS modelos;
-- exigir que ela seja a mesma auditoria da resposta impede pendurar evidência de
-- outro parceiro — que a FK sozinha não impediria.
create or replace function app.guard_criterion_evidence_link() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare v_answer_eval uuid; v_evidence_source uuid;
begin
  select a.evaluation_id into v_answer_eval
    from public.evaluation_criterion_answers a where a.id = new.answer_id;
  select ef.source_object_id into v_evidence_source
    from public.evidence_files ef where ef.id = new.evidence_id;

  if v_answer_eval is null or v_evidence_source is null then
    raise exception 'resposta ou evidencia inexistente'
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_answer_eval is distinct from v_evidence_source then
    raise exception 'evidencia de outra auditoria nao pode ser vinculada a esta resposta'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_criterion_evidence_link on public.evaluation_criterion_answer_evidence;
create trigger trg_criterion_evidence_link
  before insert or update on public.evaluation_criterion_answer_evidence
  for each row execute function app.guard_criterion_evidence_link();

-- ---------------------------------------------------------------------------
-- 8. Pontuação da auditoria mensal — PROVISÓRIA (pendência A-10)
-- ---------------------------------------------------------------------------
-- `app.evaluation_score` divide por `audit_items.weight`. Critérios NÃO TÊM
-- PESO: os dez campos de D4 não incluem um, e peso é decisão empresarial, não
-- default técnico.
--
-- Proporção SIMPLES de conformidade, com `nao_aplicavel` fora do numerador E do
-- denominador — a mesma matemática que o `not_applicable` legado já recebe.
-- NÃO é ponderação e NÃO é o Índice de Excelência. Fica declarado provisório
-- enquanto A-10 estiver aberta (ADR-135-003, D-O).
create or replace function app.monthly_audit_score(p_eval uuid) returns numeric
  language sql stable set search_path = public, app as $$
  select coalesce(round(
      count(*) filter (where a.status = 'conforme')::numeric
      / nullif(count(*) filter (where a.status in ('conforme', 'nao_conforme')), 0) * 100
    , 2), 0)
  from public.evaluation_criterion_answers a
  where a.evaluation_id = p_eval
$$;

revoke all on function app.monthly_audit_score(uuid) from public, anon;
grant execute on function app.monthly_audit_score(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. RLS: leitura por escopo, escrita SOMENTE por RPC
-- ---------------------------------------------------------------------------
-- Leitura segue o alcance da avaliação, que é o mesmo de `evaluations` desde
-- 0002 — ADMIN global, REGIONAL na região, COORDENADOR na coordenadoria, GC nos
-- seus parceiros (Matriz §4, linha "Consultar aprovada").
alter table public.evaluation_criteria                    enable row level security;
alter table public.evaluation_criteria                    force  row level security;
alter table public.evaluation_criterion_answers           enable row level security;
alter table public.evaluation_criterion_answers           force  row level security;
alter table public.evaluation_criterion_answer_evidence   enable row level security;
alter table public.evaluation_criterion_answer_evidence   force  row level security;

drop policy if exists eval_criteria_scoped_read on public.evaluation_criteria;
create policy eval_criteria_scoped_read on public.evaluation_criteria for select to authenticated
  using (exists (
    select 1 from public.evaluations e
     where e.id = evaluation_id and app.has_operation_access(e.operation_id)
  ));

drop policy if exists criterion_answers_scoped_read on public.evaluation_criterion_answers;
create policy criterion_answers_scoped_read on public.evaluation_criterion_answers
  for select to authenticated
  using (exists (
    select 1 from public.evaluations e
     where e.id = evaluation_id and app.has_operation_access(e.operation_id)
  ));

drop policy if exists criterion_evidence_scoped_read on public.evaluation_criterion_answer_evidence;
create policy criterion_evidence_scoped_read on public.evaluation_criterion_answer_evidence
  for select to authenticated
  using (exists (
    select 1 from public.evaluation_criterion_answers a
      join public.evaluations e on e.id = a.evaluation_id
     where a.id = answer_id and app.has_operation_access(e.operation_id)
  ));

-- Mitigação do achado O-10 na superfície nova: `revoke all` antes do grant, e
-- não um revoke enumerado — os DEFAULT PRIVILEGES do Supabase concedem
-- `arwdDxtm` a `authenticated` em toda tabela de `public`, e enumerar as quatro
-- de escrita deixaria `REFERENCES` e `TRIGGER` para trás.
revoke all on table public.evaluation_criteria                  from anon, public, authenticated;
revoke all on table public.evaluation_criterion_answers         from anon, public, authenticated;
revoke all on table public.evaluation_criterion_answer_evidence from anon, public, authenticated;
grant select on table public.evaluation_criteria                  to authenticated;
grant select on table public.evaluation_criterion_answers         to authenticated;
grant select on table public.evaluation_criterion_answer_evidence to authenticated;
