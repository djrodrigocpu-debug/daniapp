-- =============================================================================
-- AAPEX 1.3.2 — Migration 0033: imutabilidade real do snapshot oficial (O-03)
-- =============================================================================
-- ACHADO DA SIMULAÇÃO DE 30 DIAS. Um DELETE de snapshot pela API respondia
-- HTTP 200 com corpo vazio. O dado permanecia intacto — mas a resposta dizia
-- "feito" para uma operação que o produto considera impossível.
--
-- POR QUE ACONTECIA. Três camadas que, juntas, produziam silêncio em vez de
-- recusa:
--
--   1. GRANT — `public.official_snapshots` nasceu com os privilégios padrão que
--      o Supabase concede a `anon` e `authenticated` (`arwdDxtm`: TODOS, DELETE
--      e TRUNCATE inclusive). Nenhuma migration os revogou.
--   2. RLS — a tabela tem `force row level security` e UMA única policy,
--      `snapshots_read` (SELECT). Sem policy de DELETE, nenhuma linha é
--      VISÍVEL para o comando: o DELETE casa com zero linhas.
--   3. TRIGGER — `trg_snapshot_no_delete` é `for each row`. Zero linhas
--      casadas, zero execuções: a trava nunca chega a disparar.
--
-- Resultado: comando válido (havia privilégio), zero linhas afetadas, nenhuma
-- exceção. O PostgREST traduz isso, corretamente, como 200. O erro não estava
-- no PostgREST — estava em conceder DELETE a quem nunca pode apagar.
--
-- CORREÇÃO. O mesmo remédio que a 0029 aplicou em `audit_logs`, a outra tabela
-- append-only do sistema: retirar da roles do cliente o privilégio de escrita
-- que elas não usam. Sem GRANT, a tentativa falha no PRIMEIRO portão, com
-- "permission denied for table official_snapshots" e HTTP 401/403 — uma recusa
-- que se parece com uma recusa.
--
-- TRUNCATE entra junto e por um motivo próprio: gatilho `for each row` não
-- dispara em TRUNCATE de jeito nenhum, então ali o privilégio era a ÚNICA
-- proteção. Fica revogado e, como segunda camada, ganha um gatilho de
-- statement — o análogo do `trg_snapshot_no_delete` para o comando que não
-- enxerga linhas.
--
-- QUEM ESCREVE SNAPSHOT continua escrevendo: `validate_evaluation` é
-- `security definer` de `postgres`, dono da tabela, e não depende de grant do
-- cliente. Nenhuma aprovação muda. `service_role` é preservado, como em
-- `audit_logs`, para tarefas administrativas fora do caminho do usuário.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. O cliente perde a escrita que nunca deveria ter tido
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.official_snapshots
  from authenticated, anon;

-- A leitura por escopo (`snapshots_read`) permanece intacta.
grant select on public.official_snapshots to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. Segunda camada: o gatilho que o TRUNCATE não podia acionar
-- ---------------------------------------------------------------------------
-- `trg_snapshot_no_delete` e `trg_snapshot_no_update` (0003) continuam onde
-- estão, para linha a linha. Este cobre o comando que apaga a tabela inteira
-- sem passar por linha nenhuma.
drop trigger if exists trg_snapshot_no_truncate on public.official_snapshots;
create trigger trg_snapshot_no_truncate before truncate on public.official_snapshots
  for each statement execute function app.block_mutation();
