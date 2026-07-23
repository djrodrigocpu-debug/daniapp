-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0006: RPCs de domínio (Masterplan §6, §7.4, §11.4)
-- =============================================================================
-- Caminho de ESCRITA autoritativo do servidor. Todos os RPCs referenciados por
-- `src/data/repositories/Supabase*Repository.ts`. Padrão de segurança:
--   * SECURITY DEFINER (dono = postgres) para poder escrever em tabelas cuja RLS
--     nega escrita direta ao cliente (ex.: official_snapshots §11.4);
--   * COMO DEFINER ignora RLS, a autorização é feita EXPLICITAMENTE no corpo, com
--     as mesmas funções da RLS (app.is_admin / has_operation_access / can_validate);
--   * search_path fixo (public, app) — anti-hijack;
--   * retorno em jsonb camelCase, reusando as projeções ui_* como DTO canônico;
--   * nunca leem service_role; a chave privilegiada não existe no cliente (T03).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de DTO (schema app; não expostos ao PostgREST). Rodam como o dono do
-- RPC (postgres) e portanto leem as views ui_* sem o filtro de RLS — a
-- autorização já foi decidida no RPC chamador.
-- ---------------------------------------------------------------------------
create or replace function app.evaluation_dto(p_eval uuid) returns jsonb
  language sql stable set search_path = public, app as $$
  select to_jsonb(v) from public.ui_evaluations v where v."id" = p_eval
$$;

create or replace function app.action_plan_dto(p_id uuid) returns jsonb
  language sql stable set search_path = public, app as $$
  select to_jsonb(v) from public.ui_action_plans v where v."id" = p_id
$$;

create or replace function app.user_dto(p_id uuid) returns jsonb
  language sql stable set search_path = public, app as $$
  select to_jsonb(v) from public.ui_users v where v."id" = p_id
$$;

create or replace function app.indicator_dto(p_id uuid) returns jsonb
  language sql stable set search_path = public, app as $$
  select to_jsonb(v) from public.ui_indicators v where v."id" = p_id
$$;

-- Nota projetada (espelha src/utils/scoring.ts calculateScore §6.4):
-- green=1, yellow=0.5, red/not_evaluated=0, not_applicable excluído do total.
create or replace function app.evaluation_score(p_eval uuid) returns numeric
  language sql stable set search_path = public, app as $$
  select coalesce(round(
      sum(case ea.status when 'green' then ai.weight when 'yellow' then ai.weight * 0.5 else 0 end)
      / nullif(sum(case when ea.status = 'not_applicable' then 0 else ai.weight end), 0) * 100
    ), 0)
  from public.evaluation_answers ea
  join public.audit_items ai on ai.id = ea.item_id
  where ea.evaluation_id = p_eval
$$;

-- ===========================================================================
-- CICLO DE AUDITORIA / AVALIAÇÃO
-- ===========================================================================

-- Abre (ou reaproveita) a auditoria do ciclo — idempotente por operação+freq.
create or replace function public.start_evaluation(
  p_operation_id uuid, p_frequency text, p_evaluator_id uuid
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_eval uuid;
  v_tpl  uuid;
  v_freq app.visit_type := p_frequency::app.visit_type;
  v_now  timestamptz := now();
begin
  if not app.has_operation_access(p_operation_id) then
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
    p_operation_id, v_tpl, auth.uid(), 'draft', 0,
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

-- Salva resposta de um item (por código de tema) e recalcula a nota do rascunho.
create or replace function public.save_evaluation_answer(
  p_evaluation_id uuid, p_theme_id text, p_patch jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_op uuid; v_author uuid; v_status app.evaluation_status; v_answer uuid;
begin
  select operation_id, author_user_id, status into v_op, v_author, v_status
    from public.evaluations where id = p_evaluation_id;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;
  if v_author <> auth.uid() or not app.has_operation_access(v_op) then
    raise exception 'sem permissao para editar esta avaliacao' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('draft','returned') then
    raise exception 'respostas so podem mudar em rascunho/devolvida' using errcode = 'integrity_constraint_violation';
  end if;

  select ea.id into v_answer
    from public.evaluation_answers ea
    join public.audit_items ai on ai.id = ea.item_id
   where ea.evaluation_id = p_evaluation_id and ai.code = p_theme_id;
  if v_answer is null then raise exception 'item % nao pertence a avaliacao', p_theme_id; end if;

  update public.evaluation_answers set
    status        = coalesce((p_patch->>'status')::app.traffic_light, status),
    measured_value= coalesce(p_patch->>'measuredValue', measured_value),
    observation   = coalesce(p_patch->>'observation', observation)
   where id = v_answer;

  update public.evaluations set score = app.evaluation_score(p_evaluation_id)
   where id = p_evaluation_id;

  return app.evaluation_dto(p_evaluation_id);
end $$;

-- Anexa evidência (metadados) a um item e vincula à resposta.
create or replace function public.add_evidence(
  p_evaluation_id uuid, p_theme_id text, p_input jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_op uuid; v_author uuid; v_status app.evaluation_status; v_answer uuid;
  v_evid uuid; v_path text;
begin
  select operation_id, author_user_id, status into v_op, v_author, v_status
    from public.evaluations where id = p_evaluation_id;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;
  if v_author <> auth.uid() or not app.has_operation_access(v_op) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('draft','returned') then
    raise exception 'evidencia so em rascunho/devolvida' using errcode = 'integrity_constraint_violation';
  end if;

  select ea.id into v_answer from public.evaluation_answers ea
    join public.audit_items ai on ai.id = ea.item_id
   where ea.evaluation_id = p_evaluation_id and ai.code = p_theme_id;
  if v_answer is null then raise exception 'item % nao pertence a avaliacao', p_theme_id; end if;

  v_path := p_theme_id || '/' || gen_random_uuid()::text || '-' || coalesce(p_input->>'name', 'arquivo');
  insert into public.evidence_files (bucket, path, mime_type, size_bytes, author_user_id, source_object_id, status)
  values (
    'evidencias', v_path,
    coalesce(p_input->>'mimeType', 'application/octet-stream'),
    coalesce((p_input->>'sizeBytes')::bigint, 0),
    auth.uid(), p_evaluation_id, 'stored'
  ) returning id into v_evid;

  insert into public.evaluation_answer_evidence (answer_id, evidence_id) values (v_answer, v_evid);

  return jsonb_build_object(
    'id', v_evid, 'themeId', p_theme_id, 'name', p_input->>'name', 'uri', v_path,
    'mimeType', p_input->>'mimeType', 'type', coalesce(p_input->>'type', 'document'),
    'status', 'stored', 'sizeBytes', (p_input->>'sizeBytes')::bigint,
    'createdAt', now()
  );
end $$;

-- Remove o vínculo de uma evidência a uma avaliação (e o arquivo do autor).
create or replace function public.remove_evidence(
  p_evaluation_id uuid, p_evidence_id uuid
) returns void
  language plpgsql security definer set search_path = public, app as $$
declare v_op uuid; v_author uuid;
begin
  select operation_id, author_user_id into v_op, v_author
    from public.evaluations where id = p_evaluation_id;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;
  if v_author <> auth.uid() or not app.has_operation_access(v_op) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  delete from public.evaluation_answer_evidence
   where evidence_id = p_evidence_id
     and answer_id in (select id from public.evaluation_answers where evaluation_id = p_evaluation_id);
  delete from public.evidence_files where id = p_evidence_id and author_user_id = auth.uid();
end $$;

-- Envia para validação aplicando as travas (§7.4): completude, evidência, plano
-- de ação para item vermelho (espelha domain/scoring/submission canSubmit).
create or replace function public.submit_evaluation(p_evaluation_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_op uuid; v_author uuid; v_status app.evaluation_status;
begin
  select operation_id, author_user_id, status into v_op, v_author, v_status
    from public.evaluations where id = p_evaluation_id;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;
  if v_author <> auth.uid() or not app.has_operation_access(v_op) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
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
          where ap.evaluation_id = p_evaluation_id and (ap.item_id = ai.id or ap.theme_code = ai.code)
       )
  ) then raise exception 'envio bloqueado: item vermelho sem plano de acao' using errcode = 'integrity_constraint_violation';
  end if;

  update public.evaluations set status = 'submitted', submitted_at = now() where id = p_evaluation_id;
  return app.evaluation_dto(p_evaluation_id);
end $$;

-- Decisão de validação (§7.8, T02): sem autoaprovação, no escopo, perfil validador.
create or replace function public.validate_evaluation(
  p_evaluation_id uuid, p_decision text, p_note text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_op uuid; v_author uuid; v_status app.evaluation_status; v_tpl uuid; v_score numeric;
begin
  select operation_id, author_user_id, status, template_version_id, score
    into v_op, v_author, v_status, v_tpl, v_score
    from public.evaluations where id = p_evaluation_id;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;
  if v_status <> 'submitted' then
    raise exception 'avaliacao nao esta aguardando validacao' using errcode = 'integrity_constraint_violation';
  end if;
  if v_author = auth.uid() then
    raise exception 'nao e permitido validar a propria avaliacao' using errcode = 'insufficient_privilege';
  end if;
  if not (app.is_admin() or app.has_role('regional') or app.has_role('coordinator')) then
    raise exception 'perfil sem permissao de validacao' using errcode = 'insufficient_privilege';
  end if;
  if not app.has_operation_access(v_op) then
    raise exception 'avaliacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if p_decision = 'approved' then
    update public.evaluations set
      status = 'approved', approved_at = now(), validated_at = now(),
      validator_user_id = auth.uid(), validator_note = p_note
     where id = p_evaluation_id;

    insert into public.official_snapshots (
      evaluation_id, operation_id, period, score, template_version_id, payload, approved_by_user_id
    ) values (
      p_evaluation_id, v_op,
      coalesce((select to_char(period_start, 'YYYY-MM') from public.evaluations where id = p_evaluation_id),
               to_char(now(), 'YYYY-MM')),
      v_score, v_tpl, app.evaluation_dto(p_evaluation_id), auth.uid()
    );

    insert into public.validations (evaluation_id, validator_user_id, decision, reason)
    values (p_evaluation_id, auth.uid(), 'approved', p_note);

  elsif p_decision = 'returned' then
    update public.evaluations set
      status = 'returned', validated_at = now(),
      validator_user_id = auth.uid(), validator_note = p_note
     where id = p_evaluation_id;

    insert into public.validations (evaluation_id, validator_user_id, decision, reason)
    values (p_evaluation_id, auth.uid(), 'returned', p_note);
  else
    raise exception 'decisao invalida: %', p_decision;
  end if;

  return app.evaluation_dto(p_evaluation_id);
end $$;

-- ===========================================================================
-- PLANOS DE AÇÃO
-- ===========================================================================
create or replace function public.save_action_plan(p_input jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_op uuid := (p_input->>'operationId')::uuid; v_id uuid; v_item uuid; v_theme text := p_input->>'themeId';
begin
  if not app.has_operation_access(v_op) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  select id into v_item from public.audit_items where code = v_theme order by template_version_id desc limit 1;

  if (p_input ? 'id') and nullif(p_input->>'id','') is not null then
    v_id := (p_input->>'id')::uuid;
    update public.action_plans set
      operation_id      = v_op,
      evaluation_id     = nullif(p_input->>'evaluationId','')::uuid,
      item_id           = v_item,
      theme_code        = v_theme,
      description       = coalesce(p_input->>'action', description),
      action_text       = coalesce(p_input->>'action', ''),
      problem           = coalesce(p_input->>'problem', ''),
      root_cause        = coalesce(p_input->>'rootCause', ''),
      owner_name        = coalesce(p_input->>'owner', ''),
      due_date          = (p_input->>'dueDate')::date,
      priority          = coalesce(p_input->>'priority', priority),
      expected_evidence = coalesce(p_input->>'expectedEvidence', ''),
      completion_note   = p_input->>'completionNote',
      status            = app.action_status_to_db(coalesce(p_input->>'status', 'not_started'))
     where id = v_id;
  else
    insert into public.action_plans (
      operation_id, evaluation_id, item_id, theme_code, description, action_text,
      problem, root_cause, owner_name, due_date, priority, expected_evidence,
      completion_note, status, created_by
    ) values (
      v_op, nullif(p_input->>'evaluationId','')::uuid, v_item, v_theme,
      coalesce(p_input->>'action',''), coalesce(p_input->>'action',''),
      coalesce(p_input->>'problem',''), coalesce(p_input->>'rootCause',''),
      coalesce(p_input->>'owner',''), (p_input->>'dueDate')::date,
      coalesce(p_input->>'priority','medium'), coalesce(p_input->>'expectedEvidence',''),
      p_input->>'completionNote',
      app.action_status_to_db(coalesce(p_input->>'status','not_started')), auth.uid()
    ) returning id into v_id;
  end if;

  return app.action_plan_dto(v_id);
end $$;

create or replace function public.update_action_status(p_plan_id uuid, p_status text) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_op uuid;
begin
  select operation_id into v_op from public.action_plans where id = p_plan_id;
  if v_op is null then raise exception 'plano inexistente'; end if;
  if not app.has_operation_access(v_op) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;
  update public.action_plans set status = app.action_status_to_db(p_status) where id = p_plan_id;
  return app.action_plan_dto(p_plan_id);
end $$;

-- ===========================================================================
-- EVIDÊNCIAS (caminho de storage)
-- ===========================================================================
create or replace function public.evidence_path(p_evidence_id uuid) returns text
  language plpgsql security definer set search_path = public, app as $$
declare v_path text; v_author uuid; v_src uuid;
begin
  select path, author_user_id, source_object_id into v_path, v_author, v_src
    from public.evidence_files where id = p_evidence_id;
  if v_path is null then raise exception 'evidencia inexistente'; end if;
  if not (v_author = auth.uid() or app.is_admin()
          or exists (select 1 from public.evaluations e where e.id = v_src and app.has_operation_access(e.operation_id))) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  return v_path;
end $$;

create or replace function public.remove_evidence_file(p_evidence_id uuid) returns void
  language plpgsql security definer set search_path = public, app as $$
declare v_author uuid;
begin
  select author_user_id into v_author from public.evidence_files where id = p_evidence_id;
  if v_author is null then raise exception 'evidencia inexistente'; end if;
  if not (v_author = auth.uid() or app.is_admin()) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  delete from public.evaluation_answer_evidence where evidence_id = p_evidence_id;
  delete from public.evidence_files where id = p_evidence_id;
end $$;

-- ===========================================================================
-- GESTÃO ASSISTIDA (indicadores / relatório de visita)
-- ===========================================================================
create or replace function public.update_indicator_result(p_result_id uuid, p_patch jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_op uuid;
begin
  select operation_id into v_op from public.indicator_results where id = p_result_id;
  if v_op is null then raise exception 'resultado inexistente'; end if;
  if not app.has_operation_access(v_op) then
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

create or replace function public.create_visit_report(p_input jsonb, p_created_by uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_op uuid := (p_input->>'operationId')::uuid; v_id uuid;
begin
  if not app.has_operation_access(v_op) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;
  insert into public.visit_reports (
    operation_id, objective, summary, critical_indicators, action_plan_ids, next_review_date, created_by
  ) values (
    v_op, coalesce(p_input->>'objective',''), coalesce(p_input->>'summary',''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_input->'criticalIndicators','[]'::jsonb)) x), '{}'),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_input->'actionPlanIds','[]'::jsonb)) x), '{}'),
    nullif(p_input->>'nextReviewDate','')::date, auth.uid()
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

-- ===========================================================================
-- ADMINISTRAÇÃO (somente Administrador — D-05, Anexo B). is_admin no corpo.
-- ===========================================================================
create or replace function public.admin_create_user(p_input jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_uid uuid := gen_random_uuid(); v_email text := lower(p_input->>'email'); v_region uuid;
begin
  if not app.is_admin() then raise exception 'apenas administrador' using errcode = 'insufficient_privilege'; end if;
  if coalesce(v_email,'') = '' or coalesce(p_input->>'name','') = '' then
    raise exception 'nome e e-mail sao obrigatorios' using errcode = 'check_violation';
  end if;

  -- Registro de identidade. NOTA: em produção o onboarding deve usar a Auth Admin
  -- API / convite (Edge Function). Aqui criamos o vínculo de perfil (status invited).
  insert into auth.users (id, email) values (v_uid, v_email) on conflict do nothing;
  insert into public.users (id, display_name, corporate_email, status)
    values (v_uid, p_input->>'name', v_email, 'invited');

  select id into v_region from public.regions where name = p_input->>'region' limit 1;
  insert into public.user_scopes (user_id, role, region_id, created_by)
    values (v_uid, coalesce(p_input->>'role','channel_manager')::app.role_code, v_region, auth.uid());

  return app.user_dto(v_uid);
end $$;

create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then raise exception 'apenas administrador' using errcode = 'insufficient_privilege'; end if;
  update public.users set status = (case when p_active then 'active' else 'suspended' end)::app.user_status
   where id = p_user_id;
  if not found then raise exception 'usuario inexistente'; end if;
  return app.user_dto(p_user_id);
end $$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then raise exception 'apenas administrador' using errcode = 'insufficient_privilege'; end if;
  update public.user_scopes set active = false where user_id = p_user_id and active;
  insert into public.user_scopes (user_id, role, created_by)
    values (p_user_id, p_role::app.role_code, auth.uid());
  return app.user_dto(p_user_id);
end $$;

create or replace function public.admin_create_indicator(p_code text, p_name text, p_version jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_id uuid;
begin
  if not app.is_admin() then raise exception 'apenas administrador' using errcode = 'insufficient_privilege'; end if;
  insert into public.indicator_definitions (code, name, lifecycle, created_by)
    values (upper(p_code), p_name, 'active', auth.uid()) returning id into v_id;
  insert into public.indicator_versions (definition_id, version_number, unit, direction, target, yellow_tolerance, weight)
    values (
      v_id, 1, coalesce(p_version->>'unit','%'),
      coalesce(p_version->>'direction','higher_better')::app.indicator_direction,
      coalesce((p_version->>'target')::numeric, 0),
      coalesce((p_version->>'yellowTolerance')::numeric, 0),
      coalesce((p_version->>'weight')::numeric, 1)
    );
  return app.indicator_dto(v_id);
end $$;

create or replace function public.admin_add_indicator_version(p_indicator_id uuid, p_version jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_next int;
begin
  if not app.is_admin() then raise exception 'apenas administrador' using errcode = 'insufficient_privilege'; end if;
  select coalesce(max(version_number),0) + 1 into v_next from public.indicator_versions where definition_id = p_indicator_id;
  if v_next = 1 and not exists (select 1 from public.indicator_definitions where id = p_indicator_id) then
    raise exception 'indicador inexistente';
  end if;
  insert into public.indicator_versions (definition_id, version_number, unit, direction, target, yellow_tolerance, weight)
    values (
      p_indicator_id, v_next, coalesce(p_version->>'unit','%'),
      coalesce(p_version->>'direction','higher_better')::app.indicator_direction,
      coalesce((p_version->>'target')::numeric, 0),
      coalesce((p_version->>'yellowTolerance')::numeric, 0),
      coalesce((p_version->>'weight')::numeric, 1)
    );
  return app.indicator_dto(p_indicator_id);
end $$;

create or replace function public.admin_deactivate_indicator(p_indicator_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then raise exception 'apenas administrador' using errcode = 'insufficient_privilege'; end if;
  update public.indicator_definitions set lifecycle = 'inactive' where id = p_indicator_id;
  if not found then raise exception 'indicador inexistente'; end if;
  return app.indicator_dto(p_indicator_id);
end $$;

create or replace function public.admin_delete_indicator(p_indicator_id uuid) returns void
  language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then raise exception 'apenas administrador' using errcode = 'insufficient_privilege'; end if;
  -- O trigger guard_indicator_delete (0003) bloqueia se já houver medições (T05).
  delete from public.indicator_definitions where id = p_indicator_id;
end $$;

-- ---------------------------------------------------------------------------
-- Grants de execução para o papel autenticado (a autorização real é no corpo).
-- ---------------------------------------------------------------------------
grant execute on function
  public.start_evaluation(uuid, text, uuid),
  public.save_evaluation_answer(uuid, text, jsonb),
  public.add_evidence(uuid, text, jsonb),
  public.remove_evidence(uuid, uuid),
  public.submit_evaluation(uuid),
  public.validate_evaluation(uuid, text, text),
  public.save_action_plan(jsonb),
  public.update_action_status(uuid, text),
  public.evidence_path(uuid),
  public.remove_evidence_file(uuid),
  public.update_indicator_result(uuid, jsonb),
  public.create_visit_report(jsonb, uuid),
  public.admin_create_user(jsonb),
  public.admin_set_user_active(uuid, boolean),
  public.admin_set_user_role(uuid, text),
  public.admin_create_indicator(text, text, jsonb),
  public.admin_add_indicator_version(uuid, jsonb),
  public.admin_deactivate_indicator(uuid),
  public.admin_delete_indicator(uuid)
to authenticated;
