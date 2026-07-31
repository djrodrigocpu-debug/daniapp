-- =============================================================================
-- AAPEX 1.3.2 — Migration 0034: guarda de estado na remoção de evidência (O-04)
--                               e imutabilidade completa de audit_logs (O-05)
-- =============================================================================
-- Dois bloqueadores encontrados NA PRÓPRIA homologação da 1.3.2, depois que
-- 0031/0032/0033 já estavam no staging.
--
-- O-04 — REMOÇÃO DE EVIDÊNCIA APÓS A SUBMISSÃO.
-- O ciclo de vida da comprovação estava pela metade. ANEXAR é travado por
-- estado desde a 0028: `reserve_evidence_upload` responde "evidencia so em
-- rascunho/devolvida". REMOVER não tinha guarda nenhuma. Comprovado em banco:
-- o autor de uma avaliação já `submitted` chamava `remove_evidence` e o
-- metadata e o vínculo saíam sem erro.
--
-- Por que ninguém pegou antes: não há gatilho em `evaluation_answer_evidence`
-- nem em `evidence_files`, e a RPC é `security definer` de `postgres`, que tem
-- `rolbypassrls` — a RLS não a alcança. Ou seja, não havia NENHUMA camada
-- verificando estado nesse caminho.
--
-- A consequência é direta: `submit_evaluation` exige comprovação em todo item
-- com `evidence_required`, e é esse portão que libera o envio. Removida a
-- comprovação depois, a avaliação segue `submitted` — e depois `approved`, com
-- snapshot oficial — apoiada em evidência que não existe mais. O portão de
-- envio vira uma formalidade do instante do clique.
--
-- Além da guarda de estado, a avaliação passa a ser DERIVADA da evidência
-- (`evidence_files.source_object_id`, que é not null) e conferida contra o
-- `p_evaluation_id` recebido. Antes, o par avaliação/evidência vinha do cliente
-- sem ser cruzado: só a FK `NO ACTION` de `evaluation_answer_evidence` impedia
-- que um par incoerente deixasse vínculo órfão, e depender de erro de FK para
-- manter integridade é depender de sorte, não de decisão.
--
-- O-05 — audit_logs COM TRUNCATE.
-- A 0029 revogou insert/update/delete, e a 0003 pôs `trg_audit_no_update` e
-- `trg_audit_no_delete`. Faltava TRUNCATE, e ele é justamente o comando que
-- nenhum gatilho `for each row` enxerga: zero linhas visitadas, zero execuções.
-- Na trilha inteira, o privilégio era a única proteção — e ele estava concedido
-- a `anon` e a `authenticated` (`rDxtm`). Mesmo remédio que a 0033 aplicou em
-- `official_snapshots`: revogar E pôr um gatilho de statement.
--
-- NENHUMA REGRA DE ESCOPO, PAPEL OU CÁLCULO MUDA. Quem podia remover em
-- rascunho continua removendo, com o mesmo efeito. O que muda é que a janela de
-- remoção passa a ser a mesma janela em que anexar é permitido.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. remove_evidence — autorização, trava e ESTADO, nessa ordem
-- ---------------------------------------------------------------------------
create or replace function public.remove_evidence(p_evaluation_id uuid, p_evidence_id uuid)
  returns void
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid        uuid;
  v_op         uuid;
  v_autor      uuid;
  v_status     app.evaluation_status;
  v_eval_da_ev uuid;
  v_autor_ev   uuid;
begin
  -- (1) ATOR. Antes de qualquer leitura: sem sessão não há escopo possível.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) TRAVA ANTES DE DECIDIR. `for update` serializa esta chamada contra o
  -- `submit_evaluation` concorrente, que trava a MESMA linha do mesmo jeito
  -- (0027). Sem isso, remoção e submissão poderiam ler `draft` as duas e a
  -- avaliação terminaria enviada sem a comprovação que liberou o envio.
  select e.operation_id, e.author_user_id, e.status
    into v_op, v_autor, v_status
    from public.evaluations e
   where e.id = p_evaluation_id
     for update;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;

  -- (3) A avaliação da EVIDÊNCIA, derivada do registro real — não do que o
  -- cliente diria. `source_object_id` é not null: evidência sempre sabe de onde
  -- veio. Evidência inexistente deixa os dois nulos e cai na recusa de (4),
  -- igual a "não é sua": dizer qual dos dois é confirmaria evidência alheia.
  select ef.source_object_id, ef.author_user_id
    into v_eval_da_ev, v_autor_ev
    from public.evidence_files ef
   where ef.id = p_evidence_id;

  -- (4) AUTORIZAÇÃO. Contrato preservado: o autor da avaliação, dentro do
  -- escopo dela, removendo comprovação própria E desta avaliação. Booleano
  -- fechado por `coalesce` — ausência de resposta é NÃO.
  if not coalesce(
       v_autor       = v_uid
       and v_autor_ev = v_uid
       and v_eval_da_ev = p_evaluation_id
       and app.has_operation_access(v_op),
       false) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  -- (5) ESTADO. Só agora: o chamador já provou que pode mexer nesta avaliação,
  -- então a mensagem empresarial é informação a que ele tem direito — e não um
  -- oráculo para quem não tem. A janela é a MESMA em que anexar é permitido.
  if v_status not in ('draft', 'returned') then
    raise exception 'Evidencias so podem ser removidas enquanto a avaliacao estiver em rascunho ou devolvida.'
      using errcode = 'integrity_constraint_violation';
  end if;

  delete from public.evaluation_answer_evidence
   where evidence_id = p_evidence_id
     and answer_id in (select id from public.evaluation_answers where evaluation_id = p_evaluation_id);
  delete from public.evidence_files where id = p_evidence_id and author_user_id = v_uid;
end $$;

revoke all on function public.remove_evidence(uuid, uuid) from public, anon;
grant execute on function public.remove_evidence(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A guarda de mutação ganha search_path fixo
-- ---------------------------------------------------------------------------
-- Mesmo corpo da 0003, agora com `search_path` fixado. O corpo só lê `tg_op` e
-- levanta exceção: não resolve nome nenhum, então `''` não pode quebrá-lo — e
-- fecha, por construção, a classe de ataque por search_path em gatilho.
-- `create or replace` preserva os gatilhos que já apontam para cá
-- (`trg_audit_no_update`, `trg_audit_no_delete`, `trg_snapshot_no_update`,
-- `trg_snapshot_no_delete`, `trg_snapshot_no_truncate`).
create or replace function app.block_mutation() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'append-only: % nao permitido nesta tabela', tg_op
    using errcode = 'insufficient_privilege';
end $$;

-- ---------------------------------------------------------------------------
-- 3. audit_logs — o privilégio que faltava, e o gatilho que o TRUNCATE vê
-- ---------------------------------------------------------------------------
-- A 0029 já havia revogado insert/update/delete; TRUNCATE ficou de fora e é o
-- único comando que os gatilhos `for each row` não conseguem interceptar.
-- Repetido aqui por inteiro para que esta migration seja legível sozinha e
-- idempotente: revogar privilégio ausente não é erro.
revoke insert, update, delete, truncate on public.audit_logs
  from public, anon, authenticated;

-- A leitura permanece exatamente como está: a policy `audit_read` (o próprio
-- ator, Administrador ou Gerência Regional) continua sendo quem decide.
grant select on public.audit_logs to anon, authenticated;

-- Segunda camada, para o comando que não passa por linha nenhuma.
drop trigger if exists trg_audit_no_truncate on public.audit_logs;
create trigger trg_audit_no_truncate before truncate on public.audit_logs
  for each statement execute function app.block_mutation();
