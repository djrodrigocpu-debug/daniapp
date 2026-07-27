-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0010: onboarding transacional de Usuários
-- =============================================================================
-- Corrige três defeitos estruturais do caminho corporativo (P0-A/B/C/D):
--
--   P0-A  admin_create_user (0006) grava status 'invited', mas
--         app.resolve_scoped_user (0009) exige 'active' — o usuário importado
--         nunca podia ser usado como GC/Coordenador.
--   P0-B  a "área de atuação" da planilha ("PR CAPITAL") é uma COORDENAÇÃO, mas
--         era procurada só em public.regions; region_id ficava NULL,
--         coordination_id nunca era preenchido e ui_users."region" vinha vazio.
--   P0-C  inserir uma linha em auth.users NÃO cria credencial utilizável. A
--         identidade real é criada pela Auth Admin API (Edge Function), fora do
--         Postgres — esta migration NUNCA escreve em auth.users.
--   P0-D  a importação linha a linha podia aplicar metade do lote.
--
-- ORDEM SEGURA (imposta pelo schema): public.users.id referencia auth.users(id),
-- portanto o PERFIL NÃO PODE PRECEDER A IDENTIDADE. O fluxo é:
--
--   1. admin_import_users(rows, p_commit => false)
--      valida TUDO, não grava nada, e devolve `pendingAuth` — os e-mails que
--      ainda não têm identidade. Nenhum efeito colateral em nenhum sistema.
--   2. Edge Function `admin-invite-users` (service_role, idempotente)
--      cria/recupera a identidade de cada e-mail e devolve authUserId.
--      Falha aqui é inofensiva: nada foi gravado no Postgres e a operação é
--      integralmente re-executável.
--   3. admin_import_users(rows_com_authUserId, p_commit => true)
--      revalida tudo e grava perfis + escopos numa ÚNICA transação.
--
-- ATOMICIDADE: a função valida o lote inteiro ANTES de qualquer escrita. Se
-- qualquer linha for inválida no modo commit, NADA é gravado e o relatório
-- explica linha a linha. Não existe aplicação parcial silenciosa.
--
-- Nada aqui reescreve migrations já aplicadas (§28).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Resolução de escopo por PAPEL — separa Região de Coordenação (P0-B)
-- ---------------------------------------------------------------------------
-- Regra do domínio (0001/0002):
--   admin            → não depende de escopo (app.is_admin só olha o papel);
--   regional         → user_scopes.region_id;
--   coordinator      → user_scopes.coordination_id;
--   channel_manager  → user_scopes.coordination_id (o acesso à operação em si
--                      vem de public.operation_assignments, mantido pelo
--                      trigger app.sync_operation_assignment).
-- A área é casada por app.normalize_text (sem acento/caixa), NUNCA por
-- igualdade textual crua, e o id resolvido é sempre uma chave real.
create or replace function app.resolve_area_scope(
  p_role app.role_code,
  p_area text
) returns table (region_id uuid, coordination_id uuid, error_msg text)
  language plpgsql stable
  set search_path = ''
as $$
declare
  v_area   text := regexp_replace(btrim(coalesce(p_area, '')), '\s+', ' ', 'g');
  v_key    text;
  v_region uuid;
  v_coord  uuid;
  v_hits   int;
begin
  -- Administrador é global: área é irrelevante e não vira escopo.
  if p_role = 'admin' then
    return query select null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_area = '' then
    return query select null::uuid, null::uuid,
      'Area de atuacao obrigatoria para o papel ' || p_role::text;
    return;
  end if;

  v_key := app.normalize_text(v_area);

  if p_role = 'regional' then
    -- Sem min(uuid) no Postgres: conta primeiro, depois pega o único id.
    select count(*) into v_hits
      from public.regions r
     where r.active and app.normalize_text(r.name) = v_key;
    select r.id into v_region
      from public.regions r
     where r.active and app.normalize_text(r.name) = v_key
     limit 1;
    if v_hits = 0 then
      return query select null::uuid, null::uuid,
        'Regiao inexistente: ' || v_area;
    elsif v_hits > 1 then
      return query select null::uuid, null::uuid,
        'Regiao ambigua (mais de uma com o mesmo nome): ' || v_area;
    else
      return query select v_region, null::uuid, null::text;
    end if;
    return;
  end if;

  -- coordinator e channel_manager: a área é uma COORDENAÇÃO.
  select count(*) into v_hits
    from public.coordinations c
   where c.active and app.normalize_text(c.name) = v_key;
  select c.id into v_coord
    from public.coordinations c
   where c.active and app.normalize_text(c.name) = v_key
   limit 1;
  if v_hits = 0 then
    return query select null::uuid, null::uuid,
      'Coordenacao inexistente: ' || v_area;
    return;
  elsif v_hits > 1 then
    return query select null::uuid, null::uuid,
      'Coordenacao ambigua (mais de uma com o mesmo nome): ' || v_area;
    return;
  end if;

  -- A coordenação sempre pertence a uma região (FK not null) — devolvemos as
  -- duas chaves para que o escopo fique consistente de ponta a ponta.
  select c.region_id into v_region from public.coordinations c where c.id = v_coord;
  return query select v_region, v_coord, null::text;
end $$;

-- ---------------------------------------------------------------------------
-- 2) ui_users — expõe as CHAVES estruturais, não só nomes (P0-B)
-- ---------------------------------------------------------------------------
-- `region` deixa de olhar apenas public.regions: para coordenador/GC a área de
-- atuação é a coordenação, e era isso que voltava vazio, quebrando a resolução
-- do coordenador no cliente. As colunas existentes mantêm nome, tipo e ordem
-- (requisito de `create or replace view`); as novas entram no fim.
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
  (
    -- Coordenador do GC: o coordenador titular da MESMA coordenação.
    select c.coordinator_user_id::text
      from public.user_scopes s
      join public.coordinations c on c.id = s.coordination_id
     where s.user_id = u.id and s.active and s.coordination_id is not null
       and (s.valid_to is null or s.valid_to > now())
       and c.coordinator_user_id is not null
       and c.coordinator_user_id <> u.id
     order by s.valid_from desc limit 1
  )                                           as "coordinatorId",
  coalesce((
    -- Área de atuação exibida: coordenação quando houver, senão a região.
    select coalesce(c.name, r.name)
      from public.user_scopes s
      left join public.coordinations c on c.id = s.coordination_id
      left join public.regions r       on r.id = s.region_id
     where s.user_id = u.id and s.active
       and (s.valid_to is null or s.valid_to > now())
       and (s.coordination_id is not null or s.region_id is not null)
     order by s.valid_from desc limit 1
  ), '')                                      as "region",
  upper(
    coalesce(left(split_part(u.display_name, ' ', 1), 1), '') ||
    coalesce(left(nullif(split_part(u.display_name, ' ', 2), ''), 1),
             substr(coalesce(split_part(u.display_name, ' ', 1), ''), 2, 1))
  )                                           as "avatarInitials",
  (u.status = 'active')                       as "active",
  -- Colunas novas (aditivas): chaves reais + estado de onboarding.
  (
    select s.region_id from public.user_scopes s
     where s.user_id = u.id and s.active and (s.valid_to is null or s.valid_to > now())
     order by s.valid_from desc limit 1
  )                                           as "regionId",
  (
    select s.coordination_id from public.user_scopes s
     where s.user_id = u.id and s.active and (s.valid_to is null or s.valid_to > now())
     order by s.valid_from desc limit 1
  )                                           as "coordinationId",
  u.status::text                              as "status"
from public.users u;

-- ---------------------------------------------------------------------------
-- 3) admin_import_users — lote validado por inteiro, gravado numa transação
-- ---------------------------------------------------------------------------
-- Linha de entrada:
--   { index, name, email, role, region, authUserId? }
-- `authUserId` é o id da identidade criada pela Edge Function; ausente para
-- usuário que ainda não tem identidade (aparece em `pendingAuth`).
--
-- Retorno:
--   { mode, applied, counters{total,inserted,updated,errors,pendingAuth},
--     pendingAuth[], rows[{index,name,email,role,status,action,userId,
--     messages[],warnings[]}] }
create or replace function public.admin_import_users(p_rows jsonb, p_commit boolean)
  returns jsonb
  language plpgsql security definer
  set search_path = public, app
as $$
declare
  v_max_rows   int := 200;
  v_max        int := 300;
  v_row        jsonb;
  v_index      int;
  v_total      int := 0;
  v_inserted   int := 0;
  v_updated    int := 0;
  v_errors     int := 0;
  v_name       text;
  v_email      text;
  v_role_txt   text;
  v_role       app.role_code;
  v_area       text;
  v_auth_id    uuid;
  v_msgs       jsonb;
  v_warns      jsonb;
  v_region     uuid;
  v_coord      uuid;
  v_err        text;
  v_existing   uuid;
  v_action     text;
  v_status     text;
  v_seen       jsonb := '{}'::jsonb;
  v_pending    jsonb := '[]'::jsonb;
  v_rows_out   jsonb := '[]'::jsonb;
  v_plan       jsonb := '[]'::jsonb;   -- linhas válidas, prontas para gravar
  v_item       jsonb;
  v_user_id    uuid;
  v_applied    boolean := false;
  v_coord_owner uuid;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows deve ser um array jsonb' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_rows) > v_max_rows then
    raise exception 'lote excede o limite de % linhas', v_max_rows using errcode = 'program_limit_exceeded';
  end if;

  -- ---------------------------------------------------------------------
  -- PASSO 1 — validação COMPLETA do lote. Nenhuma escrita acontece aqui.
  -- ---------------------------------------------------------------------
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_index := coalesce((v_row->>'index')::int, v_total);
    v_msgs  := '[]'::jsonb;
    v_warns := '[]'::jsonb;
    v_region := null; v_coord := null; v_existing := null; v_auth_id := null;
    v_action := 'insert'; v_status := 'ok';

    v_name     := regexp_replace(btrim(coalesce(v_row->>'name','')), '\s+', ' ', 'g');
    v_email    := lower(btrim(coalesce(v_row->>'email','')));
    v_role_txt := btrim(coalesce(v_row->>'role',''));
    v_area     := regexp_replace(btrim(coalesce(v_row->>'region','')), '\s+', ' ', 'g');

    if v_name = '' then
      v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: nome'::text);
    elsif length(v_name) > v_max then
      v_msgs := v_msgs || to_jsonb(('Nome excede o limite de ' || v_max || ' caracteres')::text);
    end if;

    if v_email = '' then
      v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: e-mail'::text);
    elsif length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_msgs := v_msgs || to_jsonb(('E-mail invalido: ' || v_email)::text);
    elsif v_seen ? v_email then
      -- Colisão dentro do próprio lote: resultado determinístico e auditável,
      -- nunca "on conflict do nothing".
      v_msgs := v_msgs || to_jsonb(('E-mail repetido no lote: ' || v_email
        || ' (ja usado no registro ' || (v_seen->>v_email) || ')')::text);
    end if;

    if v_role_txt not in ('admin','regional','coordinator','channel_manager') then
      v_msgs := v_msgs || to_jsonb(('Perfil invalido: '
        || coalesce(nullif(v_role_txt,''),'(vazio)')
        || ' (aceitos: admin, regional, coordinator, channel_manager)')::text);
    else
      v_role := v_role_txt::app.role_code;
      select ras.region_id, ras.coordination_id, ras.error_msg
        into v_region, v_coord, v_err
        from app.resolve_area_scope(v_role, v_area) ras;
      if v_err is not null then
        v_msgs := v_msgs || to_jsonb(v_err);
      end if;
    end if;

    if jsonb_array_length(v_msgs) = 0 then
      v_seen := v_seen || jsonb_build_object(v_email, v_index);

      select u.id into v_existing from public.users u
       where lower(u.corporate_email) = v_email;

      if v_existing is not null then
        v_action := 'update';
        v_status := 'duplicate';
      else
        -- Usuário novo exige identidade Auth previamente criada (P0-C): o
        -- perfil referencia auth.users(id) e NUNCA a inventamos aqui.
        if coalesce(v_row->>'authUserId','') = '' then
          v_pending := v_pending || to_jsonb(v_email);
          v_status  := 'pending_auth';
          v_action  := 'none';
        else
          begin
            v_auth_id := (v_row->>'authUserId')::uuid;
          exception when others then
            v_msgs := v_msgs || to_jsonb('authUserId nao e um uuid valido'::text);
          end;
          if v_auth_id is not null
             and not exists (select 1 from auth.users a where a.id = v_auth_id) then
            v_msgs := v_msgs || to_jsonb(('Identidade Auth inexistente para '
              || v_email || ' — rode o convite antes de confirmar')::text);
          end if;
        end if;
      end if;
    end if;

    if jsonb_array_length(v_msgs) > 0 then
      v_errors := v_errors + 1;
      v_status := 'error';
      v_action := 'none';
    elsif v_action = 'update' then
      v_updated := v_updated + 1;
    elsif v_action = 'insert' then
      v_inserted := v_inserted + 1;
    end if;

    -- Plano de gravação: só linhas sem erro e sem pendência de identidade.
    if jsonb_array_length(v_msgs) = 0 and v_action <> 'none' then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'name', v_name, 'email', v_email, 'role', v_role_txt,
        'regionId', v_region, 'coordinationId', v_coord,
        'existingId', v_existing, 'authUserId', v_auth_id));
    end if;

    v_rows_out := v_rows_out || jsonb_build_array(jsonb_build_object(
      'index', v_index, 'name', v_name, 'email', v_email, 'role', v_role_txt,
      'status', v_status, 'action', v_action,
      'userId', coalesce(v_existing, v_auth_id),
      'messages', v_msgs, 'warnings', v_warns));
  end loop;

  -- ---------------------------------------------------------------------
  -- PASSO 2 — gravação. Só acontece se o lote INTEIRO estiver apto.
  -- Erro ou pendência de identidade ⇒ nada é gravado (sem aplicação parcial).
  -- ---------------------------------------------------------------------
  if p_commit and v_errors = 0 and jsonb_array_length(v_pending) = 0 then
    for v_item in select * from jsonb_array_elements(v_plan) loop
      v_user_id := coalesce((v_item->>'existingId')::uuid, (v_item->>'authUserId')::uuid);

      if (v_item->>'existingId') is null then
        insert into public.users (id, display_name, corporate_email, status)
        values (v_user_id, v_item->>'name', v_item->>'email', 'invited');
      else
        -- Atualiza o perfil de verdade (nome), sem promover status por conta
        -- própria: ativação tem regra própria (admin_activate_confirmed_users).
        update public.users
           set display_name = v_item->>'name', updated_at = now()
         where id = v_user_id;
      end if;

      -- Escopo: encerra os anteriores e grava o vigente com as CHAVES certas.
      update public.user_scopes
         set active = false, valid_to = now()
       where user_id = v_user_id and active;

      insert into public.user_scopes (user_id, role, region_id, coordination_id, created_by)
      values (v_user_id, (v_item->>'role')::app.role_code,
              nullif(v_item->>'regionId','')::uuid,
              nullif(v_item->>'coordinationId','')::uuid,
              auth.uid());

      -- Coordenador titular da coordenação. Divergência é ERRO explícito, não
      -- sobrescrita silenciosa — e derruba a transação inteira.
      if (v_item->>'role') = 'coordinator' and (v_item->>'coordinationId') is not null then
        select c.coordinator_user_id into v_coord_owner
          from public.coordinations c where c.id = (v_item->>'coordinationId')::uuid;
        if v_coord_owner is null or v_coord_owner = v_user_id then
          update public.coordinations
             set coordinator_user_id = v_user_id, updated_at = now()
           where id = (v_item->>'coordinationId')::uuid;
        else
          raise exception 'Coordenacao ja possui outro coordenador titular (linha %)', v_item->>'index'
            using errcode = 'integrity_constraint_violation';
        end if;
      end if;
    end loop;
    v_applied := true;
  end if;

  return jsonb_build_object(
    'mode', case when p_commit then 'commit' else 'simulate' end,
    'applied', v_applied,
    'counters', jsonb_build_object(
      'total', v_total, 'inserted', v_inserted, 'updated', v_updated,
      'errors', v_errors, 'pendingAuth', jsonb_array_length(v_pending)),
    'pendingAuth', v_pending,
    'rows', v_rows_out);
end $$;

-- ---------------------------------------------------------------------------
-- 4) Ativação — só quem realmente pode autenticar (P0-A + P0-C)
-- ---------------------------------------------------------------------------
-- Um usuário NÃO vira 'active' porque uma linha foi inserida. Vira quando a
-- identidade Auth existe E o e-mail está confirmado — sinal de que o convite
-- foi aceito e há credencial utilizável. Enquanto isso permanece 'invited', e
-- app.resolve_scoped_user continua recusando-o como GC/Coordenador.
create or replace function public.admin_activate_confirmed_users()
  returns jsonb
  language plpgsql security definer
  set search_path = public, app
as $$
declare v_promoted int;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;

  update public.users u
     set status = 'active', updated_at = now()
   where u.status = 'invited'
     and exists (
       select 1 from auth.users a
        where a.id = u.id and a.email_confirmed_at is not null);
  get diagnostics v_promoted = row_count;

  return jsonb_build_object(
    'promoted', v_promoted,
    'active', (select count(*) from public.users where status = 'active'),
    'stillInvited', (select count(*) from public.users where status = 'invited'));
end $$;

-- ---------------------------------------------------------------------------
-- 5) Permissões — mesmas do restante das RPCs administrativas (0008)
-- ---------------------------------------------------------------------------
revoke all on function public.admin_import_users(jsonb, boolean) from public, anon;
revoke all on function public.admin_activate_confirmed_users() from public, anon;
grant execute on function public.admin_import_users(jsonb, boolean) to authenticated;
grant execute on function public.admin_activate_confirmed_users() to authenticated;
grant execute on function app.resolve_area_scope(app.role_code, text) to authenticated;
