-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0011: depreciação de public.admin_create_user
-- =============================================================================
-- A função nasceu na 0006 e cria uma identidade INCOMPLETA:
--
--   insert into auth.users (id, email) values (v_uid, v_email) on conflict do nothing;
--
-- Uma linha em auth.users sem `encrypted_password`, sem `email_confirmed_at` e
-- sem registro em auth.identities NÃO é credencial: o GoTrue não autentica esse
-- usuário. Pior, o `on conflict do nothing` mascara colisão de e-mail e o insert
-- seguinte em public.users pode violar a FK para auth.users(id), derrubando a
-- chamada no meio. Era a raiz do bloqueio P0-C.
--
-- A 0006 é histórica e NÃO é alterada (§28). Esta migration apenas substitui o
-- CORPO da função por uma recusa explícita e retira permissões indevidas.
--
-- Por que recusar em vez de revogar o EXECUTE de `authenticated`:
--   revogar produziria "permission denied for function admin_create_user", que
--   não diz o que fazer. Mantendo o EXECUTE e lançando a recusa, qualquer
--   chamador desconhecido recebe o caminho substituto por escrito — barulhento,
--   nunca silencioso. As permissões de `anon`/`public` (que nunca deveriam
--   existir) essas sim são revogadas.
--
-- Caminho correto, em três fases (ver 0010):
--   1. public.admin_import_users(rows, false)  — valida, não grava
--   2. Edge Function admin-invite-users        — cria a identidade real no Auth
--   3. public.admin_import_users(rows, true)   — grava em transação única
--
-- Reversível: reaplicar o corpo original da 0006 restaura o comportamento
-- antigo. Nenhum objeto é removido e nenhum dado é tocado.
-- =============================================================================

create or replace function public.admin_create_user(p_input jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
begin
  -- A guarda de administrador vem ANTES: quem não é admin não deve nem saber
  -- que a função existe, muito menos receber orientação de arquitetura.
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;

  raise exception using
    errcode = 'feature_not_supported',
    message = 'admin_create_user foi DEPRECIADA: criava identidade Auth incompleta, incapaz de autenticar.',
    hint    = 'Use public.admin_import_users(p_rows, p_commit) para perfil e escopo, '
           || 'e a Edge Function admin-invite-users para a identidade no Supabase Auth. '
           || 'Ordem: simular (p_commit=false) -> convidar -> confirmar (p_commit=true).',
    detail  = 'Chamada recusada; nenhum dado foi alterado.';
end $$;

comment on function public.admin_create_user(jsonb) is
  'DEPRECIADA na 0011. Sempre lança. Use admin_import_users + Edge Function admin-invite-users.';

-- Permissões indevidas: nem anônimo nem PUBLIC devem alcançar RPC administrativa.
-- `authenticated` permanece para que o chamador receba a mensagem de depreciação.
revoke all on function public.admin_create_user(jsonb) from anon;
revoke all on function public.admin_create_user(jsonb) from public;
grant execute on function public.admin_create_user(jsonb) to authenticated;
