-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0016: troca obrigatória de senha e origem do parceiro
-- =============================================================================
-- Três coisas independentes que a carga inicial exige:
--
-- 1) ONBOARDING DE SENHA. O provisionamento por planilha entrega uma senha
--    TEMPORÁRIA, conhecida por quem preparou a carga. Ela não pode virar a senha
--    permanente de ninguém. O gate marca quem precisa trocar e só libera quando
--    a troca REALMENTE aconteceu — verificado contra o hash da identidade, não
--    contra a palavra do cliente.
--
--    O hash inicial é guardado para comparação. Não é a senha: é uma cópia do
--    `encrypted_password` que o GoTrue já mantém. Fica em `app`, schema que o
--    PostgREST não expõe, com RLS forçada e SEM política alguma — só funções
--    SECURITY DEFINER alcançam. Nem `authenticated` nem `anon` conseguem ler.
--
-- 2) ORIGEM DO PARCEIRO. `source_code` e `ddd` preservam o Código e o DDD da
--    planilha do canal. São dados cadastrais: não viram login, não criam
--    identidade e não substituem o CNPJ.
--
-- 3) BOOTSTRAP SEM CNPJ. A carga inicial tem 14 parceiros cujo CNPJ não foi
--    fornecido. Ausência é representada como NULL — nunca como 00000000000000
--    ou qualquer sequência artificial, que criaria dado falso, colidiria no
--    índice único e seria recusada pela validação. O importador NORMAL continua
--    exigindo CNPJ válido; o caminho de bootstrap é separado e explícito.
--
-- Migrations 0001–0015 não são alteradas (§28).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Onboarding de senha — tabela protegida
-- ---------------------------------------------------------------------------
create table if not exists app.user_password_onboarding (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  -- Cópia do `encrypted_password` no momento em que a senha temporária foi
  -- definida. Serve só para comparação; nunca é devolvida por nenhuma RPC.
  initial_password_hash text not null,
  required              boolean not null default true,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz
);

alter table app.user_password_onboarding enable row level security;
alter table app.user_password_onboarding force row level security;

-- Sem política alguma, de propósito: a tabela vive no schema `app` (que o
-- PostgREST não expõe) e nenhum papel recebe grant. O único acesso possível é
-- por função SECURITY DEFINER, cujo corpo decide o que devolver.
revoke all on table app.user_password_onboarding from public;
revoke all on table app.user_password_onboarding from anon;
revoke all on table app.user_password_onboarding from authenticated;

comment on table app.user_password_onboarding is
  'Controle da troca obrigatoria da senha temporaria. Guarda o hash inicial apenas para comparacao; nunca expoe hash nem senha.';

-- ---------------------------------------------------------------------------
-- 2) RPC administrativa: marcar quem precisa trocar a senha
-- ---------------------------------------------------------------------------
create or replace function public.admin_require_password_change(p_user_ids uuid[])
  returns jsonb
  language plpgsql security definer
  set search_path = public, app
as $$
declare
  v_id uuid;
  v_hash text;
  v_marcados int := 0;
  v_sem_identidade int := 0;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;
  if p_user_ids is null then
    return jsonb_build_object('marked', 0, 'missingIdentity', 0);
  end if;

  foreach v_id in array p_user_ids loop
    select a.encrypted_password into v_hash from auth.users a where a.id = v_id;
    if v_hash is null then
      -- Identidade inexistente ou sem senha definida: nada a comparar depois.
      v_sem_identidade := v_sem_identidade + 1;
      continue;
    end if;

    insert into app.user_password_onboarding (user_id, initial_password_hash, required, completed_at)
    values (v_id, v_hash, true, null)
    on conflict (user_id) do update
      set initial_password_hash = excluded.initial_password_hash,
          required = true,
          completed_at = null;
    v_marcados := v_marcados + 1;
  end loop;

  -- O hash NÃO sai daqui.
  return jsonb_build_object('marked', v_marcados, 'missingIdentity', v_sem_identidade);
end $$;

-- ---------------------------------------------------------------------------
-- 3) RPC do próprio usuário: preciso trocar a senha?
-- ---------------------------------------------------------------------------
create or replace function public.password_change_status()
  returns jsonb
  language plpgsql security definer
  set search_path = public, app
as $$
declare v_required boolean;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- A identidade vem SEMPRE de auth.uid(): o cliente não informa de quem é o
  -- estado que está consultando.
  select o.required into v_required
    from app.user_password_onboarding o
   where o.user_id = auth.uid();

  -- Conta antiga, fora de qualquer carga: nunca foi marcada, logo não precisa.
  return jsonb_build_object('required', coalesce(v_required, false));
end $$;

-- ---------------------------------------------------------------------------
-- 4) RPC do próprio usuário: concluir a troca inicial
-- ---------------------------------------------------------------------------
create or replace function public.complete_initial_password_change()
  returns jsonb
  language plpgsql security definer
  set search_path = public, app
as $$
declare
  v_atual text;
  v_inicial text;
  v_required boolean;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select o.initial_password_hash, o.required into v_inicial, v_required
    from app.user_password_onboarding o
   where o.user_id = auth.uid();

  if v_inicial is null then
    -- Nunca foi marcado: nada a concluir. Idempotente por definição.
    return jsonb_build_object('required', false, 'changed', false);
  end if;

  if not v_required then
    -- Já concluído: repetir a chamada é inofensivo. Isso é o que permite ao
    -- cliente reexecutar quando o updateUser deu certo mas a RPC falhou.
    return jsonb_build_object('required', false, 'changed', false);
  end if;

  select a.encrypted_password into v_atual from auth.users a where a.id = auth.uid();

  -- A prova de que a troca ocorreu é o hash ter mudado. Confiar no cliente aqui
  -- permitiria "concluir" o onboarding sem nunca trocar a senha temporária.
  if v_atual is not null and v_atual = v_inicial then
    raise exception 'A senha temporaria ainda nao foi alterada.'
      using errcode = 'check_violation';
  end if;

  update app.user_password_onboarding
     set required = false, completed_at = now()
   where user_id = auth.uid();

  -- Papel, escopo e status NÃO são tocados aqui.
  return jsonb_build_object('required', false, 'changed', true);
end $$;

revoke all on function public.admin_require_password_change(uuid[]) from public, anon;
revoke all on function public.password_change_status() from public, anon;
revoke all on function public.complete_initial_password_change() from public, anon;
grant execute on function public.admin_require_password_change(uuid[]) to authenticated;
grant execute on function public.password_change_status() to authenticated;
grant execute on function public.complete_initial_password_change() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Origem do parceiro: Código e DDD da planilha do canal
-- ---------------------------------------------------------------------------
alter table public.operations
  add column if not exists source_code text,
  add column if not exists ddd text;

alter table public.operations drop constraint if exists operations_ddd_format;
alter table public.operations
  add constraint operations_ddd_format
  check (ddd is null or ddd ~ '^[0-9]{2}$');

comment on column public.operations.source_code is
  'Codigo do parceiro na planilha de origem do canal. Dado cadastral; nunca credencial.';
comment on column public.operations.ddd is
  'DDD com exatamente dois digitos, como veio da planilha. NAO deduz cidade.';

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
  o.cnpj                        as "cnpj",
  o.source_code                 as "sourceCode",
  o.ddd                         as "ddd"
from public.operations o
join public.units u          on u.id = o.unit_id
join public.regions r        on r.id = u.region_id
join public.coordinations c  on c.id = o.coordination_id
left join public.users cu    on cu.id = c.coordinator_user_id
left join public.users gu    on gu.id = o.channel_manager_user_id;

grant select on public.ui_admin_partners to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Núcleo do importador de parceiros, com a exigência de CNPJ parametrizada
--
--    O corpo é o da 0015, com três acréscimos: `sourceCode`, `ddd` e o
--    parâmetro `p_allow_null_cnpj`. Ele vive em `app` e não recebe EXECUTE de
--    ninguém: quem chama são as duas RPCs públicas abaixo, cada uma fixando a
--    exigência de CNPJ. Assim não existe uma terceira verdade sobre a regra.
-- ---------------------------------------------------------------------------
create or replace function app.import_partners_core(
  p_rows jsonb, p_commit boolean, p_allow_null_cnpj boolean
) returns jsonb
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
  v_cnpj text; v_tem_cnpj boolean;
  v_seen_cnpj text[] := '{}';
  v_op_by_cnpj uuid; v_op_by_office uuid;
  v_office_cnpj text; v_cnpj_final text;
  v_source_code text; v_ddd text;
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
    v_op_by_cnpj := null; v_op_by_office := null; v_office_cnpj := null; v_cnpj_final := null;

    begin
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
      v_cnpj              := app.normalize_cnpj(coalesce(v_row->>'cnpj',''));
      v_tem_cnpj          := v_cnpj <> '';
      v_source_code       := nullif(btrim(coalesce(v_row->>'sourceCode','')), '');
      v_ddd               := nullif(regexp_replace(coalesce(v_row->>'ddd',''), '[^0-9]', '', 'g'), '');

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
      if v_tem_cnpj and not app.is_valid_cnpj(v_cnpj) then
        v_msgs := v_msgs || to_jsonb('CNPJ invalido'::text);
      end if;
      if v_ddd is not null and v_ddd !~ '^[0-9]{2}$' then
        v_msgs := v_msgs || to_jsonb('DDD invalido: esperado dois digitos'::text);
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

        select ru.user_id, ru.error_msg into v_coord_id, v_err
          from app.resolve_scoped_user(v_coord_email, 'coordinator'::app.role_code, 'Coordenador',
                                       v_region_id, v_region_name, v_coordination_id) ru;
        if v_coord_id is null then v_msgs := v_msgs || to_jsonb(v_err); end if;

        select ru.user_id, ru.error_msg into v_gc_id, v_err
          from app.resolve_scoped_user(v_gc_email, 'channel_manager'::app.role_code, 'GC',
                                       v_region_id, v_region_name, v_coordination_id) ru;
        if v_gc_id is null then v_msgs := v_msgs || to_jsonb(v_err); end if;

        if v_coordination_id is not null and v_coord_id is not null
           and v_existing_coordinator is not null and v_existing_coordinator <> v_coord_id then
          v_msgs := v_msgs || to_jsonb(('Coordenacao ' || v_coordination_name
            || ' ja possui coordenador diferente de ' || v_coord_email
            || ' — resolucao manual pelo ADMIN necessaria')::text);
        end if;

        v_seen_key := coalesce(v_unit_id::text, 'new:' || v_unit_key) || '#' || v_office_key;
        if v_seen_key = any(v_seen) then
          v_msgs := v_msgs || to_jsonb(('Escritorio duplicado na planilha: ' || v_office
            || ' (unidade ' || v_unit_name || ')')::text);
        else
          v_seen := v_seen || v_seen_key;
        end if;

        if v_tem_cnpj then
          v_seen_key := coalesce(v_unit_id::text, 'new:' || v_unit_key) || '#' || v_cnpj;
          if v_seen_key = any(v_seen_cnpj) then
            v_msgs := v_msgs || to_jsonb(('CNPJ duplicado na planilha para a unidade ' || v_unit_name)::text);
          else
            v_seen_cnpj := v_seen_cnpj || v_seen_key;
          end if;
        end if;

        if v_unit_id is not null then
          if v_tem_cnpj then
            select o.id into v_op_by_cnpj from public.operations o
             where o.unit_id = v_unit_id and o.cnpj = v_cnpj;
          end if;
          select o.id, o.cnpj into v_op_by_office, v_office_cnpj
            from public.operations o
           where o.unit_id = v_unit_id
             and app.normalize_text(o.office_name) = v_office_key;
        end if;

        if v_op_by_cnpj is not null and v_op_by_office is not null
           and v_op_by_cnpj <> v_op_by_office then
          v_msgs := v_msgs || to_jsonb(('Conflito: o CNPJ e o escritorio '
            || v_office || ' apontam para parceiros diferentes na unidade '
            || v_unit_name || ' — resolucao manual pelo ADMIN necessaria')::text);
        elsif v_op_by_cnpj is not null then
          v_op_id := v_op_by_cnpj;
          v_cnpj_final := v_cnpj;
        elsif v_op_by_office is not null then
          v_op_id := v_op_by_office;
          if v_tem_cnpj then
            if v_office_cnpj is not null and v_office_cnpj <> v_cnpj then
              v_msgs := v_msgs || to_jsonb(('Conflito: o escritorio ' || v_office
                || ' ja esta cadastrado com outro CNPJ — resolucao manual pelo ADMIN necessaria')::text);
            else
              -- É AQUI que o administrador completa o CNPJ do legado depois,
              -- reenviando a planilha com unidade + escritório iguais.
              v_cnpj_final := v_cnpj;
            end if;
          else
            v_cnpj_final := v_office_cnpj;
            if v_office_cnpj is null then
              v_warns := v_warns || to_jsonb('Registro legado ainda sem CNPJ.'::text);
            end if;
          end if;
        else
          if not v_tem_cnpj then
            if p_allow_null_cnpj then
              -- Carga inicial: ausência vira NULL, jamais um número inventado.
              v_cnpj_final := null;
              v_warns := v_warns || to_jsonb('Cadastro inicial sem CNPJ; preenchimento administrativo pendente.'::text);
            else
              v_msgs := v_msgs || to_jsonb('CNPJ obrigatorio para novo parceiro'::text);
            end if;
          else
            v_cnpj_final := v_cnpj;
          end if;
        end if;

        if v_op_id is not null and jsonb_array_length(v_msgs) = 0 then
          v_status := 'duplicate';
          v_action := 'update';
        end if;
      end if;

      if jsonb_array_length(v_msgs) > 0 then
        v_status := 'error';
        v_action := 'none';
        v_op_id := null;
        v_errors := v_errors + 1;
      else
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
            if v_existing_coordinator is not null and v_existing_coordinator <> v_coord_id then
              raise exception 'Coordenacao % ja possui coordenador diferente de %',
                v_coordination_name, v_coord_email using errcode = 'check_violation';
            end if;
          elsif v_existing_coordinator is null then
            update public.coordinations set coordinator_user_id = v_coord_id
             where id = v_coordination_id and coordinator_user_id is null;
          end if;

          v_op_by_cnpj := null; v_op_by_office := null; v_office_cnpj := null;
          if v_tem_cnpj then
            select o.id into v_op_by_cnpj from public.operations o
             where o.unit_id = v_unit_id and o.cnpj = v_cnpj;
          end if;
          select o.id, o.cnpj into v_op_by_office, v_office_cnpj
            from public.operations o
           where o.unit_id = v_unit_id
             and app.normalize_text(o.office_name) = v_office_key;

          if v_op_by_cnpj is not null and v_op_by_office is not null
             and v_op_by_cnpj <> v_op_by_office then
            raise exception 'Conflito: CNPJ e escritorio % apontam para parceiros diferentes', v_office
              using errcode = 'check_violation';
          end if;
          v_op_id := coalesce(v_op_by_cnpj, v_op_by_office);

          if v_op_id is null then
            insert into public.operations
              (unit_id, coordination_id, partner_name, office_name, city, state,
               channel_manager_user_id, active, cnpj, source_code, ddd)
            values
              (v_unit_id, v_coordination_id, v_partner, v_office, v_city, v_state,
               v_gc_id, true, v_cnpj_final, v_source_code, v_ddd)
            returning id into v_op_id;
            v_status := 'ok'; v_action := 'insert';
            v_inserted := v_inserted + 1;
          else
            if v_op_by_cnpj is not null and exists (
                  select 1 from public.operations o
                   where o.unit_id = v_unit_id
                     and app.normalize_text(o.office_name) = v_office_key
                     and o.id <> v_op_id) then
              raise exception 'Escritorio % ja pertence a outro parceiro nesta unidade', v_office
                using errcode = 'unique_violation';
            end if;
            update public.operations set
              coordination_id = v_coordination_id,
              partner_name = v_partner,
              office_name = v_office,
              city = v_city,
              state = v_state,
              channel_manager_user_id = v_gc_id,
              cnpj = coalesce(v_cnpj_final, cnpj),
              source_code = coalesce(v_source_code, source_code),
              ddd = coalesce(v_ddd, ddd)
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
      'cnpj', app.format_cnpj(v_cnpj_final),
      'sourceCode', v_source_code,
      'ddd', v_ddd,
      'status', v_status,
      'action', v_action,
      'operationId', v_op_id,
      'messages', v_msgs,
      'warnings', v_warns));
  end loop;

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
      'total', v_total, 'inserted', v_inserted, 'updated', v_updated,
      'errors', v_errors, 'createdEntities', v_created),
    'toCreate', jsonb_build_object(
      'organizations', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_orgs)), '[]'::jsonb),
      'regions', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_regions)), '[]'::jsonb),
      'units', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_units)), '[]'::jsonb),
      'coordinations', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_coordinations)), '[]'::jsonb)),
    'rows', v_report);
end $$;

-- Importador NORMAL: CNPJ continua obrigatório para parceiro novo.
create or replace function public.admin_import_partners(p_rows jsonb, p_commit boolean) returns jsonb
  language sql security definer
  set search_path = public, app
as $$
  select app.import_partners_core(p_rows, p_commit, false)
$$;

-- Caminho de BOOTSTRAP, explícito e separado: só a carga inicial usa.
create or replace function public.admin_bootstrap_partners(p_rows jsonb, p_commit boolean) returns jsonb
  language sql security definer
  set search_path = public, app
as $$
  select app.import_partners_core(p_rows, p_commit, true)
$$;

revoke all on function app.import_partners_core(jsonb, boolean, boolean) from public, anon, authenticated;
revoke all on function public.admin_import_partners(jsonb, boolean) from public, anon;
revoke all on function public.admin_bootstrap_partners(jsonb, boolean) from public, anon;
grant execute on function public.admin_import_partners(jsonb, boolean) to authenticated;
grant execute on function public.admin_bootstrap_partners(jsonb, boolean) to authenticated;
