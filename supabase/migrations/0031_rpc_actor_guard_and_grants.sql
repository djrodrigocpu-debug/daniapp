-- =============================================================================
-- AAPEX 1.3.2 — Migration 0031: guarda de ator, grants mínimos e ordem de
--                               autorização nas RPCs remanescentes (H-01, H-01b, H-02)
-- =============================================================================
-- ACHADOS DA SIMULAÇÃO DE 30 DIAS (staging, AAPEx 1.3.1). Três defeitos de
-- endurecimento, nenhum deles explorável hoje, todos da mesma família que já
-- produziu D-03 e foi fechada pela 0030 — ali só nas duas RPCs de evidência.
--
-- H-01 — EXECUTE PARA PUBLIC/anon. Sete `security definer` continuavam com o
-- EXECUTE que o PostgreSQL concede a PUBLIC ao criar a função, e a 0006 ainda
-- concedeu explicitamente a `anon`:
--
--   start_evaluation · validate_evaluation · remove_evidence
--   update_indicator_result · create_visit_report
--   admin_set_user_active · admin_set_user_role
--
-- A exploração anônima falhou na simulação porque `app.is_admin`, `app.has_role`
-- e `app.has_operation_access` são `select exists (…)` — devolvem FALSE, nunca
-- NULL. O grant é, ainda assim, privilégio que ninguém precisa, e contradiz a
-- convenção que 0010–0030 já aplicam no resto do catálogo.
--
-- H-01b — GUARDA FRÁGIL EM remove_evidence. A decisão era
--
--   if v_author <> auth.uid() or not app.has_operation_access(v_op) then raise …
--
-- Sem sessão, `v_author <> auth.uid()` é NULL, não FALSE. A função só não é uma
-- brecha porque o SEGUNDO termo é TRUE e `NULL or TRUE` é TRUE. Em outras
-- palavras: a segurança vinha da precedência dos operadores e da ordem dos
-- termos, não de uma recusa. Trocar a ordem dos termos, ou dar acesso de escopo
-- ao anônimo em qualquer refatoração futura, transformaria isso em D-03 outra
-- vez. É a mesma classe lógica; passa a ser decisão booleana total e fechada.
--
-- H-02 — ORDEM DE VALIDAÇÃO. `validate_evaluation` conferia o ESTADO da
-- avaliação antes da autenticação, do escopo e do papel. Um chamador anônimo,
-- de posse apenas do UUID, distinguia "não está aguardando validação" (400) de
-- qualquer outra coisa: um oráculo de estado. Nenhum dado vazava, mas o ciclo de
-- vida de uma avaliação alheia era observável. A ordem passa a ser
--
--   ator → registro → escopo → segregação → papel → estado → regra empresarial
--
-- e "inexistente" e "fora do escopo" respondem A MESMA COISA, para que a
-- existência do UUID também não seja observável.
--
-- NENHUMA REGRA EMPRESARIAL MUDA. Quem podia fazer cada operação continua
-- podendo, com a mesma mensagem; quem não podia continua recusado. O que muda é
-- que "sem sessão" passa a ser NÃO por decisão explícita, e que o não
-- autorizado deixa de aprender o estado do recurso pela diferença das recusas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. start_evaluation — abertura de ciclo
-- ---------------------------------------------------------------------------
-- `p_evaluator_id` continua ignorado de propósito: o autor gravado é `auth.uid()`,
-- nunca o que o cliente diria. O parâmetro permanece só para não quebrar o
-- contrato de quem já chama.
create or replace function public.start_evaluation(
  p_operation_id uuid, p_frequency text, p_evaluator_id uuid
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid  uuid;
  v_eval uuid;
  v_tpl  uuid;
  v_freq app.visit_type := p_frequency::app.visit_type;
  v_now  timestamptz := now();
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  if not coalesce(app.has_operation_access(p_operation_id), false) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotência: rascunho/devolvida do mesmo tipo é reaproveitado (sem duplicar).
  select id into v_eval from public.evaluations
   where operation_id = p_operation_id and status in ('draft','returned') and frequency = v_freq
   limit 1;
  if v_eval is not null then
    return app.evaluation_dto(v_eval);
  end if;

  select id into v_tpl from public.audit_template_versions order by effective_from desc limit 1;
  if v_tpl is null then
    raise exception 'nenhuma versao de template de auditoria disponivel';
  end if;

  insert into public.evaluations (
    operation_id, template_version_id, author_user_id, status, score,
    frequency, cycle_label, period_start, period_end
  ) values (
    p_operation_id, v_tpl, v_uid, 'draft', 0,
    v_freq,
    case when v_freq = 'weekly'
      then 'Semana de ' || to_char(v_now, 'DD/MM/YYYY')
      else initcap(to_char(v_now, 'TMMonth')) || ' de ' || to_char(v_now, 'YYYY') end,
    v_now::date,
    (v_now + (case when v_freq = 'weekly' then interval '6 days' else interval '29 days' end))::date
  ) returning id into v_eval;

  -- Respostas em branco para os itens do template na frequência do ciclo.
  insert into public.evaluation_answers (evaluation_id, item_id, status, measured_value, observation)
  select v_eval, ai.id, 'not_evaluated', '', ''
    from public.audit_items ai
   where ai.template_version_id = v_tpl and ai.frequency = v_freq;

  return app.evaluation_dto(v_eval);
end $$;

-- ---------------------------------------------------------------------------
-- 2. remove_evidence — H-01b
-- ---------------------------------------------------------------------------
-- Quem pode remover NÃO muda: o autor da avaliação, dentro do escopo dela, e o
-- arquivo só sai se ele também for o autor do arquivo (segundo filtro, que já
-- existia). O que muda é a forma da decisão: `A and B` fechado por `coalesce`,
-- em vez de `not A or not B` avaliado em lógica de três valores.
create or replace function public.remove_evidence(p_evaluation_id uuid, p_evidence_id uuid)
  returns void
  language plpgsql security definer set search_path = public, app as $$
declare v_uid uuid; v_op uuid; v_author uuid;
begin
  -- Sem sessão não há escopo possível: recusa ANTES de ler o registro, para que
  -- nem a existência da avaliação seja observável sem login.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select operation_id, author_user_id into v_op, v_author
    from public.evaluations where id = p_evaluation_id;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;

  -- Decisão booleana TOTAL: autor E escopo. `coalesce` fecha a lógica de três
  -- valores — ausência de resposta é NÃO, e não "não sei, então segue".
  if not coalesce(v_author = v_uid and app.has_operation_access(v_op), false) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  delete from public.evaluation_answer_evidence
   where evidence_id = p_evidence_id
     and answer_id in (select id from public.evaluation_answers where evaluation_id = p_evaluation_id);
  delete from public.evidence_files where id = p_evidence_id and author_user_id = v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- 3. validate_evaluation — H-02
-- ---------------------------------------------------------------------------
create or replace function public.validate_evaluation(
  p_evaluation_id uuid, p_decision text, p_note text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid uuid; v_op uuid; v_author uuid; v_status app.evaluation_status;
  v_tpl uuid; v_score numeric;
begin
  -- (1) ATOR. Antes de qualquer leitura.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) REGISTRO.
  select operation_id, author_user_id, status, template_version_id, score
    into v_op, v_author, v_status, v_tpl, v_score
    from public.evaluations where id = p_evaluation_id;

  -- (3) ESCOPO. "Inexistente" e "fora do escopo" respondem A MESMA COISA: sem
  -- isso, varrer UUIDs distingue o que existe do que não existe, e era por aqui
  -- que o estado alheio vazava.
  if v_op is null or not coalesce(app.has_operation_access(v_op), false) then
    raise exception 'avaliacao inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  -- (4) SEGREGAÇÃO DE FUNÇÕES (T02). Vem antes do papel porque é a recusa mais
  -- específica e mais útil para quem já está dentro do escopo — e é exatamente
  -- a ordem relativa que a 0006 já tinha entre as duas.
  if coalesce(v_author = v_uid, false) then
    raise exception 'nao e permitido validar a propria avaliacao'
      using errcode = 'insufficient_privilege';
  end if;

  -- (5) PAPEL AUTORIZADOR.
  if not coalesce(
       app.is_admin() or app.has_role('regional') or app.has_role('coordinator'),
       false) then
    raise exception 'perfil sem permissao de validacao' using errcode = 'insufficient_privilege';
  end if;

  -- (6) ESTADO. Só agora: daqui para baixo o chamador já provou que PODE validar
  -- esta avaliação, então a mensagem empresarial é informação a que ele tem
  -- direito — e não um oráculo para quem não tem.
  if v_status <> 'submitted' then
    raise exception 'avaliacao nao esta aguardando validacao'
      using errcode = 'integrity_constraint_violation';
  end if;

  if p_decision = 'approved' then
    update public.evaluations set
      status = 'approved', approved_at = now(), validated_at = now(),
      validator_user_id = v_uid, validator_note = p_note
     where id = p_evaluation_id;

    insert into public.official_snapshots (
      evaluation_id, operation_id, period, score, template_version_id, payload, approved_by_user_id
    ) values (
      p_evaluation_id, v_op,
      coalesce((select to_char(period_start, 'YYYY-MM') from public.evaluations where id = p_evaluation_id),
               to_char(now(), 'YYYY-MM')),
      v_score, v_tpl, app.evaluation_dto(p_evaluation_id), v_uid
    );

    insert into public.validations (evaluation_id, validator_user_id, decision, reason)
    values (p_evaluation_id, v_uid, 'approved', p_note);

  elsif p_decision = 'returned' then
    update public.evaluations set
      status = 'returned', validated_at = now(),
      validator_user_id = v_uid, validator_note = p_note
     where id = p_evaluation_id;

    insert into public.validations (evaluation_id, validator_user_id, decision, reason)
    values (p_evaluation_id, v_uid, 'returned', p_note);
  else
    raise exception 'decisao invalida: %', p_decision;
  end if;

  return app.evaluation_dto(p_evaluation_id);
end $$;

-- ---------------------------------------------------------------------------
-- 4. update_indicator_result
-- ---------------------------------------------------------------------------
create or replace function public.update_indicator_result(p_result_id uuid, p_patch jsonb)
  returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_uid uuid; v_op uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select operation_id into v_op from public.indicator_results where id = p_result_id;
  if v_op is null then raise exception 'resultado inexistente'; end if;
  if not coalesce(app.has_operation_access(v_op), false) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;
  update public.indicator_results set
    target      = coalesce((p_patch->>'target')::numeric, target),
    actual      = coalesce((p_patch->>'actual')::numeric, actual),
    diagnosis   = coalesce(p_patch->>'diagnosis', diagnosis),
    observation = coalesce(p_patch->>'observation', observation)
   where id = p_result_id;

  return (
    select jsonb_build_object(
      'id', r.id, 'operationId', r.operation_id, 'indicatorId', r.indicator_id,
      'period', r.period, 'target', r.target::double precision, 'actual', r.actual::double precision,
      'previousActual', r.previous_actual::double precision, 'diagnosis', r.diagnosis,
      'observation', r.observation, 'updatedAt', r.updated_at
    ) from public.indicator_results r where r.id = p_result_id
  );
end $$;

-- ---------------------------------------------------------------------------
-- 5. create_visit_report
-- ---------------------------------------------------------------------------
-- `p_created_by` segue ignorado, como em `start_evaluation`: o autor é o do JWT.
create or replace function public.create_visit_report(p_input jsonb, p_created_by uuid)
  returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_uid uuid; v_op uuid := (p_input->>'operationId')::uuid; v_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  if not coalesce(app.has_operation_access(v_op), false) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;
  insert into public.visit_reports (
    operation_id, objective, summary, critical_indicators, action_plan_ids, next_review_date, created_by
  ) values (
    v_op, coalesce(p_input->>'objective',''), coalesce(p_input->>'summary',''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_input->'criticalIndicators','[]'::jsonb)) x), '{}'),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_input->'actionPlanIds','[]'::jsonb)) x), '{}'),
    nullif(p_input->>'nextReviewDate','')::date, v_uid
  ) returning id into v_id;

  return (
    select jsonb_build_object(
      'id', vr.id, 'operationId', vr.operation_id, 'createdAt', vr.created_at, 'createdBy', vr.created_by,
      'objective', vr.objective, 'summary', vr.summary,
      'criticalIndicators', to_jsonb(vr.critical_indicators), 'actionPlanIds', to_jsonb(vr.action_plan_ids),
      'nextReviewDate', vr.next_review_date::text
    ) from public.visit_reports vr where vr.id = v_id
  );
end $$;

-- ---------------------------------------------------------------------------
-- 6. admin_set_user_active / admin_set_user_role
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
  returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(app.is_admin(), false) then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;
  update public.users set status = (case when p_active then 'active' else 'suspended' end)::app.user_status
   where id = p_user_id;
  if not found then raise exception 'usuario inexistente'; end if;
  return app.user_dto(p_user_id);
end $$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
  returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(app.is_admin(), false) then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;
  update public.user_scopes set active = false where user_id = p_user_id and active;
  insert into public.user_scopes (user_id, role, created_by)
    values (p_user_id, p_role::app.role_code, v_uid);
  return app.user_dto(p_user_id);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Segunda camada: sem EXECUTE, a chamada anônima nem chega ao corpo (H-01)
-- ---------------------------------------------------------------------------
-- `revoke ... from public, anon` remove tanto o EXECUTE herdado do padrão do
-- PostgreSQL quanto o que a 0006 concedeu nominalmente a `anon`. `authenticated`
-- é reconcedido logo abaixo: a decisão de PAPEL e ESCOPO continua onde sempre
-- esteve, dentro de cada função.
revoke all on function public.start_evaluation(uuid, text, uuid)          from public, anon;
revoke all on function public.validate_evaluation(uuid, text, text)       from public, anon;
revoke all on function public.remove_evidence(uuid, uuid)                 from public, anon;
revoke all on function public.update_indicator_result(uuid, jsonb)        from public, anon;
revoke all on function public.create_visit_report(jsonb, uuid)            from public, anon;
revoke all on function public.admin_set_user_active(uuid, boolean)        from public, anon;
revoke all on function public.admin_set_user_role(uuid, text)             from public, anon;

grant execute on function public.start_evaluation(uuid, text, uuid)       to authenticated;
grant execute on function public.validate_evaluation(uuid, text, text)    to authenticated;
grant execute on function public.remove_evidence(uuid, uuid)              to authenticated;
grant execute on function public.update_indicator_result(uuid, jsonb)     to authenticated;
grant execute on function public.create_visit_report(jsonb, uuid)         to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean)     to authenticated;
grant execute on function public.admin_set_user_role(uuid, text)          to authenticated;
