-- =============================================================================
-- AAPEX 1.3.5 — Migration 0038: CRITÉRIOS DE PROCESSO por região
-- =============================================================================
-- Terceira parte da fundação de A-08. Os critérios da Auditoria Mensal pendem da
-- CONFIGURAÇÃO REGIONAL, não da definição do indicador (ADR-135-001, decisão
-- D-A) — o que os Contratos de Dados §6 propunham ANTES da decisão.
--
-- POR QUE MUDOU DE LUGAR. Um indicador global pode ser auditável numa região e
-- não em outra, e as perguntas de processo que sustentam o mesmo número mudam
-- com a operação local. Ancorar o critério na definição global obrigaria todas as
-- regiões ao mesmo questionário — o contrário do que D7 concede.
--
-- O QUE A AUDITORIA MENSAL PERGUNTA. Não "qual foi o número" — isso é Gestão
-- Assistida. Pergunta se o PROCESSO que sustenta o número existe, está
-- implantado e é executado (Modelo Operacional §3.1).
--
-- DUAS PROIBIÇÕES EXPRESSAS, CUMPRIDAS AQUI POR OMISSÃO DELIBERADA:
--   1. nenhum critério é gerado a partir do nome do indicador;
--   2. `audit_items` NÃO é convertido em critério — permanece intacto servindo o
--      histórico legado. As duas estruturas coexistem, e é isso que "não
--      converter automaticamente" significa.
--
-- ESTA MIGRATION NÃO ENTREGA A AUDITORIA MENSAL OPERACIONAL. Ela entrega o
-- catálogo de critérios e a guarda de publicação. Materialização na auditoria,
-- `evaluation_criteria` e `start_monthly_audit` ficam para a fase seguinte.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Critérios: identidade + versões
-- ---------------------------------------------------------------------------
create table if not exists public.audit_criteria (
  id          uuid primary key default gen_random_uuid(),
  -- A âncora é a CONFIGURAÇÃO REGIONAL: (região, indicador). É o que dá ao mesmo
  -- indicador global questionários diferentes em regiões diferentes.
  config_id   uuid not null references public.indicator_regional_configs(id),
  code        text not null,
  lifecycle   app.indicator_lifecycle not null default 'draft',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id),
  unique (config_id, code)
);
create index if not exists audit_criteria_config_idx on public.audit_criteria(config_id);

-- Os dez campos exigidos por D4: pergunta · descrição · orientação · ordem ·
-- obrigatório · evidência obrigatória · permite N/A · exige justificativa ·
-- vigência · ativo/inativo. `status` acrescenta o par rascunho/publicado que o
-- escopo desta fase exige.
create table if not exists public.audit_criteria_versions (
  id                     uuid primary key default gen_random_uuid(),
  criterion_id           uuid not null references public.audit_criteria(id),
  version_number         int  not null,
  question               text not null,
  description            text,
  guidance               text,
  sort_order             int     not null default 0,
  required               boolean not null default true,
  evidence_required      boolean not null default false,
  allows_na              boolean not null default false,
  requires_justification boolean not null default false,
  status                 app.catalog_status not null default 'draft',
  active                 boolean not null default true,
  effective_from         timestamptz not null default now(),
  effective_to           timestamptz,
  created_at             timestamptz not null default now(),
  created_by             uuid references public.users(id),
  unique (criterion_id, version_number),
  constraint audit_criteria_versions_validity_ck check (effective_to is null or effective_to > effective_from)
);
create index if not exists audit_criteria_versions_criterion_idx
  on public.audit_criteria_versions(criterion_id, version_number);

-- ---------------------------------------------------------------------------
-- 2. Guardas
-- ---------------------------------------------------------------------------
create or replace function app.guard_criterion_version_overlap() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if new.status <> 'published' then
    return new;
  end if;
  if exists (
    select 1 from public.audit_criteria_versions v
     where v.criterion_id = new.criterion_id
       and v.id <> new.id
       and v.status = 'published'
       and tstzrange(v.effective_from, v.effective_to, '[)')
        && tstzrange(new.effective_from, new.effective_to, '[)')
  ) then
    raise exception 'vigencia sobreposta: ja existe versao publicada deste criterio no periodo'
      using errcode = 'exclusion_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_criterion_version_overlap on public.audit_criteria_versions;
create trigger trg_criterion_version_overlap
  before insert or update on public.audit_criteria_versions
  for each row execute function app.guard_criterion_version_overlap();

create or replace function app.guard_criterion_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if exists (
    select 1 from public.audit_criteria_versions v
     where v.criterion_id = old.id and v.status = 'published'
  ) then
    raise exception 'criterio % ja publicado: inative em vez de excluir', old.code
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

create or replace function app.guard_criterion_version_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if old.status = 'published' then
    raise exception 'versao de criterio publicada nao pode ser excluida: publique uma nova versao'
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

drop trigger if exists trg_guard_criterion_delete on public.audit_criteria;
create trigger trg_guard_criterion_delete before delete on public.audit_criteria
  for each row execute function app.guard_criterion_delete();

drop trigger if exists trg_guard_criterion_version_delete on public.audit_criteria_versions;
create trigger trg_guard_criterion_version_delete before delete on public.audit_criteria_versions
  for each row execute function app.guard_criterion_version_delete();

-- A GUARDA CENTRAL DE D4. "Indicador auditável deve possuir ao menos um critério
-- ativo." Fica em gatilho separado, sobre a MESMA tabela que a 0037 já protege,
-- porque é uma regra da Auditoria Mensal e não da configuração em geral —
-- separada, ela pode ser lida, testada e revista sozinha.
--
-- O critério precisa estar PUBLICADO e ATIVO, e pertencer a um critério que não
-- foi inativado. Rascunho não conta: um questionário que ninguém publicou não
-- sustenta auditoria nenhuma.
create or replace function app.guard_monthly_audit_requires_criteria() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if new.status <> 'published' or not new.include_in_monthly_audit then
    return new;
  end if;
  if not exists (
    select 1
      from public.audit_criteria c
      join public.audit_criteria_versions v on v.criterion_id = c.id
     where c.config_id = new.config_id
       and c.lifecycle <> 'inactive'
       and v.status = 'published'
       and v.active
  ) then
    raise exception 'auditoria mensal exige ao menos um criterio publicado e ativo para este indicador na regiao'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_monthly_audit_requires_criteria on public.indicator_regional_config_versions;
create trigger trg_monthly_audit_requires_criteria
  before insert or update on public.indicator_regional_config_versions
  for each row execute function app.guard_monthly_audit_requires_criteria();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.audit_criteria          enable row level security;
alter table public.audit_criteria          force  row level security;
alter table public.audit_criteria_versions enable row level security;
alter table public.audit_criteria_versions force  row level security;

drop policy if exists audit_criteria_scoped_read on public.audit_criteria;
create policy audit_criteria_scoped_read on public.audit_criteria for select to authenticated
  using (exists (
    select 1 from public.indicator_regional_configs c
     where c.id = config_id and app.reaches_region(c.region_id)
  ));

drop policy if exists audit_criteria_versions_scoped_read on public.audit_criteria_versions;
create policy audit_criteria_versions_scoped_read on public.audit_criteria_versions
  for select to authenticated
  using (exists (
    select 1
      from public.audit_criteria c
      join public.indicator_regional_configs g on g.id = c.config_id
     where c.id = criterion_id and app.reaches_region(g.region_id)
  ));

revoke all on table public.audit_criteria          from anon, public;
revoke all on table public.audit_criteria_versions from anon, public;
revoke insert, update, delete, truncate on table public.audit_criteria          from authenticated;
revoke insert, update, delete, truncate on table public.audit_criteria_versions from authenticated;
grant select on table public.audit_criteria          to authenticated;
grant select on table public.audit_criteria_versions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. DTOs
-- ---------------------------------------------------------------------------
create or replace function app.criterion_dto(p_criterion_id uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id',        c.id,
    'configId',  c.config_id,
    'code',      c.code,
    'lifecycle', c.lifecycle,
    'createdAt', c.created_at,
    'versions',  coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',                    v.id,
               'versionNumber',         v.version_number,
               'question',              v.question,
               'description',           v.description,
               'guidance',              v.guidance,
               'sortOrder',             v.sort_order,
               'required',              v.required,
               'evidenceRequired',      v.evidence_required,
               'allowsNa',              v.allows_na,
               'requiresJustification', v.requires_justification,
               'status',                v.status,
               'active',                v.active,
               'effectiveFrom',         v.effective_from,
               'effectiveTo',           v.effective_to
             ) order by v.version_number)
        from public.audit_criteria_versions v where v.criterion_id = c.id
    ), '[]'::jsonb)
  )
  from public.audit_criteria c where c.id = p_criterion_id
$$;

-- A configuração regional passa a devolver também os critérios: a tela de
-- administração precisa dos dois para decidir se pode marcar Auditoria Mensal,
-- e uma segunda consulta abriria espaço para os dois lados discordarem.
create or replace function app.regional_config_dto(p_id uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id',                    c.id,
    'regionId',              c.region_id,
    'indicatorDefinitionId', c.indicator_definition_id,
    'indicatorCode',         d.code,
    'createdAt',             c.created_at,
    'versions',              coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',                          v.id,
               'versionNumber',               v.version_number,
               'indicatorVersionId',          v.indicator_version_id,
               'themeVersionId',              v.theme_version_id,
               'sortOrder',                   v.sort_order,
               'target',                      v.target,
               'tolerance',                   v.tolerance,
               'weight',                      v.weight,
               'active',                      v.active,
               'includeInAssistedManagement', v.include_in_assisted_management,
               'includeInMonthlyAudit',       v.include_in_monthly_audit,
               'status',                      v.status,
               'effectiveFrom',               v.effective_from,
               'effectiveTo',                 v.effective_to
             ) order by v.version_number)
        from public.indicator_regional_config_versions v where v.config_id = c.id
    ), '[]'::jsonb),
    'criteria',              coalesce((
      select jsonb_agg(app.criterion_dto(cr.id) order by cr.code)
        from public.audit_criteria cr where cr.config_id = c.id
    ), '[]'::jsonb)
  )
  from public.indicator_regional_configs c
  join public.indicator_definitions d on d.id = c.indicator_definition_id
 where c.id = p_id
$$;

revoke all on function app.criterion_dto(uuid)       from public, anon, authenticated;
revoke all on function app.regional_config_dto(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs de critério
-- ---------------------------------------------------------------------------
-- Autoridade: a mesma da configuração a que o critério pertence. Quem administra
-- o catálogo da região administra os critérios da região — e mais ninguém.
create or replace function public.catalog_create_criterion(
  p_config_id uuid,
  p_code      text,
  p_payload   jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid      uuid;
  v_region   uuid;
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_question text := btrim(coalesce(p_payload->>'question', ''));
  v_id       uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select region_id into v_region from public.indicator_regional_configs where id = p_config_id;
  if v_region is null or not app.can_manage_catalog(v_region) then
    raise exception 'configuracao inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if v_code = '' or v_question = '' then
    raise exception 'codigo e pergunta sao obrigatorios' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.audit_criteria where config_id = p_config_id and code = v_code) then
    raise exception 'ja existe um criterio com o codigo % nesta configuracao', v_code
      using errcode = 'unique_violation';
  end if;

  insert into public.audit_criteria (config_id, code, lifecycle, created_by)
    values (p_config_id, v_code, 'draft', v_uid) returning id into v_id;

  insert into public.audit_criteria_versions (
    criterion_id, version_number, question, description, guidance, sort_order,
    required, evidence_required, allows_na, requires_justification, status, created_by
  ) values (
    v_id, 1, v_question,
    nullif(btrim(coalesce(p_payload->>'description','')), ''),
    nullif(btrim(coalesce(p_payload->>'guidance','')), ''),
    coalesce((p_payload->>'sortOrder')::int, 0),
    coalesce((p_payload->>'required')::boolean, true),
    coalesce((p_payload->>'evidenceRequired')::boolean, false),
    coalesce((p_payload->>'allowsNa')::boolean, false),
    coalesce((p_payload->>'requiresJustification')::boolean, false),
    'draft', v_uid
  );

  return app.criterion_dto(v_id);
end $$;

create or replace function public.catalog_add_criterion_version(
  p_criterion_id uuid,
  p_payload      jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid      uuid;
  v_region   uuid;
  v_question text := btrim(coalesce(p_payload->>'question', ''));
  v_next     int;
  v_from     timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select g.region_id into v_region
    from public.audit_criteria c
    join public.indicator_regional_configs g on g.id = c.config_id
   where c.id = p_criterion_id;

  if v_region is null or not app.can_manage_catalog(v_region) then
    raise exception 'criterio inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if v_question = '' then
    raise exception 'pergunta e obrigatoria' using errcode = 'check_violation';
  end if;

  begin
    v_from := coalesce(nullif(p_payload->>'effectiveFrom', '')::timestamptz, now());
  exception when others then
    raise exception 'vigencia invalida: use o formato AAAA-MM-DD' using errcode = 'check_violation';
  end;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.audit_criteria_versions where criterion_id = p_criterion_id;

  insert into public.audit_criteria_versions (
    criterion_id, version_number, question, description, guidance, sort_order,
    required, evidence_required, allows_na, requires_justification,
    status, active, effective_from, created_by
  ) values (
    p_criterion_id, v_next, v_question,
    nullif(btrim(coalesce(p_payload->>'description','')), ''),
    nullif(btrim(coalesce(p_payload->>'guidance','')), ''),
    coalesce((p_payload->>'sortOrder')::int, 0),
    coalesce((p_payload->>'required')::boolean, true),
    coalesce((p_payload->>'evidenceRequired')::boolean, false),
    coalesce((p_payload->>'allowsNa')::boolean, false),
    coalesce((p_payload->>'requiresJustification')::boolean, false),
    'draft', coalesce((p_payload->>'active')::boolean, true), v_from, v_uid
  );

  return app.criterion_dto(p_criterion_id);
end $$;

create or replace function public.catalog_publish_criterion_version(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid       uuid;
  v_criterion uuid;
  v_region    uuid;
  v_status    app.catalog_status;
  v_from      timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select v.criterion_id, g.region_id, v.status, v.effective_from
    into v_criterion, v_region, v_status, v_from
    from public.audit_criteria_versions v
    join public.audit_criteria c          on c.id = v.criterion_id
    join public.indicator_regional_configs g on g.id = c.config_id
   where v.id = p_version_id;

  if v_criterion is null or not app.can_manage_catalog(v_region) then
    raise exception 'versao de criterio inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  if v_status = 'published' then
    return app.criterion_dto(v_criterion);      -- idempotência
  end if;

  update public.audit_criteria_versions
     set effective_to = v_from
   where criterion_id = v_criterion
     and id <> p_version_id
     and status = 'published'
     and effective_to is null
     and effective_from <= v_from;

  update public.audit_criteria_versions set status = 'published' where id = p_version_id;
  update public.audit_criteria set lifecycle = 'active'
   where id = v_criterion and lifecycle = 'draft';

  return app.criterion_dto(v_criterion);
end $$;

create or replace function public.catalog_set_criterion_lifecycle(
  p_criterion_id uuid,
  p_lifecycle    text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_region uuid;
  v_next   app.indicator_lifecycle;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select g.region_id into v_region
    from public.audit_criteria c
    join public.indicator_regional_configs g on g.id = c.config_id
   where c.id = p_criterion_id;

  if v_region is null or not app.can_manage_catalog(v_region) then
    raise exception 'criterio inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  begin
    v_next := p_lifecycle::app.indicator_lifecycle;
  exception when others then
    raise exception 'situacao invalida: use active ou inactive' using errcode = 'check_violation';
  end;

  if v_next = 'draft' then
    raise exception 'situacao invalida: use active ou inactive' using errcode = 'check_violation';
  end if;

  update public.audit_criteria set lifecycle = v_next where id = p_criterion_id;
  return app.criterion_dto(p_criterion_id);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Grants mínimos
-- ---------------------------------------------------------------------------
revoke all on function public.catalog_create_criterion(uuid, text, jsonb) from public, anon;
revoke all on function public.catalog_add_criterion_version(uuid, jsonb)  from public, anon;
revoke all on function public.catalog_publish_criterion_version(uuid)     from public, anon;
revoke all on function public.catalog_set_criterion_lifecycle(uuid, text) from public, anon;

grant execute on function public.catalog_create_criterion(uuid, text, jsonb) to authenticated;
grant execute on function public.catalog_add_criterion_version(uuid, jsonb)  to authenticated;
grant execute on function public.catalog_publish_criterion_version(uuid)     to authenticated;
grant execute on function public.catalog_set_criterion_lifecycle(uuid, text) to authenticated;
