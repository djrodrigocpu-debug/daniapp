-- =============================================================================
-- AAPEX 1.3.1 — Migration 0027: guarda de estado no envio (D-04)
-- =============================================================================
-- DEFEITO OBSERVADO. Uma avaliação já em `submitted` aceitava `submit_evaluation`
-- de novo, sem devolução prévia, e o reenvio ainda mexia em `submitted_at` e em
-- `row_version`. A máquina de estados existia no papel, mas não no envio.
--
-- CAUSA. A 0006 tinha a trava `if v_status not in ('draft','returned')`. Quando a
-- 0025 reescreveu a função inteira para acrescentar o 4º portão (justificativa de
-- "Não aplicável"), a declaração `v_status` e o `select ... into` foram mantidos,
-- mas o `if` que usava o valor não foi transcrito. A variável passou a ser lida e
-- descartada — por isso o defeito não aparece na leitura rápida do diff.
--
-- CORREÇÃO. Esta migration NÃO restaura a versão antiga: preserva integralmente o
-- corpo vigente da 0025 (permissão, completude, evidência obrigatória, plano para
-- item vermelho, justificativa de N/A) e acrescenta apenas a guarda que faltava.
--
-- CONCORRÊNCIA. O `select ... for update` trava a linha da avaliação até o fim da
-- transação. Sem ele, dois envios simultâneos (toque duplo, retry de rede) leem
-- `draft` ao mesmo tempo e ambos passam pela guarda. Com ele, o segundo envio
-- espera, relê `submitted` e é recusado — a guarda vale também sob corrida.
--
-- Recusa não tem efeito colateral: a exceção aborta a transação antes do UPDATE,
-- então `submitted_at`, `row_version`, respostas, validações e snapshot ficam
-- exatamente como estavam.
-- =============================================================================

create or replace function public.submit_evaluation(p_evaluation_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_op uuid; v_author uuid; v_status app.evaluation_status;
begin
  -- `for update`: serializa envios concorrentes da MESMA avaliação (ver cabeçalho).
  select operation_id, author_user_id, status into v_op, v_author, v_status
    from public.evaluations where id = p_evaluation_id for update;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;
  if v_author <> auth.uid() or not app.has_operation_access(v_op) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  -- GUARDA DE ESTADO (D-04). Só rascunho e devolvida podem ser enviadas; enviada
  -- e validada exigem devolução prévia pelo validador.
  if v_status not in ('draft','returned') then
    raise exception 'avaliacao nao esta em rascunho/devolvida' using errcode = 'integrity_constraint_violation';
  end if;

  -- Completude: item obrigatório não pode ficar sem avaliação.
  if exists (
    select 1 from public.evaluation_answers ea join public.audit_items ai on ai.id = ea.item_id
     where ea.evaluation_id = p_evaluation_id and ai.required and ea.status = 'not_evaluated'
  ) then raise exception 'envio bloqueado: item obrigatorio sem avaliacao' using errcode = 'integrity_constraint_violation';
  end if;

  -- Evidência obrigatória (exceto não aplicável).
  if exists (
    select 1 from public.evaluation_answers ea join public.audit_items ai on ai.id = ea.item_id
     where ea.evaluation_id = p_evaluation_id and ai.evidence_required and ea.status <> 'not_applicable'
       and not exists (select 1 from public.evaluation_answer_evidence l where l.answer_id = ea.id)
  ) then raise exception 'envio bloqueado: evidencia obrigatoria ausente' using errcode = 'integrity_constraint_violation';
  end if;

  -- Item vermelho exige plano de ação vinculado.
  if exists (
    select 1 from public.evaluation_answers ea join public.audit_items ai on ai.id = ea.item_id
     where ea.evaluation_id = p_evaluation_id and ea.status = 'red'
       and not exists (
         select 1 from public.action_plans ap
          where ap.evaluation_id = p_evaluation_id and (ap.item_id = ea.item_id or ap.theme_code = ai.code)
       )
  ) then raise exception 'envio bloqueado: item vermelho sem plano de acao' using errcode = 'integrity_constraint_violation';
  end if;

  -- Não aplicável exige justificativa útil (>= 10 caracteres após remover
  -- espaço/ponto/hífen/travessão/sublinhado). A matemática não muda: o item
  -- segue fora do numerador e do denominador.
  if exists (
    select 1 from public.evaluation_answers ea
     where ea.evaluation_id = p_evaluation_id and ea.status = 'not_applicable'
       and not app.na_reason_is_valid(ea.not_applicable_reason)
  ) then raise exception 'envio bloqueado: item nao aplicavel sem justificativa' using errcode = 'integrity_constraint_violation';
  end if;

  update public.evaluations set status = 'submitted', submitted_at = now() where id = p_evaluation_id;
  return app.evaluation_dto(p_evaluation_id);
end $$;

-- `create or replace` preserva a ACL; a reafirmação abaixo é defensiva e idempotente.
revoke all on function public.submit_evaluation(uuid) from public, anon;
grant execute on function public.submit_evaluation(uuid) to authenticated;
