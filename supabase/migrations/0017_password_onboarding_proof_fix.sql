-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0017: corrige a prova da troca de senha
-- =============================================================================
-- DEFEITO DA 0016: a conclusão do onboarding comparava
-- `auth.users.encrypted_password` com um `initial_password_hash` guardado, e
-- tratava "hash diferente" como prova de que a pessoa escolheu outra senha.
--
-- Isso NÃO prova nada. bcrypt usa salt aleatório: reenviar a MESMA senha em
-- texto produz um hash diferente. O gate seria satisfeito por quem apenas
-- redigitasse a senha temporária — exatamente o que ele existe para impedir.
-- Pior, guardar uma cópia do hash da credencial não comprava segurança nenhuma
-- em troca desse risco.
--
-- CORREÇÃO: a prova sai do banco e vai para onde ela pode de fato existir — o
-- GoTrue. A Edge Function `initial-password-change` compara as duas senhas em
-- memória, chama `updateUser` com `current_password` (que valida a senha atual
-- de verdade) e só então pede a conclusão. O banco deixa de opinar sobre senha:
-- ele apenas registra QUEM precisa trocar e QUEM já trocou.
--
-- Consequências desta migration:
--   * `initial_password_hash` é REMOVIDA — nenhum hash de credencial fica
--     guardado em tabela nossa;
--   * nada mais lê `auth.users.encrypted_password`;
--   * a conclusão deixa de ser executável por `authenticated`: quem conclui é a
--     Edge Function, com `service_role`, usando o uuid tirado do JWT validado.
--     Sem isso qualquer pessoa autenticada encerraria o próprio gate por RPC,
--     sem trocar senha alguma.
--
-- A 0016 já foi aplicada no staging e NÃO é editada (§28).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Marcação administrativa — sem tocar em senha
-- ---------------------------------------------------------------------------
create or replace function public.admin_require_password_change(p_user_ids uuid[])
  returns jsonb
  language plpgsql security definer
  set search_path = public, app
as $$
declare
  v_id uuid;
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
    -- Só confirmamos que a identidade existe. A senha não é lida, comparada
    -- nem copiada — o banco não precisa saber nada sobre ela.
    if not exists (select 1 from auth.users a where a.id = v_id) then
      v_sem_identidade := v_sem_identidade + 1;
      continue;
    end if;

    insert into app.user_password_onboarding (user_id, required, completed_at)
    values (v_id, true, null)
    on conflict (user_id) do update
      set required = true, completed_at = null;
    v_marcados := v_marcados + 1;
  end loop;

  return jsonb_build_object('marked', v_marcados, 'missingIdentity', v_sem_identidade);
end $$;

-- ---------------------------------------------------------------------------
-- 2) Conclusão — agora só pelo servidor, com o uuid vindo do JWT validado
-- ---------------------------------------------------------------------------
create or replace function public.service_complete_initial_password_change(p_user_id uuid)
  returns jsonb
  language plpgsql security definer
  set search_path = public, app
as $$
declare v_required boolean;
begin
  if p_user_id is null then
    raise exception 'usuario nao informado' using errcode = 'invalid_parameter_value';
  end if;

  select o.required into v_required
    from app.user_password_onboarding o
   where o.user_id = p_user_id;

  if v_required is null then
    -- Nunca marcado: nada a concluir.
    return jsonb_build_object('required', false, 'changed', false);
  end if;
  if not v_required then
    -- Já concluído. Idempotente de propósito: é o que permite à Edge Function
    -- reexecutar a conclusão quando a troca deu certo e a gravação falhou.
    return jsonb_build_object('required', false, 'changed', false);
  end if;

  update app.user_password_onboarding
     set required = false, completed_at = now()
   where user_id = p_user_id;

  -- Papel, escopo e status NUNCA são tocados aqui.
  return jsonb_build_object('required', false, 'changed', true);
end $$;

-- A antiga conclusão do próprio usuário deixa de existir: mantê-la seria manter
-- uma porta para encerrar o gate sem trocar senha.
drop function if exists public.complete_initial_password_change();

-- ---------------------------------------------------------------------------
-- 3) Remoção do hash guardado
--     Feita DEPOIS de substituir todas as funções que a referenciavam.
-- ---------------------------------------------------------------------------
alter table app.user_password_onboarding
  drop column if exists initial_password_hash;

comment on table app.user_password_onboarding is
  'Quem precisa trocar a senha temporaria e quem ja trocou. NAO guarda senha nem hash: a prova da troca e feita pelo GoTrue, na Edge Function initial-password-change.';

-- ---------------------------------------------------------------------------
-- 4) Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.admin_require_password_change(uuid[]) from public, anon;
grant execute on function public.admin_require_password_change(uuid[]) to authenticated;

-- `password_change_status` continua sendo do próprio usuário: só informa, não decide.
revoke all on function public.password_change_status() from public, anon;
grant execute on function public.password_change_status() to authenticated;

-- A conclusão é EXCLUSIVA do servidor. `authenticated` e `anon` ficam de fora:
-- é isso que impede alguém de encerrar o próprio gate chamando a RPC direto.
revoke all on function public.service_complete_initial_password_change(uuid) from public, anon, authenticated;
grant execute on function public.service_complete_initial_password_change(uuid) to service_role;
