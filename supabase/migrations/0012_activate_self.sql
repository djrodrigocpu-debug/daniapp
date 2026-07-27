-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0012: auto-ativação após aceitar o convite
-- =============================================================================
-- PROBLEMA: public.admin_activate_confirmed_users (0010) exige app.is_admin().
-- Quem acabou de aceitar o convite e definiu a senha NÃO é administrador, então
-- não consegue se ativar — e, enquanto `status <> 'active'`,
-- SupabaseAuthRepository.buildSession recusa o login com "Usuário inativo ou
-- suspenso". Sem esta função o onboarding trava exatamente no último passo.
--
-- A alternativa preguiçosa seria afrouxar a RPC de administrador. Não fazemos
-- isso: criamos uma função de escopo MÍNIMO que só age sobre o PRÓPRIO usuário
-- autenticado e só na transição permitida.
--
-- Garantias (todas verificadas no servidor, nenhuma confiando no cliente):
--   * identidade vem de auth.uid() — o cliente não informa a quem ativar;
--   * exige e-mail confirmado em auth.users (prova de credencial utilizável);
--   * exige que perfil e identidade tenham o MESMO uuid;
--   * permite somente 'invited' -> 'active';
--   * recusa 'suspended' e 'inactive' (reativar é decisão de administrador);
--   * não toca em papel, escopo, região, coordenação ou qualquer outro campo;
--   * idempotente: já ativo devolve sucesso sem escrever.
--
-- Nada aqui altera migrations históricas (§28).
-- =============================================================================

create or replace function public.activate_self()
  returns jsonb
  language plpgsql security definer
  set search_path = public, app
as $$
declare
  v_uid       uuid := auth.uid();
  v_status    app.user_status;
  v_confirmed timestamptz;
begin
  if v_uid is null then
    raise exception 'sessao ausente' using errcode = 'insufficient_privilege';
  end if;

  -- Perfil do PRÓPRIO usuário. O mesmo uuid é, por construção, a ponte entre
  -- auth.users e public.users (FK) — se não houver linha, o onboarding SQL
  -- ainda não rodou e ativar seria inventar um perfil.
  select u.status into v_status from public.users u where u.id = v_uid;
  if v_status is null then
    raise exception 'perfil corporativo inexistente para a identidade autenticada'
      using errcode = 'no_data_found';
  end if;

  -- Credencial realmente utilizável: sem confirmação não há ativação.
  select a.email_confirmed_at into v_confirmed from auth.users a where a.id = v_uid;
  if v_confirmed is null then
    raise exception 'e-mail ainda nao confirmado' using errcode = 'check_violation';
  end if;

  -- Idempotência: repetir a chamada não é erro nem escreve de novo.
  if v_status = 'active' then
    return jsonb_build_object('status', 'active', 'changed', false);
  end if;

  -- Só a transição de onboarding. Reativar quem foi suspenso ou inativado é
  -- decisão administrativa e continua exigindo admin_set_user_active.
  if v_status <> 'invited' then
    raise exception 'usuario % nao pode se autoativar', v_status
      using errcode = 'check_violation';
  end if;

  update public.users
     set status = 'active', updated_at = now()
   where id = v_uid and status = 'invited';

  return jsonb_build_object('status', 'active', 'changed', true);
end $$;

comment on function public.activate_self() is
  'Ativa SOMENTE o próprio perfil autenticado, de invited para active, exigindo e-mail confirmado. Não altera papel nem escopo.';

revoke all on function public.activate_self() from anon;
revoke all on function public.activate_self() from public;
grant execute on function public.activate_self() to authenticated;
