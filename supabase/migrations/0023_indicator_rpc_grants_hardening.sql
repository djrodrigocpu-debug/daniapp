-- ===========================================================================
-- 0023 — FECHAR EXECUTE DE anon/public NAS RPCs ADMINISTRATIVAS DE INDICADOR
--
-- ACHADO DE AUDITORIA (staging, após a 0022). As quatro RPCs de indicador
-- criadas em 0006 estavam executáveis por `anon`:
--
--   admin_create_indicator · admin_add_indicator_version
--   admin_deactivate_indicator · admin_delete_indicator
--
-- CAUSA. O bloco de grants da 0006 concede EXECUTE a `authenticated`, mas nunca
-- revogou o EXECUTE que o PostgreSQL concede a PUBLIC por padrão ao criar uma
-- função. As demais famílias administrativas (0010, 0011, 0012, 0014, 0018) já
-- faziam `revoke all ... from public, anon` — esta ficou de fora. A 0022 não
-- introduziu o problema: `create or replace function` preserva os privilégios
-- existentes, então as duas funções que ela substituiu chegaram com o grant
-- aberto que já tinham.
--
-- IMPACTO REAL. Nenhum acesso indevido: a autorização verdadeira está no corpo
-- de cada função (`app.is_admin()`, que depende de `auth.uid()`), e um chamador
-- anônimo recebe 'apenas administrador'. Isto é defesa em profundidade — a porta
-- deixa de estar destrancada mesmo com o cofre fechado — e alinhamento com a
-- convenção que o projeto já aplica em todo o resto.
--
-- Idempotente e sem efeito sobre dados: só mexe em privilégios.
-- ===========================================================================

revoke all on function public.admin_create_indicator(text, text, jsonb)   from public, anon;
revoke all on function public.admin_add_indicator_version(uuid, jsonb)    from public, anon;
revoke all on function public.admin_deactivate_indicator(uuid)            from public, anon;
revoke all on function public.admin_delete_indicator(uuid)                from public, anon;

grant execute on function public.admin_create_indicator(text, text, jsonb) to authenticated;
grant execute on function public.admin_add_indicator_version(uuid, jsonb)  to authenticated;
grant execute on function public.admin_deactivate_indicator(uuid)          to authenticated;
grant execute on function public.admin_delete_indicator(uuid)              to authenticated;
