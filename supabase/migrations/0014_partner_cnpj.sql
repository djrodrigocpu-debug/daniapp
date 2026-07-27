-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0014: CNPJ dos Parceiros AACE
-- =============================================================================
-- O CNPJ é dado CADASTRAL da empresa avaliada, não credencial. Parceiro não tem
-- login nesta fase: nada aqui cria identidade em `auth.users`, perfil em
-- `public.users` ou escopo em `public.user_scopes`. A entidade canônica do
-- parceiro é `public.operations` (confirmado no schema, na view administrativa
-- `ui_admin_partners` e nas três RPCs de parceiro da 0009).
--
-- ADITIVA: a coluna nasce NULL e os registros existentes permanecem válidos sem
-- nenhuma escrita automática. Não inventamos CNPJ para linha antiga — um número
-- de inscrição errado é pior que a ausência dele.
--
-- UNICIDADE: `(unit_id, cnpj)`, espelhando a chave que o domínio já usa para o
-- escritório. Unicidade GLOBAL seria errada aqui: o domínio já decidiu, em
-- `operations_unit_office_norm_uidx`, que a identidade do parceiro é escopada
-- pela unidade, e o mesmo grupo empresarial pode atender unidades diferentes.
-- O índice de escritório NÃO é removido nem substituído — os dois convivem.
--
-- As migrations 0001–0013 não são alteradas (§28).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Helpers de CNPJ no schema `app` (privados: sem EXECUTE para anon/public)
-- ---------------------------------------------------------------------------

/** Somente dígitos. Aceita `12.345.678/0001-95` ou `12345678000195`. */
create or replace function app.normalize_cnpj(p text) returns text
  language sql immutable parallel safe
  set search_path = ''
as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')
$$;

/**
 * Valida os dois dígitos verificadores (módulo 11) e recusa sequências
 * repetidas — 00.000.000/0000-00 passa no módulo 11 e precisa de recusa
 * explícita, senão vira o "CNPJ coringa" de quem não tem o número em mãos.
 */
create or replace function app.is_valid_cnpj(p text) returns boolean
  language plpgsql immutable parallel safe
  set search_path = ''
as $$
declare
  d      text := app.normalize_cnpj(p);
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  soma   int;
  resto  int;
  dv     int;
  i      int;
begin
  if d is null or length(d) <> 14 then return false; end if;
  if d ~ '^(.)\1{13}$' then return false; end if;

  soma := 0;
  for i in 1..12 loop
    soma := soma + substr(d, i, 1)::int * pesos1[i];
  end loop;
  resto := soma % 11;
  dv := case when resto < 2 then 0 else 11 - resto end;
  if dv <> substr(d, 13, 1)::int then return false; end if;

  soma := 0;
  for i in 1..13 loop
    soma := soma + substr(d, i, 1)::int * pesos2[i];
  end loop;
  resto := soma % 11;
  dv := case when resto < 2 then 0 else 11 - resto end;
  return dv = substr(d, 14, 1)::int;
end $$;

revoke all on function app.normalize_cnpj(text) from public, anon;
revoke all on function app.is_valid_cnpj(text) from public, anon;

-- `authenticated` PRECISA de EXECUTE: a CHECK abaixo é avaliada no papel de quem
-- escreve, não no dono da tabela. Sem este grant, qualquer INSERT/UPDATE em
-- `public.operations` feito por um administrador falharia com
-- "permission denied for function is_valid_cnpj" — inclusive nos caminhos que
-- nada têm a ver com CNPJ. É o mesmo motivo pelo qual a 0008 concedeu EXECUTE
-- nas funções `app.*` usadas por views e políticas. `anon` continua de fora.
grant execute on function app.normalize_cnpj(text) to authenticated;
grant execute on function app.is_valid_cnpj(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Coluna + CHECK + índice único parcial
-- ---------------------------------------------------------------------------
alter table public.operations
  add column if not exists cnpj text;

-- O banco guarda SOMENTE 14 dígitos. Formatação é assunto do cliente.
alter table public.operations
  drop constraint if exists operations_cnpj_valid;
alter table public.operations
  add constraint operations_cnpj_valid
  check (cnpj is null or (cnpj ~ '^[0-9]{14}$' and app.is_valid_cnpj(cnpj)));

-- Mesmo CNPJ pode existir em unidades diferentes; na MESMA unidade, não.
create unique index if not exists operations_unit_cnpj_uidx
  on public.operations (unit_id, cnpj)
  where cnpj is not null;

comment on column public.operations.cnpj is
  'CNPJ da empresa parceira, somente 14 digitos. NULL para registros legados. Dado cadastral, nunca credencial.';

-- ---------------------------------------------------------------------------
-- 3) Projeção administrativa — `cnpj` entra NO FIM para não deslocar colunas
--    de nenhum consumidor existente.
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
  o.updated_at                  as "updatedAt",
  o.cnpj                        as "cnpj"
from public.operations o
join public.units u          on u.id = o.unit_id
join public.regions r        on r.id = u.region_id
join public.coordinations c  on c.id = o.coordination_id
left join public.users cu    on cu.id = c.coordinator_user_id
left join public.users gu    on gu.id = o.channel_manager_user_id;

grant select on public.ui_admin_partners to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Criação de Parceiro AACE — CNPJ obrigatório a partir daqui
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
  v_cnpj    text := app.normalize_cnpj(coalesce(p_input->>'cnpj',''));
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

  -- CNPJ: obrigatório para todo parceiro criado a partir da 0014. A mensagem
  -- não ecoa o valor recebido — entrada inválida pode ser lixo colado.
  if v_cnpj = '' then
    raise exception 'CNPJ e obrigatorio para novo parceiro' using errcode = 'check_violation';
  end if;
  if not app.is_valid_cnpj(v_cnpj) then
    raise exception 'CNPJ invalido' using errcode = 'check_violation';
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

  -- Unicidade do CNPJ DENTRO da unidade (o mesmo CNPJ vale em outra unidade).
  if exists (select 1 from public.operations o
              where o.unit_id = v_unit_id and o.cnpj = v_cnpj) then
    raise exception 'CNPJ ja cadastrado nesta unidade' using errcode = 'unique_violation';
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
    (unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id, active, cnpj)
  values
    (v_unit_id, v_coordination_id, v_partner, v_office, v_city, v_state, v_gc, v_active, v_cnpj)
  returning id into v_id;

  perform app.sync_operation_assignment(v_id, v_gc);

  return app.partner_dto(v_id) || jsonb_build_object('warnings', v_warnings);
end $$;

-- ---------------------------------------------------------------------------
-- 5) Edição de Parceiro AACE — CNPJ só muda quando a chave vem no patch
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
  v_cnpj text;
  v_warnings jsonb := '[]'::jsonb;
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

  -- CNPJ: só é tocado quando a CHAVE vem no patch. Ausente => preserva o atual,
  -- para que editar a cidade de um legado não o obrigue a ganhar CNPJ.
  -- Presente e vazio => RECUSA: apagar um CNPJ já gravado precisa ser uma ação
  -- deliberada, nunca efeito colateral de um formulário com campo em branco.
  if p_patch ? 'cnpj' then
    v_cnpj := app.normalize_cnpj(coalesce(p_patch->>'cnpj',''));
    if v_cnpj = '' then
      if v_cur.cnpj is null then
        v_cnpj := null;  -- legado continua legado; nada a apagar
      else
        raise exception 'para remover o CNPJ use a administracao; o campo vazio nao apaga o valor atual'
          using errcode = 'check_violation';
      end if;
    elsif not app.is_valid_cnpj(v_cnpj) then
      raise exception 'CNPJ invalido' using errcode = 'check_violation';
    end if;
  else
    v_cnpj := v_cur.cnpj;
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

  -- Unicidade do CNPJ na unidade de DESTINO: vale tanto ao trocar o CNPJ quanto
  -- ao mover o parceiro de unidade mantendo o mesmo número.
  if v_cnpj is not null and exists (
        select 1 from public.operations o
         where o.unit_id = v_unit_id and o.cnpj = v_cnpj and o.id <> p_id) then
    raise exception 'CNPJ ja cadastrado nesta unidade' using errcode = 'unique_violation';
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
    active = v_active,
    cnpj = v_cnpj
  where id = p_id;

  perform app.sync_operation_assignment(p_id, v_gc);

  if v_cnpj is null then
    v_warnings := v_warnings || to_jsonb('Registro legado ainda sem CNPJ.'::text);
  end if;

  return app.partner_dto(p_id) || jsonb_build_object('warnings', v_warnings);
end $$;

-- ---------------------------------------------------------------------------
-- 6) Permissões — idênticas às da 0009.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_create_operation(jsonb) from public, anon;
revoke all on function public.admin_update_operation(uuid, jsonb) from public, anon;
grant execute on function public.admin_create_operation(jsonb) to authenticated;
grant execute on function public.admin_update_operation(uuid, jsonb) to authenticated;
