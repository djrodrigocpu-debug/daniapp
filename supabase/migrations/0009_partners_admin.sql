-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0009: Parceiros AACE (cadastro + importador)
-- =============================================================================
-- Habilita o cadastro administrativo de Parceiros AACE sobre public.operations:
--   1. app.normalize_text — normalização imutável (base de unicidade/idempotência);
--   2. índices únicos normalizados (idempotência e segurança contra concorrência
--      na auto-criação de estrutura organizacional pelo importador);
--   3. CHECK: parceiro ativo exige GC vinculado;
--   4. projeção administrativa ui_admin_partners (security_invoker);
--   5. RPCs admin_create_operation / admin_update_operation / admin_import_partners
--      (SECURITY DEFINER, search_path vazio, autorização app.is_admin() no corpo).
-- Mínimo privilégio: authenticated recebe EXECUTE somente nas 3 RPCs públicas;
-- helpers app.* permanecem sem EXECUTE para public/anon/authenticated e são
-- executados pelas RPCs como proprietárias.
-- Reversão: ver supabase/rollback/0001_core_schema.down.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Normalização imutável: lower + trim + colapso de espaços + sem acentos.
--    Sem extensão unaccent (não-imutável e indisponível no harness PGlite):
--    translate com mapeamento 1:1 dos caracteres acentuados do PT-BR.
-- ---------------------------------------------------------------------------
create or replace function app.normalize_text(p text) returns text
  language sql immutable parallel safe
  set search_path = ''
as $$
  select regexp_replace(
    lower(btrim(translate(coalesce(p, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))),
    '\s+', ' ', 'g')
$$;

-- ---------------------------------------------------------------------------
-- 2) Unicidade normalizada.
--    operations: um escritório por unidade (chave idempotente do importador).
--    organizations/regions/units/coordinations: tornam a auto-criação do
--    importador idempotente e segura sob concorrência (insert on conflict).
-- ---------------------------------------------------------------------------
create unique index if not exists operations_unit_office_norm_uidx
  on public.operations (unit_id, app.normalize_text(office_name));

create unique index if not exists organizations_name_norm_uidx
  on public.organizations (app.normalize_text(name));

create unique index if not exists regions_org_name_norm_uidx
  on public.regions (organization_id, app.normalize_text(name));

create unique index if not exists units_region_name_norm_uidx
  on public.units (region_id, app.normalize_text(name));

create unique index if not exists coordinations_region_name_norm_uidx
  on public.coordinations (region_id, app.normalize_text(name));

-- ---------------------------------------------------------------------------
-- 3) Parceiro AACE ativo não existe sem Gerente de Canal (regra de negócio
--    garantida no banco — nem insert direto de administrador escapa).
-- ---------------------------------------------------------------------------
alter table public.operations
  add constraint operations_active_requires_gc
  check ((not active) or (channel_manager_user_id is not null));

-- ---------------------------------------------------------------------------
-- 4) Projeção administrativa: ui_operations não expõe unidade/coordenação.
--    security_invoker: a RLS de operations filtra pelo papel do consultante
--    (admin vê tudo; demais perfis veem apenas o próprio escopo).
-- ---------------------------------------------------------------------------
create or replace view public.ui_admin_partners
  with (security_invoker = true) as
select
  o.id                          as "id",
  o.partner_name                as "partnerName",
  o.office_name                 as "officeName",
  o.city                        as "city",
  o.state                       as "state",
  o.active                      as "active",
  o.unit_id                     as "unitId",
  u.name                        as "unitName",
  r.id                          as "regionId",
  r.name                        as "regionName",
  o.coordination_id             as "coordinationId",
  c.name                        as "coordinationName",
  c.coordinator_user_id         as "coordinatorId",
  cu.display_name               as "coordinatorName",
  o.channel_manager_user_id     as "managerId",
  gu.display_name               as "managerName",
  gu.corporate_email            as "managerEmail",
  (o.channel_manager_user_id is null) as "managerMissing",
  (c.coordinator_user_id is null)     as "coordinatorMissing",
  o.created_at                  as "createdAt",
  o.updated_at                  as "updatedAt"
from public.operations o
join public.units u          on u.id = o.unit_id
join public.regions r        on r.id = u.region_id
join public.coordinations c  on c.id = o.coordination_id
left join public.users cu    on cu.id = c.coordinator_user_id
left join public.users gu    on gu.id = o.channel_manager_user_id;

grant select on public.ui_admin_partners to authenticated;

-- ---------------------------------------------------------------------------
-- Helper interno: DTO do parceiro (padrão app.user_dto/indicator_dto da 0006).
-- Executado apenas dentro das RPCs DEFINER (sem grant a papéis de cliente).
-- ---------------------------------------------------------------------------
create or replace function app.partner_dto(p_id uuid) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select to_jsonb(v) from public.ui_admin_partners v where v."id" = p_id
$$;

-- ---------------------------------------------------------------------------
-- Helper interno: mantém operation_assignments em sincronia com o GC da
-- operação. A RLS do GC (app.has_operation_access) depende do assignment
-- ativo, não da coluna channel_manager_user_id — todo caminho de escrita
-- passa por aqui. Sem grant a papéis de cliente.
-- ---------------------------------------------------------------------------
create or replace function app.sync_operation_assignment(p_op uuid, p_manager uuid) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  update public.operation_assignments
     set active = false, valid_to = now()
   where operation_id = p_op
     and active
     and (p_manager is null or user_id <> p_manager);

  if p_manager is not null then
    insert into public.operation_assignments (operation_id, user_id, active, valid_from, valid_to)
    values (p_op, p_manager, true, now(), null)
    on conflict (operation_id, user_id)
      do update set active = true, valid_to = null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helper interno: resolve uma pessoa por e-mail corporativo e valida papel/
-- escopo (emenda E2). Retorna o id do usuário ou registra mensagem de erro
-- nominal em p_errors (retornado via out). Compatibilidade de escopo:
--   - papel deve estar ativo e vigente;
--   - escopo com coordination_id: precisa casar com a coordenação da linha;
--   - escopo com region_id: casa por id OU por nome normalizado da região
--     (estruturas homônimas criadas pelo importador coexistem com o seed);
--   - escopo sem region/coordination: compatível (sem restrição declarada).
-- ---------------------------------------------------------------------------
create or replace function app.resolve_scoped_user(
  p_email text,
  p_role app.role_code,
  p_role_label text,
  p_region_id uuid,
  p_region_name text,
  p_coordination_id uuid
) returns table (user_id uuid, error_msg text)
  language plpgsql stable
  set search_path = ''
as $$
declare
  v_id uuid;
  v_status app.user_status;
begin
  select u.id, u.status into v_id, v_status
    from public.users u
   where lower(u.corporate_email) = lower(btrim(p_email));

  if v_id is null then
    return query select null::uuid, p_role_label || ' nao encontrado: ' || lower(btrim(p_email));
    return;
  end if;

  if v_status <> 'active' then
    return query select null::uuid, p_role_label || ' nao esta ativo: ' || lower(btrim(p_email));
    return;
  end if;

  if not exists (
    select 1 from public.user_scopes s
     where s.user_id = v_id and s.role = p_role and s.active
       and (s.valid_to is null or s.valid_to > now())
  ) then
    return query select null::uuid, 'E-mail nao tem papel de ' || p_role_label || ' ativo: ' || lower(btrim(p_email));
    return;
  end if;

  if not exists (
    select 1 from public.user_scopes s
     where s.user_id = v_id and s.role = p_role and s.active
       and (s.valid_to is null or s.valid_to > now())
       and (
         (s.coordination_id is not null and p_coordination_id is not null
            and s.coordination_id = p_coordination_id)
         or (s.coordination_id is null and (
              s.region_id is null
              or p_region_id is null
              or s.region_id = p_region_id
              or exists (
                select 1 from public.regions r
                 where r.id = s.region_id
                   and app.normalize_text(r.name) = app.normalize_text(p_region_name))))
       )
  ) then
    return query select null::uuid, 'Escopo do ' || p_role_label || ' incompativel com a regiao/coordenacao: ' || lower(btrim(p_email));
    return;
  end if;

  return query select v_id, null::text;
end $$;

-- ---------------------------------------------------------------------------
-- 5a) RPC: criar Parceiro AACE (cadastro manual — NAO auto-cria estrutura).
--     p_input: { partnerName, officeName, city, state,
--                coordinationId | coordinationName, unitId | unitName,
--                managerEmail?, active? }
--     Sem GC resolvido => salvo como inativo (CHECK do banco) + aviso.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_operation(p_input jsonb) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_max constant int := 300;
  v_partner text := regexp_replace(btrim(coalesce(p_input->>'partnerName','')), '\s+', ' ', 'g');
  v_office  text := regexp_replace(btrim(coalesce(p_input->>'officeName','')), '\s+', ' ', 'g');
  v_city    text := regexp_replace(btrim(coalesce(p_input->>'city','')), '\s+', ' ', 'g');
  v_state   text := upper(btrim(coalesce(p_input->>'state','')));
  v_manager_email text := lower(btrim(coalesce(p_input->>'managerEmail','')));
  v_unit_id uuid;
  v_region_id uuid;
  v_region_name text;
  v_coordination_id uuid;
  v_gc uuid;
  v_err text;
  v_active boolean := coalesce((p_input->>'active')::boolean, true);
  v_warnings jsonb := '[]'::jsonb;
  v_id uuid;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;

  if v_partner = '' or v_office = '' or v_city = '' then
    raise exception 'empresa parceira, escritorio e cidade sao obrigatorios' using errcode = 'check_violation';
  end if;
  if length(v_partner) > v_max or length(v_office) > v_max or length(v_city) > v_max then
    raise exception 'campo excede o limite de % caracteres', v_max using errcode = 'check_violation';
  end if;
  if v_state not in ('PR','SC') then
    raise exception 'estado invalido: % (esperado PR ou SC)', v_state using errcode = 'check_violation';
  end if;

  -- Unidade: por id ou por nome normalizado (deve existir).
  if coalesce(p_input->>'unitId','') <> '' then
    select u.id, u.region_id into v_unit_id, v_region_id
      from public.units u where u.id = (p_input->>'unitId')::uuid;
  else
    select u.id, u.region_id into v_unit_id, v_region_id
      from public.units u
     where app.normalize_text(u.name) = app.normalize_text(coalesce(p_input->>'unitName',''));
  end if;
  if v_unit_id is null then
    raise exception 'unidade nao encontrada' using errcode = 'check_violation';
  end if;
  select r.name into v_region_name from public.regions r where r.id = v_region_id;

  -- Coordenacao: por id ou por nome normalizado DENTRO da regiao da unidade.
  if coalesce(p_input->>'coordinationId','') <> '' then
    select c.id into v_coordination_id
      from public.coordinations c where c.id = (p_input->>'coordinationId')::uuid;
    if v_coordination_id is null then
      raise exception 'coordenacao nao encontrada' using errcode = 'check_violation';
    end if;
    -- E3: unidade e coordenacao na mesma regiao.
    if not exists (select 1 from public.coordinations c
                    where c.id = v_coordination_id and c.region_id = v_region_id) then
      raise exception 'unidade e coordenacao pertencem a regioes diferentes' using errcode = 'check_violation';
    end if;
  else
    select c.id into v_coordination_id
      from public.coordinations c
     where c.region_id = v_region_id
       and app.normalize_text(c.name) = app.normalize_text(coalesce(p_input->>'coordinationName',''));
    if v_coordination_id is null then
      raise exception 'coordenacao nao encontrada na regiao da unidade' using errcode = 'check_violation';
    end if;
  end if;

  -- Unicidade: um escritorio por unidade (indice normalizado).
  if exists (select 1 from public.operations o
              where o.unit_id = v_unit_id
                and app.normalize_text(o.office_name) = app.normalize_text(v_office)) then
    raise exception 'escritorio ja cadastrado nesta unidade' using errcode = 'unique_violation';
  end if;

  -- GC (opcional no cadastro manual; validacao E2 quando informado).
  if v_manager_email <> '' then
    if length(v_manager_email) > 254 or v_manager_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'e-mail de GC invalido: %', v_manager_email using errcode = 'check_violation';
    end if;
    select ru.user_id, ru.error_msg into v_gc, v_err
      from app.resolve_scoped_user(v_manager_email, 'channel_manager'::app.role_code, 'GC',
                                   v_region_id, v_region_name, v_coordination_id) ru;
    if v_gc is null then
      raise exception '%', v_err using errcode = 'check_violation';
    end if;
  end if;

  -- E5: parceiro ativo exige GC. Sem GC => salva inativo + aviso.
  if v_gc is null and v_active then
    v_active := false;
    v_warnings := v_warnings || to_jsonb('Sem GC vinculado: parceiro salvo como inativo'::text);
  end if;

  insert into public.operations
    (unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id, active)
  values
    (v_unit_id, v_coordination_id, v_partner, v_office, v_city, v_state, v_gc, v_active)
  returning id into v_id;

  perform app.sync_operation_assignment(v_id, v_gc);

  return app.partner_dto(v_id) || jsonb_build_object('warnings', v_warnings);
end $$;

-- ---------------------------------------------------------------------------
-- 5b) RPC: editar Parceiro AACE (patch parcial; cobre ativar/inativar).
--     Rejeita ativar sem GC (E5). Revalida consistencia regiao (E3).
--     managerEmail presente no patch: '' ou null limpa o GC; valor resolve E2.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_operation(p_id uuid, p_patch jsonb) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_max constant int := 300;
  v_cur public.operations%rowtype;
  v_partner text;
  v_office text;
  v_city text;
  v_state text;
  v_unit_id uuid;
  v_region_id uuid;
  v_region_name text;
  v_coordination_id uuid;
  v_gc uuid;
  v_err text;
  v_active boolean;
  v_manager_email text;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;

  select * into v_cur from public.operations where id = p_id for update;
  if not found then
    raise exception 'parceiro inexistente' using errcode = 'no_data_found';
  end if;

  v_partner := regexp_replace(btrim(coalesce(p_patch->>'partnerName', v_cur.partner_name)), '\s+', ' ', 'g');
  v_office  := regexp_replace(btrim(coalesce(p_patch->>'officeName', v_cur.office_name)), '\s+', ' ', 'g');
  v_city    := regexp_replace(btrim(coalesce(p_patch->>'city', v_cur.city)), '\s+', ' ', 'g');
  v_state   := upper(btrim(coalesce(p_patch->>'state', v_cur.state)));
  v_active  := coalesce((p_patch->>'active')::boolean, v_cur.active);

  if v_partner = '' or v_office = '' or v_city = '' then
    raise exception 'empresa parceira, escritorio e cidade sao obrigatorios' using errcode = 'check_violation';
  end if;
  if length(v_partner) > v_max or length(v_office) > v_max or length(v_city) > v_max then
    raise exception 'campo excede o limite de % caracteres', v_max using errcode = 'check_violation';
  end if;
  if v_state not in ('PR','SC') then
    raise exception 'estado invalido: % (esperado PR ou SC)', v_state using errcode = 'check_violation';
  end if;

  -- Unidade (por id ou nome) — default: a atual.
  if coalesce(p_patch->>'unitId','') <> '' then
    select u.id, u.region_id into v_unit_id, v_region_id
      from public.units u where u.id = (p_patch->>'unitId')::uuid;
  elsif coalesce(p_patch->>'unitName','') <> '' then
    select u.id, u.region_id into v_unit_id, v_region_id
      from public.units u
     where app.normalize_text(u.name) = app.normalize_text(p_patch->>'unitName');
  else
    select u.id, u.region_id into v_unit_id, v_region_id
      from public.units u where u.id = v_cur.unit_id;
  end if;
  if v_unit_id is null then
    raise exception 'unidade nao encontrada' using errcode = 'check_violation';
  end if;
  select r.name into v_region_name from public.regions r where r.id = v_region_id;

  -- Coordenacao (por id ou nome na regiao da unidade) — default: a atual.
  if coalesce(p_patch->>'coordinationId','') <> '' then
    select c.id into v_coordination_id
      from public.coordinations c where c.id = (p_patch->>'coordinationId')::uuid;
    if v_coordination_id is null then
      raise exception 'coordenacao nao encontrada' using errcode = 'check_violation';
    end if;
  elsif coalesce(p_patch->>'coordinationName','') <> '' then
    select c.id into v_coordination_id
      from public.coordinations c
     where c.region_id = v_region_id
       and app.normalize_text(c.name) = app.normalize_text(p_patch->>'coordinationName');
    if v_coordination_id is null then
      raise exception 'coordenacao nao encontrada na regiao da unidade' using errcode = 'check_violation';
    end if;
  else
    v_coordination_id := v_cur.coordination_id;
  end if;

  -- E3: unidade e coordenacao na mesma regiao.
  if not exists (select 1 from public.coordinations c
                  where c.id = v_coordination_id and c.region_id = v_region_id) then
    raise exception 'unidade e coordenacao pertencem a regioes diferentes' using errcode = 'check_violation';
  end if;

  -- Unicidade quando escritorio/unidade mudam.
  if exists (select 1 from public.operations o
              where o.unit_id = v_unit_id
                and app.normalize_text(o.office_name) = app.normalize_text(v_office)
                and o.id <> p_id) then
    raise exception 'escritorio ja cadastrado nesta unidade' using errcode = 'unique_violation';
  end if;

  -- GC: chave presente => substitui ('' / null limpa; valor resolve com E2).
  if p_patch ? 'managerEmail' then
    v_manager_email := lower(btrim(coalesce(p_patch->>'managerEmail','')));
    if v_manager_email = '' then
      v_gc := null;
    else
      if length(v_manager_email) > 254 or v_manager_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'e-mail de GC invalido: %', v_manager_email using errcode = 'check_violation';
      end if;
      select ru.user_id, ru.error_msg into v_gc, v_err
        from app.resolve_scoped_user(v_manager_email, 'channel_manager'::app.role_code, 'GC',
                                     v_region_id, v_region_name, v_coordination_id) ru;
      if v_gc is null then
        raise exception '%', v_err using errcode = 'check_violation';
      end if;
    end if;
  else
    v_gc := v_cur.channel_manager_user_id;
  end if;

  -- E5: ativar exige GC.
  if v_active and v_gc is null then
    raise exception 'parceiro ativo exige GC vinculado' using errcode = 'check_violation';
  end if;

  update public.operations set
    unit_id = v_unit_id,
    coordination_id = v_coordination_id,
    partner_name = v_partner,
    office_name = v_office,
    city = v_city,
    state = v_state,
    channel_manager_user_id = v_gc,
    active = v_active
  where id = p_id;

  perform app.sync_operation_assignment(p_id, v_gc);

  return app.partner_dto(p_id) || jsonb_build_object('warnings', '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 5c) RPC: importador idempotente da planilha (simular/confirmar).
--     p_rows: array de linhas ja parseadas no cliente (re-normalizadas aqui):
--       [{ index, organizationName, regionName, unitName, coordinationName,
--          partnerName, officeName, city, state, coordinatorEmail, managerEmail }]
--     p_commit=false: NENHUMA escrita (simulacao). p_commit=true: grava na
--     transacao da propria funcao, por linha valida; linhas com erro nao
--     abortam as validas (E8). Estruturas ausentes sao auto-criadas de forma
--     idempotente (indices unicos normalizados + on conflict — E6). Pessoas
--     nunca sao criadas: resolucao estrita por e-mail com papel/escopo (E2).
--     Coordenacao com coordenador divergente => erro de linha, sem alterar (E4).
-- ---------------------------------------------------------------------------
create or replace function public.admin_import_partners(p_rows jsonb, p_commit boolean) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_max constant int := 300;
  v_max_rows constant int := 200;
  v_row jsonb;
  v_index int;
  v_org_name text; v_region_name text; v_unit_name text; v_coordination_name text;
  v_partner text; v_office text; v_city text; v_state text;
  v_coord_email text; v_gc_email text;
  v_org_key text; v_region_key text; v_unit_key text; v_coordination_key text; v_office_key text;
  v_org_id uuid; v_region_id uuid; v_unit_id uuid; v_coordination_id uuid;
  v_existing_coordinator uuid;
  v_coord_id uuid; v_gc_id uuid; v_err text;
  v_op_id uuid;
  v_status text; v_action text;
  v_msgs jsonb; v_warns jsonb;
  v_seen text[] := '{}';
  v_seen_key text;
  v_new_orgs jsonb := '{}'::jsonb;
  v_new_regions jsonb := '{}'::jsonb;
  v_new_units jsonb := '{}'::jsonb;
  v_new_coordinations jsonb := '{}'::jsonb;
  v_report jsonb := '[]'::jsonb;
  v_total int := 0; v_inserted int := 0; v_updated int := 0; v_errors int := 0;
  v_created int;
  v_created_actual int := 0;
  v_rc int;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'payload invalido: esperado array de linhas' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_rows) > v_max_rows then
    raise exception 'lote excede o limite de % linhas', v_max_rows using errcode = 'check_violation';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_index := coalesce((v_row->>'index')::int, v_total);
    v_status := 'ok'; v_action := 'insert';
    v_msgs := '[]'::jsonb; v_warns := '[]'::jsonb;
    v_op_id := null;
    v_org_id := null; v_region_id := null; v_unit_id := null; v_coordination_id := null;
    v_coord_id := null; v_gc_id := null;

    begin
      -- 1) Normalizacao de exibicao (preserva acentos) + chaves normalizadas.
      v_org_name          := regexp_replace(btrim(coalesce(v_row->>'organizationName','')), '\s+', ' ', 'g');
      v_region_name       := regexp_replace(btrim(coalesce(v_row->>'regionName','')), '\s+', ' ', 'g');
      v_unit_name         := regexp_replace(btrim(coalesce(v_row->>'unitName','')), '\s+', ' ', 'g');
      v_coordination_name := regexp_replace(btrim(coalesce(v_row->>'coordinationName','')), '\s+', ' ', 'g');
      v_partner           := regexp_replace(btrim(coalesce(v_row->>'partnerName','')), '\s+', ' ', 'g');
      v_office            := regexp_replace(btrim(coalesce(v_row->>'officeName','')), '\s+', ' ', 'g');
      v_city              := regexp_replace(btrim(coalesce(v_row->>'city','')), '\s+', ' ', 'g');
      v_state             := upper(btrim(coalesce(v_row->>'state','')));
      v_coord_email       := lower(btrim(coalesce(v_row->>'coordinatorEmail','')));
      v_gc_email          := lower(btrim(coalesce(v_row->>'managerEmail','')));

      -- 2) Validacao de campos (erros acumulam na linha; nao abortam o lote).
      if v_org_name = ''          then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: organizacao'::text); end if;
      if v_region_name = ''       then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: regiao'::text); end if;
      if v_unit_name = ''         then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: unidade'::text); end if;
      if v_coordination_name = '' then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: coordenacao'::text); end if;
      if v_partner = ''           then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: empresa parceira'::text); end if;
      if v_office = ''            then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: escritorio'::text); end if;
      if v_city = ''              then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: cidade'::text); end if;
      if v_state not in ('PR','SC') then
        v_msgs := v_msgs || to_jsonb(('Estado invalido: ' || coalesce(nullif(v_state,''),'(vazio)') || ' (esperado PR ou SC)')::text);
      end if;
      if length(v_org_name) > v_max or length(v_region_name) > v_max or length(v_unit_name) > v_max
         or length(v_coordination_name) > v_max or length(v_partner) > v_max
         or length(v_office) > v_max or length(v_city) > v_max then
        v_msgs := v_msgs || to_jsonb(('Campo excede o limite de ' || v_max || ' caracteres')::text);
      end if;
      if v_coord_email = '' then
        v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: e-mail do coordenador'::text);
      elsif length(v_coord_email) > 254 or v_coord_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        v_msgs := v_msgs || to_jsonb(('E-mail de coordenador invalido: ' || v_coord_email)::text);
      end if;
      if v_gc_email = '' then
        v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: e-mail do GC'::text);
      elsif length(v_gc_email) > 254 or v_gc_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        v_msgs := v_msgs || to_jsonb(('E-mail de GC invalido: ' || v_gc_email)::text);
      end if;

      if jsonb_array_length(v_msgs) = 0 then
        v_org_key          := app.normalize_text(v_org_name);
        v_region_key       := v_org_key || '|' || app.normalize_text(v_region_name);
        v_unit_key         := v_region_key || '|' || app.normalize_text(v_unit_name);
        v_coordination_key := v_region_key || '|' || app.normalize_text(v_coordination_name);
        v_office_key       := app.normalize_text(v_office);

        -- 3) Resolucao da estrutura (somente leitura; criacao adiada ao commit).
        select o.id into v_org_id from public.organizations o
         where app.normalize_text(o.name) = v_org_key;
        if v_org_id is null and not (v_new_orgs ? v_org_key) then
          v_new_orgs := v_new_orgs || jsonb_build_object(v_org_key, v_org_name);
        end if;

        if v_org_id is not null then
          select r.id into v_region_id from public.regions r
           where r.organization_id = v_org_id
             and app.normalize_text(r.name) = app.normalize_text(v_region_name);
        end if;
        if v_region_id is null and not (v_new_regions ? v_region_key) then
          v_new_regions := v_new_regions || jsonb_build_object(v_region_key, v_region_name);
        end if;

        if v_region_id is not null then
          select u.id into v_unit_id from public.units u
           where u.region_id = v_region_id
             and app.normalize_text(u.name) = app.normalize_text(v_unit_name);
        end if;
        if v_unit_id is null and not (v_new_units ? v_unit_key) then
          v_new_units := v_new_units || jsonb_build_object(v_unit_key, v_unit_name);
        end if;

        v_existing_coordinator := null;
        if v_region_id is not null then
          select c.id, c.coordinator_user_id into v_coordination_id, v_existing_coordinator
            from public.coordinations c
           where c.region_id = v_region_id
             and app.normalize_text(c.name) = app.normalize_text(v_coordination_name);
        end if;
        if v_coordination_id is null and not (v_new_coordinations ? v_coordination_key) then
          v_new_coordinations := v_new_coordinations || jsonb_build_object(v_coordination_key, v_coordination_name);
        end if;

        -- 4) Pessoas (E2) — nunca auto-criadas.
        select ru.user_id, ru.error_msg into v_coord_id, v_err
          from app.resolve_scoped_user(v_coord_email, 'coordinator'::app.role_code, 'Coordenador',
                                       v_region_id, v_region_name, v_coordination_id) ru;
        if v_coord_id is null then v_msgs := v_msgs || to_jsonb(v_err); end if;

        select ru.user_id, ru.error_msg into v_gc_id, v_err
          from app.resolve_scoped_user(v_gc_email, 'channel_manager'::app.role_code, 'GC',
                                       v_region_id, v_region_name, v_coordination_id) ru;
        if v_gc_id is null then v_msgs := v_msgs || to_jsonb(v_err); end if;

        -- E4: coordenacao existente com coordenador divergente => erro nominal.
        if v_coordination_id is not null and v_coord_id is not null
           and v_existing_coordinator is not null and v_existing_coordinator <> v_coord_id then
          v_msgs := v_msgs || to_jsonb(('Coordenacao ' || v_coordination_name
            || ' ja possui coordenador diferente de ' || v_coord_email
            || ' — resolucao manual pelo ADMIN necessaria')::text);
        end if;

        -- 5) Idempotencia / duplicidade.
        v_seen_key := coalesce(v_unit_id::text, 'new:' || v_unit_key) || '#' || v_office_key;
        if v_seen_key = any(v_seen) then
          v_msgs := v_msgs || to_jsonb(('Escritorio duplicado na planilha: ' || v_office
            || ' (unidade ' || v_unit_name || ')')::text);
        else
          v_seen := v_seen || v_seen_key;
        end if;

        if v_unit_id is not null then
          select o.id into v_op_id from public.operations o
           where o.unit_id = v_unit_id
             and app.normalize_text(o.office_name) = v_office_key;
          if v_op_id is not null then
            v_status := 'duplicate';
            v_action := 'update';
          end if;
        end if;
      end if;

      if jsonb_array_length(v_msgs) > 0 then
        v_status := 'error';
        v_action := 'none';
        v_op_id := null;
        v_errors := v_errors + 1;
      else
        -- 6) Escrita (somente commit; simulacao NUNCA grava).
        if p_commit then
          if v_org_id is null then
            insert into public.organizations (name) values (v_org_name)
              on conflict ((app.normalize_text(name))) do nothing;
            get diagnostics v_rc = row_count;
            v_created_actual := v_created_actual + v_rc;
            select o.id into v_org_id from public.organizations o
             where app.normalize_text(o.name) = v_org_key;
          end if;
          if v_region_id is null then
            insert into public.regions (organization_id, name) values (v_org_id, v_region_name)
              on conflict (organization_id, (app.normalize_text(name))) do nothing;
            get diagnostics v_rc = row_count;
            v_created_actual := v_created_actual + v_rc;
            select r.id into v_region_id from public.regions r
             where r.organization_id = v_org_id
               and app.normalize_text(r.name) = app.normalize_text(v_region_name);
          end if;
          if v_unit_id is null then
            insert into public.units (region_id, name) values (v_region_id, v_unit_name)
              on conflict (region_id, (app.normalize_text(name))) do nothing;
            get diagnostics v_rc = row_count;
            v_created_actual := v_created_actual + v_rc;
            select u.id into v_unit_id from public.units u
             where u.region_id = v_region_id
               and app.normalize_text(u.name) = app.normalize_text(v_unit_name);
          end if;
          if v_coordination_id is null then
            insert into public.coordinations (region_id, name, coordinator_user_id)
              values (v_region_id, v_coordination_name, v_coord_id)
              on conflict (region_id, (app.normalize_text(name))) do nothing;
            get diagnostics v_rc = row_count;
            v_created_actual := v_created_actual + v_rc;
            select c.id, c.coordinator_user_id into v_coordination_id, v_existing_coordinator
              from public.coordinations c
             where c.region_id = v_region_id
               and app.normalize_text(c.name) = app.normalize_text(v_coordination_name);
            -- Concorrencia: outra transacao pode ter criado com coordenador
            -- divergente — revalida E4 apos o on conflict.
            if v_existing_coordinator is not null and v_existing_coordinator <> v_coord_id then
              raise exception 'Coordenacao % ja possui coordenador diferente de %',
                v_coordination_name, v_coord_email using errcode = 'check_violation';
            end if;
          elsif v_existing_coordinator is null then
            update public.coordinations set coordinator_user_id = v_coord_id
             where id = v_coordination_id and coordinator_user_id is null;
          end if;

          -- Releitura da operacao com a unidade real (pode ter sido criada agora).
          select o.id into v_op_id from public.operations o
           where o.unit_id = v_unit_id
             and app.normalize_text(o.office_name) = v_office_key;

          if v_op_id is null then
            insert into public.operations
              (unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id, active)
            values
              (v_unit_id, v_coordination_id, v_partner, v_office, v_city, v_state, v_gc_id, true)
            returning id into v_op_id;
            v_status := 'ok'; v_action := 'insert';
            v_inserted := v_inserted + 1;
          else
            update public.operations set
              coordination_id = v_coordination_id,
              partner_name = v_partner,
              office_name = v_office,
              city = v_city,
              state = v_state,
              channel_manager_user_id = v_gc_id
            where id = v_op_id;
            v_status := 'duplicate'; v_action := 'update';
            v_updated := v_updated + 1;
          end if;

          perform app.sync_operation_assignment(v_op_id, v_gc_id);
        else
          if v_status = 'ok' then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
        end if;
      end if;

    exception when others then
      -- Isolamento por linha (E8): erro inesperado vira relatorio, e o bloco
      -- (savepoint implicito do plpgsql) desfaz apenas as escritas DESTA linha.
      v_status := 'error';
      v_action := 'none';
      v_op_id := null;
      v_msgs := v_msgs || to_jsonb(('Erro na linha: ' || sqlerrm)::text);
      v_errors := v_errors + 1;
    end;

    v_report := v_report || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'officeName', v_office,
      'partnerName', v_partner,
      'status', v_status,
      'action', v_action,
      'operationId', v_op_id,
      'messages', v_msgs,
      'warnings', v_warns));
  end loop;

  -- Simulacao: quantas estruturas SERIAM criadas; commit: quantas FORAM criadas
  -- de fato (linhas com erro podem impedir a criacao de estruturas listadas).
  if p_commit then
    v_created := v_created_actual;
  else
    v_created :=
        (select count(*)::int from jsonb_object_keys(v_new_orgs))
      + (select count(*)::int from jsonb_object_keys(v_new_regions))
      + (select count(*)::int from jsonb_object_keys(v_new_units))
      + (select count(*)::int from jsonb_object_keys(v_new_coordinations));
  end if;

  return jsonb_build_object(
    'mode', case when p_commit then 'commit' else 'simulate' end,
    'counters', jsonb_build_object(
      'total', v_total,
      'inserted', v_inserted,
      'updated', v_updated,
      'errors', v_errors,
      'createdEntities', v_created),
    'toCreate', jsonb_build_object(
      'organizations', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_orgs)), '[]'::jsonb),
      'regions', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_regions)), '[]'::jsonb),
      'units', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_units)), '[]'::jsonb),
      'coordinations', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_coordinations)), '[]'::jsonb)),
    'rows', v_report);
end $$;

-- ---------------------------------------------------------------------------
-- 6) Minimo privilegio (E1): EXECUTE somente nas 3 RPCs publicas, e somente
--    para authenticated. Helpers internos ficam sem EXECUTE para papeis de
--    cliente — as RPCs DEFINER os executam como proprietarias.
-- ---------------------------------------------------------------------------
revoke execute on function
  app.normalize_text(text),
  app.partner_dto(uuid),
  app.sync_operation_assignment(uuid, uuid),
  app.resolve_scoped_user(text, app.role_code, text, uuid, text, uuid),
  public.admin_create_operation(jsonb),
  public.admin_update_operation(uuid, jsonb),
  public.admin_import_partners(jsonb, boolean)
from public, anon, authenticated;

grant execute on function
  public.admin_create_operation(jsonb),
  public.admin_update_operation(uuid, jsonb),
  public.admin_import_partners(jsonb, boolean)
to authenticated;

-- EXCECAO COMPROVADA POR TESTE (partners_admin.integration.test.ts): os indices
-- unicos por expressao avaliam app.normalize_text com os privilegios do CALLER
-- durante DML direto ("permission denied for function normalize_text" sem este
-- grant). Como a policy operations_admin_write permite DML direto de admin
-- (papel de banco authenticated), o EXECUTE e tecnicamente indispensavel.
-- A funcao e IMMUTABLE, sem efeitos colaterais e sem acesso a dados.
grant execute on function app.normalize_text(text) to authenticated;
