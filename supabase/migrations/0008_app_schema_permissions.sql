-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0008: permissões do schema `app` (§5.1, §13.3)
-- =============================================================================
-- CAUSA: as views `ui_*` (security_invoker) e as políticas RLS avaliam funções do
-- schema `app` NO PAPEL do usuário que consulta. No Supabase, um schema criado por
-- migration NÃO concede USAGE a `authenticated` por padrão — então
-- `select ... from public.ui_operations` como usuário autenticado falhava com
-- "permission denied for schema app". Esta migration concede o mínimo necessário.
--
-- PRINCÍPIO (mínimo privilégio): apenas USAGE no schema e EXECUTE nas funções que
-- `authenticated` invoca DIRETAMENTE (corpo das views + expressões das políticas).
-- As demais funções `app.*` rodam apenas dentro de SECURITY DEFINER / triggers
-- (como o dono), logo `authenticated` NÃO precisa de EXECUTE nelas.
--
-- NÃO concede CREATE no schema; NÃO concede nada a `anon` (sem acesso corporativo);
-- NÃO referencia `service_role`. Idempotente (GRANT/REVOKE podem reexecutar) — o
-- GRANT já aplicado manualmente no remoto permanece consistente com esta migration.
-- =============================================================================

-- Acesso ao schema (a autorização real continua na RLS/nas funções).
grant usage on schema app to authenticated;

-- EXECUTE explícito e auditável nas funções chamadas diretamente pelo papel
-- `authenticated` (via views security_invoker e políticas RLS):
grant execute on function app.is_admin() to authenticated;                                  -- políticas admin-only
grant execute on function app.has_role(app.role_code) to authenticated;                     -- políticas por papel
grant execute on function app.has_operation_access(uuid) to authenticated;                  -- escopo por operação (T01)
grant execute on function app.can_validate(uuid) to authenticated;                          -- validação segregada (T02)
grant execute on function app.score_traffic_light(numeric) to authenticated;                -- corpo de ui_operations
grant execute on function app.action_status_to_ui(app.action_status) to authenticated;      -- corpo de ui_action_plans

-- Defesa explícita: `authenticated` não pode criar objetos no schema `app`.
revoke create on schema app from authenticated;
