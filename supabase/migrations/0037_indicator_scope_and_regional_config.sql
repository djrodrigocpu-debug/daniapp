-- =============================================================================
-- AAPEX 1.3.5 — Migration 0037: escopo do indicador e CONFIGURAÇÃO REGIONAL
-- =============================================================================
-- Segunda parte da decisão A-08 (ADR-135-001). A 0036 deu escopo aos temas e as
-- funções de autorização; aqui o indicador ganha escopo e nasce a camada que a
-- decisão criou: a CONFIGURAÇÃO OPERACIONAL REGIONAL VERSIONADA.
--
-- A LEITURA QUE ESTA MIGRATION EXIGE. A partir daqui, indicador e operação são
-- duas coisas:
--
--   indicator_definitions/_versions      = O QUE o indicador é     (semântica)
--   indicator_regional_configs/_versions = COMO a região o opera   (operação)
--
-- Meta, tolerância, peso, tema, ordem e as duas flags de módulo estão na SEGUNDA
-- — decisão D-B do ADR, que resolve a pendência A-09 fora de `indicator_versions`.
-- É isso que permite ao mesmo indicador global ter meta 90 numa região e 75 em
-- outra sem duplicar o conceito nem quebrar a comparação entre regiões.
--
-- NADA FICA OPERÁVEL SOZINHO (decisão D-G). Um indicador global existir não o
-- ativa em região alguma; a adoção é ato explícito e publicado da região.
--
-- ADITIVA. As colunas novas são anuláveis ou têm default que reproduz o
-- comportamento anterior. Nenhuma linha existente é reescrita; os indicadores de
-- hoje passam a ser CATÁLOGO GLOBAL LEGADO, sem configuração regional e sem
-- participação automática em módulo nenhum.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Escopo do indicador
-- ---------------------------------------------------------------------------
alter table public.indicator_definitions
  add column if not exists scope_kind app.scope_kind not null default 'global',
  add column if not exists region_id  uuid references public.regions(id);

do $$ begin
  alter table public.indicator_definitions add constraint indicator_definitions_scope_ck check (
    (scope_kind = 'global'   and region_id is null)
    or (scope_kind = 'regional' and region_id is not null)
  );
exception when duplicate_object then null; end $$;

create index if not exists indicator_definitions_region_idx
  on public.indicator_definitions(region_id);

-- A `unique (code)` de 0001 PERMANECE INTACTA. Indicador regional recebe código
-- único em todo o catálogo, não por escopo (ADR-135-001, decisão D-E).
--
-- A alternativa — dois índices únicos parciais, um por escopo — foi escrita,
-- testada e DESCARTADA por quebrar consumidores reais: `on conflict (code)`
-- não infere índice parcial, e é exatamente essa cláusula que a semente do
-- catálogo e o bootstrap 0021 usam para serem reexecutáveis. Um índice parcial
-- transforma os dois num erro opaco de inferência.
--
-- Consequência aceita: duas regiões não podem usar a mesma sigla para
-- indicadores diferentes. Em troca, um código continua significando uma coisa
-- só em relatório, exportação e comparação entre regiões.

-- ---------------------------------------------------------------------------
-- 2. Semântica versionada do indicador
-- ---------------------------------------------------------------------------
-- `name` e `description` ANULÁVEIS (ADR-135-001, decisão D-C): nulo significa
-- "herda de indicator_definitions.name", que é o estado de todo o catálogo
-- legado. Nenhuma linha é reescrita, e mesmo assim o Regional passa a poder
-- publicar nova versão do nome de um indicador REGIONAL sem que isso renomeie o
-- passado — pelo mesmo motivo que o nome do tema mora na versão.
--
-- `status` com default 'published' preserva o comportamento de 0001–0035: lá,
-- criar versão era colocá-la em vigor. Versão nova criada pelo caminho 1.3.5
-- nasce em rascunho, explicitamente.
alter table public.indicator_versions
  add column if not exists name          text,
  add column if not exists description   text,
  add column if not exists status        app.catalog_status not null default 'published',
  add column if not exists effective_to  timestamptz,
  add column if not exists created_by    uuid references public.users(id);

do $$ begin
  alter table public.indicator_versions add constraint indicator_versions_validity_ck
    check (effective_to is null or effective_to > effective_from);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3. Configuração operacional regional
-- ---------------------------------------------------------------------------
-- Identidade estável do par (região, indicador). Uma região adota um indicador
-- uma única vez; o que muda ao longo do tempo são as VERSÕES da configuração.
create table if not exists public.indicator_regional_configs (
  id                      uuid primary key default gen_random_uuid(),
  region_id               uuid not null references public.regions(id),
  indicator_definition_id uuid not null references public.indicator_definitions(id),
  created_at              timestamptz not null default now(),
  created_by              uuid references public.users(id),
  unique (region_id, indicator_definition_id)
);
create index if not exists indicator_regional_configs_region_idx
  on public.indicator_regional_configs(region_id);

create table if not exists public.indicator_regional_config_versions (
  id                    uuid primary key default gen_random_uuid(),
  config_id             uuid not null references public.indicator_regional_configs(id),
  version_number        int  not null,

  -- a que versão da SEMÂNTICA e de que TEMA esta operação se refere
  indicator_version_id  uuid not null references public.indicator_versions(id),
  theme_version_id      uuid not null references public.theme_versions(id),

  -- o que a região decide
  sort_order            int     not null default 0,
  target                numeric(14,4) not null,
  tolerance             numeric(14,4) not null default 0 check (tolerance >= 0),
  weight                numeric(6,2)  not null default 1 check (weight >= 0 and weight <= 100),
  active                boolean not null default true,

  -- padrões empresariais de D3 / escopo desta fase §6
  include_in_assisted_management boolean not null default true,
  include_in_monthly_audit       boolean not null default false,

  status          app.catalog_status not null default 'draft',
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  unique (config_id, version_number),
  constraint irc_versions_validity_ck check (effective_to is null or effective_to > effective_from)
);
create index if not exists irc_versions_config_idx
  on public.indicator_regional_config_versions(config_id, version_number);

-- ---------------------------------------------------------------------------
-- 4. Guarda de coerência da configuração regional
-- ---------------------------------------------------------------------------
-- Concentra os invariantes que uma CHECK não alcança porque dependem de junção.
-- Está em gatilho, e não só nas RPCs, porque o escopo desta fase §13 exige
-- imposição NO BANCO: "não depender apenas de testes do cliente".
create or replace function app.guard_regional_config_version() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare
  v_region       uuid;
  v_def          uuid;
  v_iv_def       uuid;
  v_iv_status    app.catalog_status;
  v_direction    app.indicator_direction;
  v_ind_scope    app.scope_kind;
  v_ind_region   uuid;
  v_tv_status    app.catalog_status;
  v_tv_active    boolean;
  v_theme_scope  app.scope_kind;
  v_theme_region uuid;
begin
  select c.region_id, c.indicator_definition_id into v_region, v_def
    from public.indicator_regional_configs c where c.id = new.config_id;

  select iv.definition_id, iv.status, iv.direction, d.scope_kind, d.region_id
    into v_iv_def, v_iv_status, v_direction, v_ind_scope, v_ind_region
    from public.indicator_versions iv
    join public.indicator_definitions d on d.id = iv.definition_id
   where iv.id = new.indicator_version_id;

  select tv.status, tv.active, t.scope_kind, t.region_id
    into v_tv_status, v_tv_active, v_theme_scope, v_theme_region
    from public.theme_versions tv
    join public.themes t on t.id = tv.theme_id
   where tv.id = new.theme_version_id;

  -- A versão configurada tem de ser do indicador que a configuração adotou.
  if v_iv_def is distinct from v_def then
    raise exception 'versao de indicador nao pertence ao indicador configurado'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Nenhuma região opera conteúdo regional de outra. É o coração de A-08.
  if v_ind_scope = 'regional' and v_ind_region is distinct from v_region then
    raise exception 'indicador regional de outra regiao nao pode ser configurado aqui'
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_theme_scope = 'regional' and v_theme_region is distinct from v_region then
    raise exception 'tema regional de outra regiao nao pode ser usado nesta configuracao'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Rascunho pode apontar para coisa ainda não publicada: é rascunho. O que não
  -- pode é ENTRAR EM OPERAÇÃO apoiado em versão que não está publicada.
  if new.status <> 'published' then
    return new;
  end if;

  if v_iv_status <> 'published' then
    raise exception 'versao de indicador nao publicada nao pode entrar em operacao'
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_tv_status <> 'published' or not v_tv_active then
    raise exception 'versao de tema nao publicada ou inativa nao pode receber indicador'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- A-01 AINDA PENDENTE. O enum `app.indicator_direction` tem três valores e a
  -- decisão D2 define regra de status para dois. Um indicador `target_band` NÃO
  -- TEM STATUS CALCULÁVEL hoje. A recusa é explícita e temporária: não se
  -- converte para higher_better nem lower_better, não se inventa faixa, e
  -- nenhum registro histórico é tocado. Cai quando A-01 for decidida.
  if new.include_in_assisted_management and v_direction = 'target_band' then
    raise exception 'direcao target_band sem regra de status definida (pendencia A-01): '
                    'nao e possivel publicar este indicador na Gestao Assistida'
      using errcode = 'feature_not_supported';
  end if;

  if exists (
    select 1 from public.indicator_regional_config_versions v
     where v.config_id = new.config_id
       and v.id <> new.id
       and v.status = 'published'
       and tstzrange(v.effective_from, v.effective_to, '[)')
        && tstzrange(new.effective_from, new.effective_to, '[)')
  ) then
    raise exception 'vigencia sobreposta: ja existe configuracao publicada deste indicador na regiao'
      using errcode = 'exclusion_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_regional_config_version on public.indicator_regional_config_versions;
create trigger trg_regional_config_version
  before insert or update on public.indicator_regional_config_versions
  for each row execute function app.guard_regional_config_version();

-- ---------------------------------------------------------------------------
-- 5. Exclusão protegida quando houver histórico
-- ---------------------------------------------------------------------------
create or replace function app.guard_regional_config_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if exists (
    select 1 from public.indicator_regional_config_versions v
     where v.config_id = old.id and v.status = 'published'
  ) then
    raise exception 'configuracao regional ja publicada: inative a versao em vez de excluir'
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

create or replace function app.guard_regional_config_version_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if old.status = 'published' then
    raise exception 'versao de configuracao publicada nao pode ser excluida: publique uma nova versao'
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

drop trigger if exists trg_guard_regional_config_delete on public.indicator_regional_configs;
create trigger trg_guard_regional_config_delete before delete on public.indicator_regional_configs
  for each row execute function app.guard_regional_config_delete();

drop trigger if exists trg_guard_regional_config_version_delete on public.indicator_regional_config_versions;
create trigger trg_guard_regional_config_version_delete
  before delete on public.indicator_regional_config_versions
  for each row execute function app.guard_regional_config_version_delete();

-- Temas e versões de indicador em uso por configuração publicada passam a estar
-- protegidos também. A 0036 só sabia olhar para as próprias versões — agora há
-- um consumidor.
create or replace function app.guard_theme_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if exists (select 1 from public.theme_versions v where v.theme_id = old.id and v.status = 'published') then
    raise exception 'tema % ja publicado: inative em vez de excluir', old.code
      using errcode = 'integrity_constraint_violation';
  end if;
  if exists (
    select 1
      from public.indicator_regional_config_versions cv
      join public.theme_versions v on v.id = cv.theme_version_id
     where v.theme_id = old.id
  ) then
    raise exception 'tema % em uso por configuracao regional: inative em vez de excluir', old.code
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

create or replace function app.guard_theme_version_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if old.status = 'published' then
    raise exception 'versao de tema publicada nao pode ser excluida: publique uma nova versao'
      using errcode = 'integrity_constraint_violation';
  end if;
  if exists (select 1 from public.indicator_regional_config_versions cv where cv.theme_version_id = old.id) then
    raise exception 'versao de tema em uso por configuracao regional nao pode ser excluida'
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

-- `app.guard_indicator_delete` (0003) já barra indicador MEDIDO. Ganha o novo
-- consumidor: indicador adotado por alguma região não é apagado.
create or replace function app.guard_indicator_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if exists (
    select 1 from public.measurements m
    join public.indicator_versions v on v.id = m.indicator_version_id
    where v.definition_id = old.id
  ) then
    raise exception 'indicador % ja utilizado: inative para novas avaliacoes, nao exclua',
      old.code using errcode = 'integrity_constraint_violation';
  end if;
  if exists (select 1 from public.indicator_regional_configs c where c.indicator_definition_id = old.id) then
    raise exception 'indicador % configurado por alguma regiao: inative em vez de excluir',
      old.code using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

create or replace function app.guard_indicator_version_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if exists (select 1 from public.measurements m where m.indicator_version_id = old.id) then
    raise exception 'versao de indicador ja medida nao pode ser excluida'
      using errcode = 'integrity_constraint_violation';
  end if;
  if exists (
    select 1 from public.indicator_regional_config_versions cv where cv.indicator_version_id = old.id
  ) then
    raise exception 'versao de indicador em uso por configuracao regional nao pode ser excluida'
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
-- Indicador global permanece legível por qualquer autenticado (comportamento de
-- 0002, `ind_def_read using (true)`); indicador REGIONAL passa a exigir alcance
-- de região. A policy nova SUBSTITUI a antiga: mantê-la deixaria o `using (true)`
-- valer por OR e a fronteira regional não existiria.
drop policy if exists ind_def_read on public.indicator_definitions;
create policy ind_def_read on public.indicator_definitions for select to authenticated
  using (scope_kind = 'global' or app.reaches_region(region_id));

drop policy if exists ind_ver_read on public.indicator_versions;
create policy ind_ver_read on public.indicator_versions for select to authenticated
  using (exists (
    select 1 from public.indicator_definitions d
     where d.id = definition_id
       and (d.scope_kind = 'global' or app.reaches_region(d.region_id))
  ));

-- As policies de ESCRITA `ind_def_admin`/`ind_ver_admin` (0002) permanecem como
-- estão: escrita direta continua sendo só do ADMIN. A autoridade regional existe
-- pelas RPCs `catalog_*`, que são `security definer` e verificam a região. Um
-- regional NÃO ganha escrita direta por PostgREST — é o servidor que decide.

alter table public.indicator_regional_configs         enable row level security;
alter table public.indicator_regional_configs         force  row level security;
alter table public.indicator_regional_config_versions enable row level security;
alter table public.indicator_regional_config_versions force  row level security;

drop policy if exists irc_scoped_read on public.indicator_regional_configs;
create policy irc_scoped_read on public.indicator_regional_configs for select to authenticated
  using (app.reaches_region(region_id));

drop policy if exists irc_versions_scoped_read on public.indicator_regional_config_versions;
create policy irc_versions_scoped_read on public.indicator_regional_config_versions for select to authenticated
  using (exists (
    select 1 from public.indicator_regional_configs c
     where c.id = config_id and app.reaches_region(c.region_id)
  ));

revoke all on table public.indicator_regional_configs         from anon, public;
revoke all on table public.indicator_regional_config_versions from anon, public;
revoke insert, update, delete, truncate on table public.indicator_regional_configs         from authenticated;
revoke insert, update, delete, truncate on table public.indicator_regional_config_versions from authenticated;
grant select on table public.indicator_regional_configs         to authenticated;
grant select on table public.indicator_regional_config_versions to authenticated;

-- ---------------------------------------------------------------------------
-- 7. DTOs internos
-- ---------------------------------------------------------------------------
-- `app.indicator_dto` (0006) continua servindo o Admin legado por `ui_indicators`.
-- Este é o DTO do catálogo 1.3.5, com escopo e semântica versionada.
create or replace function app.catalog_indicator_dto(p_id uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id',        d.id,
    'code',      d.code,
    'name',      d.name,
    'scopeKind', d.scope_kind,
    'regionId',  d.region_id,
    'lifecycle', d.lifecycle,
    'createdAt', d.created_at,
    'versions',  coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',            v.id,
               'versionNumber', v.version_number,
               'name',          coalesce(v.name, d.name),
               'description',   v.description,
               'unit',          v.unit,
               'direction',     v.direction,
               'status',        v.status,
               'effectiveFrom', v.effective_from,
               'effectiveTo',   v.effective_to
             ) order by v.version_number)
        from public.indicator_versions v where v.definition_id = d.id
    ), '[]'::jsonb)
  )
  from public.indicator_definitions d where d.id = p_id
$$;

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
    ), '[]'::jsonb)
  )
  from public.indicator_regional_configs c
  join public.indicator_definitions d on d.id = c.indicator_definition_id
 where c.id = p_id
$$;

revoke all on function app.catalog_indicator_dto(uuid) from public, anon, authenticated;
revoke all on function app.regional_config_dto(uuid)   from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPCs de indicador com escopo
-- ---------------------------------------------------------------------------
-- Mesma ordem da 0036: ator -> registro -> autoridade -> estado -> efeito, com
-- "inexistente" e "fora do escopo" indistinguíveis.
--
-- `target`, `yellow_tolerance` e `weight` são colunas `not null` de 0001 e
-- continuam existindo (ADR-135-001, decisão D-D). Aqui elas recebem valor
-- neutro: a partir de 1.3.5 O VALOR OPERATIVO É O DA CONFIGURAÇÃO REGIONAL, e
-- ninguém deve lê-las como meta. Removê-las seria destrutivo; sobrescrevê-las de
-- fora da região seria mentira.
create or replace function public.catalog_create_indicator(
  p_scope     text,
  p_region_id uuid,
  p_code      text,
  p_payload   jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_scope  app.scope_kind;
  v_region uuid;
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_name   text := btrim(coalesce(p_payload->>'name', ''));
  v_dir    app.indicator_direction;
  v_id     uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  begin
    v_scope := coalesce(nullif(btrim(coalesce(p_scope, '')), ''), 'global')::app.scope_kind;
  exception when others then
    raise exception 'escopo invalido: use global ou regional' using errcode = 'check_violation';
  end;

  v_region := case when v_scope = 'regional' then p_region_id else null end;
  if v_scope = 'regional' and v_region is null then
    raise exception 'indicador regional exige regiao' using errcode = 'check_violation';
  end if;

  if not app.can_manage_catalog(v_region) then
    raise exception 'sem permissao para administrar o catalogo desta regiao'
      using errcode = 'insufficient_privilege';
  end if;

  if v_scope = 'regional' and not exists (select 1 from public.regions where id = v_region) then
    raise exception 'sem permissao para administrar o catalogo desta regiao'
      using errcode = 'insufficient_privilege';
  end if;

  if v_code = '' or v_name = '' then
    raise exception 'codigo e nome sao obrigatorios' using errcode = 'check_violation';
  end if;

  begin
    v_dir := coalesce(nullif(p_payload->>'direction', ''), 'higher_better')::app.indicator_direction;
  exception when others then
    raise exception 'direcao invalida' using errcode = 'check_violation';
  end;

  if exists (select 1 from public.indicator_definitions d where d.code = v_code) then
    raise exception 'ja existe um indicador com o codigo %', v_code
      using errcode = 'unique_violation';
  end if;

  insert into public.indicator_definitions (code, name, scope_kind, region_id, lifecycle, created_by)
    values (v_code, v_name, v_scope, v_region, 'draft', v_uid)
    returning id into v_id;

  insert into public.indicator_versions
    (definition_id, version_number, name, description, unit, direction,
     target, yellow_tolerance, weight, status, created_by)
    values (
      v_id, 1, v_name, nullif(btrim(coalesce(p_payload->>'description','')), ''),
      coalesce(nullif(p_payload->>'unit',''), '%'), v_dir,
      0, 0, 1,                                    -- ver decisão D-D acima
      'draft', v_uid
    );

  return app.catalog_indicator_dto(v_id);
end $$;

create or replace function public.catalog_add_indicator_version(
  p_indicator_id uuid,
  p_payload      jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_region uuid;
  v_scope  app.scope_kind;
  v_name   text := btrim(coalesce(p_payload->>'name', ''));
  v_dir    app.indicator_direction;
  v_next   int;
  v_from   timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select scope_kind, region_id into v_scope, v_region
    from public.indicator_definitions where id = p_indicator_id;

  if v_scope is null or not app.can_manage_catalog(v_region) then
    raise exception 'indicador inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if v_name = '' then
    raise exception 'nome e obrigatorio' using errcode = 'check_violation';
  end if;

  begin
    v_dir := coalesce(nullif(p_payload->>'direction', ''), 'higher_better')::app.indicator_direction;
  exception when others then
    raise exception 'direcao invalida' using errcode = 'check_violation';
  end;

  begin
    v_from := coalesce(nullif(p_payload->>'effectiveFrom', '')::timestamptz, now());
  exception when others then
    raise exception 'vigencia invalida: use o formato AAAA-MM-DD' using errcode = 'check_violation';
  end;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.indicator_versions where definition_id = p_indicator_id;

  insert into public.indicator_versions
    (definition_id, version_number, name, description, unit, direction,
     target, yellow_tolerance, weight, status, effective_from, created_by)
    values (
      p_indicator_id, v_next, v_name,
      nullif(btrim(coalesce(p_payload->>'description','')), ''),
      coalesce(nullif(p_payload->>'unit',''), '%'), v_dir,
      0, 0, 1, 'draft', v_from, v_uid
    );

  return app.catalog_indicator_dto(p_indicator_id);
end $$;

create or replace function public.catalog_publish_indicator_version(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_def    uuid;
  v_region uuid;
  v_status app.catalog_status;
  v_from   timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select v.definition_id, d.region_id, v.status, v.effective_from
    into v_def, v_region, v_status, v_from
    from public.indicator_versions v
    join public.indicator_definitions d on d.id = v.definition_id
   where v.id = p_version_id;

  if v_def is null or not app.can_manage_catalog(v_region) then
    raise exception 'versao de indicador inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  if v_status = 'published' then
    return app.catalog_indicator_dto(v_def);     -- idempotência
  end if;

  update public.indicator_versions
     set effective_to = v_from
   where definition_id = v_def
     and id <> p_version_id
     and status = 'published'
     and effective_to is null
     and effective_from <= v_from;

  update public.indicator_versions set status = 'published' where id = p_version_id;
  update public.indicator_definitions set lifecycle = 'active'
   where id = v_def and lifecycle = 'draft';

  return app.catalog_indicator_dto(v_def);
end $$;

create or replace function public.catalog_set_indicator_lifecycle(
  p_indicator_id uuid,
  p_lifecycle    text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_region uuid;
  v_scope  app.scope_kind;
  v_next   app.indicator_lifecycle;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select scope_kind, region_id into v_scope, v_region
    from public.indicator_definitions where id = p_indicator_id;
  if v_scope is null or not app.can_manage_catalog(v_region) then
    raise exception 'indicador inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  begin
    v_next := p_lifecycle::app.indicator_lifecycle;
  exception when others then
    raise exception 'situacao invalida: use active ou inactive' using errcode = 'check_violation';
  end;

  if v_next = 'draft' then
    raise exception 'situacao invalida: use active ou inactive' using errcode = 'check_violation';
  end if;

  update public.indicator_definitions set lifecycle = v_next where id = p_indicator_id;
  return app.catalog_indicator_dto(p_indicator_id);
end $$;

-- ---------------------------------------------------------------------------
-- 9. RPCs de configuração regional
-- ---------------------------------------------------------------------------
-- Cria (ou reaproveita) a identidade da configuração e grava uma VERSÃO EM
-- RASCUNHO. Reabrir a mesma adoção não cria uma segunda identidade — a unicidade
-- `(region_id, indicator_definition_id)` é do banco.
create or replace function public.catalog_save_regional_config_draft(
  p_region_id    uuid,
  p_indicator_id uuid,
  p_payload      jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid       uuid;
  v_scope     app.scope_kind;
  v_ind_reg   uuid;
  v_config    uuid;
  v_next      int;
  v_from      timestamptz;
  v_iv        uuid := nullif(p_payload->>'indicatorVersionId','')::uuid;
  v_tv        uuid := nullif(p_payload->>'themeVersionId','')::uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  if p_region_id is null then
    raise exception 'configuracao operacional exige regiao' using errcode = 'check_violation';
  end if;

  if not app.can_manage_catalog(p_region_id) then
    raise exception 'sem permissao para administrar o catalogo desta regiao'
      using errcode = 'insufficient_privilege';
  end if;

  select scope_kind, region_id into v_scope, v_ind_reg
    from public.indicator_definitions where id = p_indicator_id;

  -- Indicador de outra região e indicador inexistente respondem a mesma coisa.
  if v_scope is null or (v_scope = 'regional' and v_ind_reg is distinct from p_region_id) then
    raise exception 'indicador inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if v_iv is null or v_tv is null then
    raise exception 'versao do indicador e versao do tema sao obrigatorias'
      using errcode = 'check_violation';
  end if;

  begin
    v_from := coalesce(nullif(p_payload->>'effectiveFrom', '')::timestamptz, now());
  exception when others then
    raise exception 'vigencia invalida: use o formato AAAA-MM-DD' using errcode = 'check_violation';
  end;

  insert into public.indicator_regional_configs (region_id, indicator_definition_id, created_by)
    values (p_region_id, p_indicator_id, v_uid)
    on conflict (region_id, indicator_definition_id) do nothing;

  select id into v_config from public.indicator_regional_configs
   where region_id = p_region_id and indicator_definition_id = p_indicator_id;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.indicator_regional_config_versions where config_id = v_config;

  -- Os DOIS defaults empresariais (D3): nasce na Gestão Assistida, fora da
  -- Auditoria Mensal. `coalesce` sobre o payload preserva o default quando o
  -- cliente simplesmente não fala do campo.
  insert into public.indicator_regional_config_versions (
    config_id, version_number, indicator_version_id, theme_version_id,
    sort_order, target, tolerance, weight, active,
    include_in_assisted_management, include_in_monthly_audit,
    status, effective_from, created_by
  ) values (
    v_config, v_next, v_iv, v_tv,
    coalesce((p_payload->>'sortOrder')::int, 0),
    coalesce((p_payload->>'target')::numeric, 0),
    coalesce((p_payload->>'tolerance')::numeric, 0),
    coalesce((p_payload->>'weight')::numeric, 1),
    coalesce((p_payload->>'active')::boolean, true),
    coalesce((p_payload->>'includeInAssistedManagement')::boolean, true),
    coalesce((p_payload->>'includeInMonthlyAudit')::boolean, false),
    'draft', v_from, v_uid
  );

  return app.regional_config_dto(v_config);
end $$;

create or replace function public.catalog_publish_regional_config_version(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_config uuid;
  v_region uuid;
  v_status app.catalog_status;
  v_from   timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select v.config_id, c.region_id, v.status, v.effective_from
    into v_config, v_region, v_status, v_from
    from public.indicator_regional_config_versions v
    join public.indicator_regional_configs c on c.id = v.config_id
   where v.id = p_version_id;

  if v_config is null or not app.can_manage_catalog(v_region) then
    raise exception 'configuracao inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if v_status = 'published' then
    return app.regional_config_dto(v_config);    -- idempotência
  end if;

  update public.indicator_regional_config_versions
     set effective_to = v_from
   where config_id = v_config
     and id <> p_version_id
     and status = 'published'
     and effective_to is null
     and effective_from <= v_from;

  -- O gatilho `trg_regional_config_version` valida tudo aqui: versões
  -- publicadas, coerência de região, bloqueio de target_band e sobreposição de
  -- vigência. A RPC não repete a regra — o banco é a autoridade.
  update public.indicator_regional_config_versions set status = 'published' where id = p_version_id;

  return app.regional_config_dto(v_config);
end $$;

-- ---------------------------------------------------------------------------
-- 10. Ajustes no caminho ADMINISTRATIVO LEGADO
-- ---------------------------------------------------------------------------
-- `admin_update_indicator` (0022) NÃO precisa mudar: como o código continua
-- único em todo o catálogo (decisão D-E), a verificação de duplicidade que ela
-- já faz sobre a tabela inteira permanece exata.
--
-- `admin_delete_indicator` (0022) ganha a recusa explícita para indicador
-- adotado por região, ANTES de tentar apagar versão nenhuma — mesmo motivo pelo
-- qual as outras duas recusas dela vêm antes: mensagem melhor, e nada escrito.
create or replace function public.admin_delete_indicator(p_indicator_id uuid) returns void
  language plpgsql security definer set search_path = public, app as $$
declare v_code text;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from public.indicator_definitions where id = p_indicator_id;
  if v_code is null then
    raise exception 'indicador inexistente';
  end if;

  if exists (
    select 1
      from public.measurements m
      join public.indicator_versions v on v.id = m.indicator_version_id
     where v.definition_id = p_indicator_id
  ) then
    raise exception 'indicador % ja medido: inative para novas avaliacoes, nao exclua', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  if exists (select 1 from public.indicator_results where indicator_id = p_indicator_id) then
    raise exception 'indicador % ja tem resultado lancado: inative em vez de excluir', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  if exists (select 1 from public.indicator_regional_configs c where c.indicator_definition_id = p_indicator_id) then
    raise exception 'indicador % configurado por alguma regiao: inative em vez de excluir', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  delete from public.indicator_versions   where definition_id = p_indicator_id;
  delete from public.indicator_definitions where id = p_indicator_id;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Projeção `ui_indicators` estendida
-- ---------------------------------------------------------------------------
-- Ganha escopo e região; as colunas anteriores permanecem com o mesmo nome, na
-- MESMA ORDEM e com o mesmo significado, para não quebrar `app.indicator_dto`
-- nem o Admin atual.
--
-- As três colunas novas vão no FIM por exigência do PostgreSQL: `create or
-- replace view` só aceita acrescentar colunas ao final — inserir no meio é
-- lido como renomear coluna existente e o comando é recusado.
--
-- `regionalConfigCount` existe para a interface conseguir dizer "este indicador
-- é usado por N regiões" sem uma segunda consulta.
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
        'effectiveFrom',   v.effective_from,
        'status',          v.status,
        'name',            coalesce(v.name, d.name),
        'description',     v.description
      ) order by v.version_number
    )
    from public.indicator_versions v
    where v.definition_id = d.id
  ), '[]'::jsonb)                             as "versions",
  d.scope_kind                                as "scopeKind",
  d.region_id                                 as "regionId",
  (
    select count(*)::int
    from public.indicator_regional_configs c
    where c.indicator_definition_id = d.id
  )                                           as "regionalConfigCount"
from public.indicator_definitions d;

grant select on public.ui_indicators to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Grants mínimos
-- ---------------------------------------------------------------------------
revoke all on function public.catalog_create_indicator(text, uuid, text, jsonb)     from public, anon;
revoke all on function public.catalog_add_indicator_version(uuid, jsonb)            from public, anon;
revoke all on function public.catalog_publish_indicator_version(uuid)               from public, anon;
revoke all on function public.catalog_set_indicator_lifecycle(uuid, text)           from public, anon;
revoke all on function public.catalog_save_regional_config_draft(uuid, uuid, jsonb) from public, anon;
revoke all on function public.catalog_publish_regional_config_version(uuid)         from public, anon;

grant execute on function public.catalog_create_indicator(text, uuid, text, jsonb)     to authenticated;
grant execute on function public.catalog_add_indicator_version(uuid, jsonb)            to authenticated;
grant execute on function public.catalog_publish_indicator_version(uuid)               to authenticated;
grant execute on function public.catalog_set_indicator_lifecycle(uuid, text)           to authenticated;
grant execute on function public.catalog_save_regional_config_draft(uuid, uuid, jsonb) to authenticated;
grant execute on function public.catalog_publish_regional_config_version(uuid)         to authenticated;
