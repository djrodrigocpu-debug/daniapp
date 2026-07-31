-- =============================================================================
-- AAPEX 1.3.2 — Migration 0032: ativação administrativa DIRECIONADA (O-02)
-- =============================================================================
-- ACHADO DA SIMULAÇÃO DE 30 DIAS. `admin_activate_confirmed_users()` não recebia
-- alvo nenhum: promovia a `active` TODO usuário `invited` do banco cuja
-- identidade estivesse confirmada. A simulação teve de EVITAR a função e ativar
-- um a um com `activate_self()`, porque chamá-la teria alcançado também usuários
-- reais convidados e ainda não ativados — pessoas fora do lote em questão.
--
-- Uma ação administrativa cujo raio depende do estado global do banco no
-- instante da chamada não é auditável nem reversível: o operador não consegue
-- saber, antes de clicar, quem vai ser afetado.
--
-- O CONTRATO PASSA A EXIGIR ALVO EXPLÍCITO. Duas formas, uma regra só:
--
--   admin_activate_confirmed_user (p_user_id  uuid)    — o primitivo
--   admin_activate_confirmed_users(p_user_ids uuid[])  — o lote do provisionamento
--
-- A forma sem argumento é REMOVIDA. Não há substituto "ativar todos": quem
-- precisar ativar N pessoas enumera as N.
--
-- CONSUMIDOR REAL. A única chamada de produção é a Edge Function
-- `admin-provision-users`, etapa 5 do provisionamento por senha (0010/0016).
-- Ela já conhece, naquele ponto, o UUID de cada linha do lote — passa a mandar
-- exatamente essa lista. Nenhum usuário fora do lote é tocado.
--
-- REGRA EMPRESARIAL PRESERVADA, letra por letra: só sai de `invited` para
-- `active`, e só com `auth.users.email_confirmed_at` preenchido. Reativar quem
-- foi suspenso ou inativado continua sendo `admin_set_user_active`, como sempre
-- foi. A diferença é o RAIO, não a regra.
--
-- TRILHA. Nenhum `write_audit` explícito aqui: `trg_audit_user_update` (0029) já
-- grava `user.status_changed` com `from`/`to` e com `auth.uid()` — o administrador
-- que chamou — para cada linha efetivamente alterada. Ativação que não muda
-- nada não escreve log, que é o correto para uma operação idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. O primitivo: um usuário, nomeado
-- ---------------------------------------------------------------------------
-- Idempotente e total: descreve o desfecho em vez de falhar quando não há nada
-- a fazer. Só o alvo INEXISTENTE é erro — pedir a ativação de alguém que não
-- existe é engano do chamador, não um "nada a fazer".
create or replace function public.admin_activate_confirmed_user(p_user_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid       uuid;
  v_status    app.user_status;
  v_confirmed timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(app.is_admin(), false) then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;
  if p_user_id is null then
    raise exception 'usuario alvo obrigatorio' using errcode = 'invalid_parameter_value';
  end if;

  select u.status into v_status from public.users u where u.id = p_user_id;
  if v_status is null then
    raise exception 'usuario inexistente' using errcode = 'no_data_found';
  end if;

  -- Idempotência: repetir não é erro e não escreve de novo.
  if v_status = 'active' then
    return jsonb_build_object('userId', p_user_id, 'status', 'active',
                              'changed', false, 'reason', 'already_active');
  end if;

  -- Suspenso/inativo é decisão administrativa com outro caminho e outro
  -- significado: esta função faz APENAS a transição de onboarding.
  if v_status <> 'invited' then
    return jsonb_build_object('userId', p_user_id, 'status', v_status::text,
                              'changed', false, 'reason', 'not_invited');
  end if;

  select a.email_confirmed_at into v_confirmed from auth.users a where a.id = p_user_id;
  if v_confirmed is null then
    return jsonb_build_object('userId', p_user_id, 'status', 'invited',
                              'changed', false, 'reason', 'email_not_confirmed');
  end if;

  update public.users
     set status = 'active', updated_at = now()
   where id = p_user_id and status = 'invited';

  return jsonb_build_object('userId', p_user_id, 'status', 'active',
                            'changed', true, 'reason', 'activated');
end $$;

-- ---------------------------------------------------------------------------
-- 2. O lote: lista EXPLÍCITA, nunca "todos"
-- ---------------------------------------------------------------------------
-- Mesma assinatura de saída da forma antiga (`promoted`/`active`/`stillInvited`),
-- para que o consumidor continue lendo o mesmo campo. O que mudou é que agora
-- existe um `p_user_ids` e ele é obrigatório.
create or replace function public.admin_activate_confirmed_users(p_user_ids uuid[])
  returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid      uuid;
  v_alvos    uuid[];
  v_id       uuid;
  v_promoted int := 0;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(app.is_admin(), false) then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;
  if p_user_ids is null then
    raise exception 'lista de usuarios obrigatoria' using errcode = 'invalid_parameter_value';
  end if;

  -- Sem nulos e sem repetição: o alvo é um CONJUNTO nomeado.
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_alvos
    from unnest(p_user_ids) x where x is not null;

  -- Teto igual ao do importador (MAX_USER_IMPORT_ROWS / MAX_ROWS = 200). Uma
  -- lista maior que o maior lote possível não é um lote: é "todos" disfarçado.
  if array_length(v_alvos, 1) > 200 then
    raise exception 'lote excede o limite de 200 usuarios'
      using errcode = 'invalid_parameter_value';
  end if;

  foreach v_id in array v_alvos loop
    if (public.admin_activate_confirmed_user(v_id) ->> 'changed')::boolean then
      v_promoted := v_promoted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'promoted', v_promoted,
    'requested', coalesce(array_length(v_alvos, 1), 0),
    'active', (select count(*) from public.users where status = 'active'),
    'stillInvited', (select count(*) from public.users where status = 'invited'));
end $$;

-- ---------------------------------------------------------------------------
-- 3. A forma sem alvo deixa de existir
-- ---------------------------------------------------------------------------
-- Assinatura exata: a nova sobrecarga `(uuid[])` permanece.
drop function if exists public.admin_activate_confirmed_users();

-- ---------------------------------------------------------------------------
-- 4. Mínimo privilégio
-- ---------------------------------------------------------------------------
revoke all on function public.admin_activate_confirmed_user(uuid)    from public, anon;
revoke all on function public.admin_activate_confirmed_users(uuid[]) from public, anon;
grant execute on function public.admin_activate_confirmed_user(uuid)    to authenticated;
grant execute on function public.admin_activate_confirmed_users(uuid[]) to authenticated;
