-- ===========================================================================
-- 0025 — GOVERNANÇA DO WORKFLOW DE PLANOS + PORTÃO DE "NÃO APLICÁVEL"
-- (Parte 2 de 2 — usa os valores de enum e colunas criados na 0024.)
--
-- O Manual do Gerente de Canal é normativo (decisão do proprietário):
--   * GC atualiza até Concluído; NUNCA registra Validado;
--   * Validado é registrado só por Coordenação/Regional/Administração,
--     nunca pelo criador do plano, só a partir de Concluído, e é terminal;
--   * Vencido é derivado da data — proibido gravar por escolha manual;
--   * "Aguardando parceiro" e "Aguardando área interna" persistem SEPARADOS.
--
-- O servidor é autoritativo: a máquina vale na RPC E em trigger na tabela,
-- porque a política actions_write (0002) permite UPDATE direto por qualquer
-- autenticado no escopo — sem o trigger, um cliente forjado gravaria
-- 'validated' por PostgREST sem passar pela RPC.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tradução banco <-> UI. blocked permanece "Aguardando área interna" e done
-- permanece "Concluído" (registros históricos não são reinterpretados);
-- waiting_partner e validated agora persistem com valor próprio.
-- ---------------------------------------------------------------------------
create or replace function app.action_status_to_ui(p_status app.action_status)
  returns text language sql immutable as $$
  select case p_status
    when 'open'                then 'not_started'
    when 'in_progress'         then 'in_progress'
    when 'waiting_partner'     then 'waiting_partner'
    when 'blocked'             then 'waiting_internal'
    when 'done'                then 'completed'
    when 'validated'           then 'validated'
    when 'overdue'             then 'overdue'
    when 'cancelled_justified' then 'completed'
  end
$$;

-- Recusa vocabulário desconhecido em vez de degradar para 'open' em silêncio.
create or replace function app.action_status_to_db(p_status text)
  returns app.action_status language plpgsql immutable as $$
declare v app.action_status;
begin
  v := case p_status
    when 'not_started'      then 'open'::app.action_status
    when 'in_progress'      then 'in_progress'::app.action_status
    when 'waiting_partner'  then 'waiting_partner'::app.action_status
    when 'waiting_internal' then 'blocked'::app.action_status
    when 'completed'        then 'done'::app.action_status
    when 'validated'        then 'validated'::app.action_status
    when 'overdue'          then 'overdue'::app.action_status
    else null
  end;
  if v is null then
    raise exception 'status desconhecido: %', p_status using errcode = 'check_violation';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Máquina de estados canônica (vocabulário do banco). Fonte da paridade com a
-- tabela TypeScript (src/domain/workflow/stateMachine.ts) — teste de paridade
-- em src/db/action_plan_governance.integration.test.ts.
-- DIVERGÊNCIA REGISTRADA: 'overdue' como ORIGEM não está na tabela do manual
-- (Vencido é derivado), mas caminhos antigos persistiram 'overdue' fisicamente;
-- sem estas saídas um plano legado ficaria preso. Mesmas saídas de in_progress.
-- ---------------------------------------------------------------------------
create or replace function app.action_transition_allowed(
  p_from app.action_status, p_to app.action_status
) returns boolean language sql immutable as $$
  select case p_from
    when 'open'            then p_to in ('in_progress', 'waiting_partner', 'blocked')
    when 'in_progress'     then p_to in ('waiting_partner', 'blocked', 'done')
    when 'waiting_partner' then p_to in ('in_progress', 'blocked', 'done')
    when 'blocked'         then p_to in ('in_progress', 'waiting_partner', 'done')
    when 'done'            then p_to in ('in_progress', 'validated')
    when 'overdue'         then p_to in ('in_progress', 'waiting_partner', 'blocked', 'done')
    else false -- validated e cancelled_justified são terminais
  end
$$;

-- Nome funcional do validador para exibição (sem UUID, sem e-mail na tela).
-- SECURITY DEFINER porque a RLS de users esconde outros usuários de um GC —
-- e o GC precisa VER quem validou o plano dele. Expõe apenas display_name.
create or replace function app.user_display_name(p_user uuid)
  returns text language sql stable security definer set search_path = public, app as $$
  select display_name from public.users where id = p_user
$$;

-- Justificativa de "Não aplicável": >= 10 caracteres úteis após remover
-- espaço, ponto, hífen, travessão e sublinhado. Paridade com
-- src/domain/scoring/notApplicable.ts (mesma expressão, mesmo limiar).
create or replace function app.na_reason_is_valid(p_reason text)
  returns boolean language sql immutable as $$
  select length(regexp_replace(coalesce(p_reason, ''), '[\s.\-–—_]', '', 'g')) >= 10
$$;

-- ---------------------------------------------------------------------------
-- Guarda na TABELA (defesa em profundidade): vale para a RPC e para qualquer
-- escrita direta autenticada permitida pela RLS. Sessões sem JWT (postgres,
-- migrations, manutenção) não são restringidas.
-- ---------------------------------------------------------------------------
create or replace function app.guard_action_plan_write() returns trigger
  language plpgsql as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Autoria autoritativa: sempre o autenticado, nunca o payload (§7.4).
    new.created_by := auth.uid();
    if new.status in ('validated', 'overdue') then
      raise exception 'plano novo nao pode nascer % (validado exige conclusao; vencido e derivado da data)',
        app.action_status_to_ui(new.status) using errcode = 'integrity_constraint_violation';
    end if;
    if new.validated_by is not null or new.validated_at is not null then
      raise exception 'campos de validacao so sao gravados pela transicao para validado'
        using errcode = 'integrity_constraint_violation';
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if old.status = 'validated' then
    raise exception 'plano validado e imutavel' using errcode = 'integrity_constraint_violation';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'autoria do plano nao pode ser alterada' using errcode = 'integrity_constraint_violation';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'overdue' then
      raise exception 'vencido e derivado da data, nao e escolha manual'
        using errcode = 'integrity_constraint_violation';
    end if;
    if not app.action_transition_allowed(old.status, new.status) then
      raise exception 'transicao invalida de % para %',
        app.action_status_to_ui(old.status), app.action_status_to_ui(new.status)
        using errcode = 'integrity_constraint_violation';
    end if;
    if new.status = 'validated' then
      if not (app.is_admin() or app.has_role('regional') or app.has_role('coordinator')) then
        raise exception 'apenas coordenacao, regional ou administracao registram validado'
          using errcode = 'insufficient_privilege';
      end if;
      if old.created_by is null then
        raise exception 'plano sem autoria registrada: validacao bloqueada'
          using errcode = 'integrity_constraint_violation';
      end if;
      if old.created_by = auth.uid() then
        raise exception 'quem criou o plano nao pode valida-lo'
          using errcode = 'insufficient_privilege';
      end if;
      -- Escrita atômica da trilha: status + validador + data na MESMA linha.
      new.validated_by := auth.uid();
      new.validated_at := coalesce(new.validated_at, now());
    end if;
  end if;

  if new.status <> 'validated'
     and (new.validated_by is not null or new.validated_at is not null) then
    raise exception 'campos de validacao so sao gravados pela transicao para validado'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_action_plan_insert on public.action_plans;
create trigger trg_guard_action_plan_insert before insert on public.action_plans
  for each row execute function app.guard_action_plan_write();
drop trigger if exists trg_guard_action_plan_update on public.action_plans;
create trigger trg_guard_action_plan_update before update on public.action_plans
  for each row execute function app.guard_action_plan_write();

-- ---------------------------------------------------------------------------
-- RPC de mudança de status: verificação explícita (mensagens amigáveis) +
-- escrita que o trigger revalida. Mesmo status = no-op idempotente (o clique
-- repetido no botão ativo não é uma transição).
-- ---------------------------------------------------------------------------
create or replace function public.update_action_status(p_plan_id uuid, p_status text) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_op uuid; v_current app.action_status; v_created_by uuid;
  v_new app.action_status;
begin
  select operation_id, status, created_by into v_op, v_current, v_created_by
    from public.action_plans where id = p_plan_id;
  if v_op is null then raise exception 'plano inexistente'; end if;
  if not app.has_operation_access(v_op) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if p_status = 'overdue' then
    raise exception 'vencido e derivado da data, nao e escolha manual'
      using errcode = 'integrity_constraint_violation';
  end if;
  v_new := app.action_status_to_db(p_status);

  if v_new = v_current then
    return app.action_plan_dto(p_plan_id);
  end if;

  if v_current = 'validated' then
    raise exception 'plano validado e imutavel' using errcode = 'integrity_constraint_violation';
  end if;
  if not app.action_transition_allowed(v_current, v_new) then
    raise exception 'transicao invalida de % para %',
      app.action_status_to_ui(v_current), app.action_status_to_ui(v_new)
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_new = 'validated' then
    if not (app.is_admin() or app.has_role('regional') or app.has_role('coordinator')) then
      raise exception 'apenas coordenacao, regional ou administracao registram validado'
        using errcode = 'insufficient_privilege';
    end if;
    if v_created_by is null then
      raise exception 'plano sem autoria registrada: validacao bloqueada'
        using errcode = 'integrity_constraint_violation';
    end if;
    if v_created_by = auth.uid() then
      raise exception 'quem criou o plano nao pode valida-lo'
        using errcode = 'insufficient_privilege';
    end if;
    update public.action_plans
       set status = 'validated', validated_by = auth.uid(), validated_at = now()
     where id = p_plan_id;
  else
    update public.action_plans set status = v_new where id = p_plan_id;
  end if;

  return app.action_plan_dto(p_plan_id);
end $$;

-- ---------------------------------------------------------------------------
-- save_action_plan: edição de CONTEÚDO não muda status (a mudança de status é
-- exclusiva de update_action_status); plano validado é imutável; plano novo
-- nasce com status operacional e autoria do autenticado.
-- ---------------------------------------------------------------------------
create or replace function public.save_action_plan(p_input jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_op uuid := (p_input->>'operationId')::uuid; v_id uuid; v_item uuid;
  v_theme text := p_input->>'themeId'; v_current app.action_status;
  v_status app.action_status;
begin
  if not app.has_operation_access(v_op) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  select id into v_item from public.audit_items where code = v_theme order by template_version_id desc limit 1;

  if (p_input ? 'id') and nullif(p_input->>'id','') is not null then
    v_id := (p_input->>'id')::uuid;
    select status into v_current from public.action_plans where id = v_id;
    if v_current is null then raise exception 'plano inexistente'; end if;
    if v_current = 'validated' then
      raise exception 'plano validado e imutavel' using errcode = 'integrity_constraint_violation';
    end if;
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
      completion_note   = p_input->>'completionNote'
     where id = v_id;
  else
    v_status := app.action_status_to_db(coalesce(p_input->>'status', 'not_started'));
    if v_status in ('validated', 'overdue') then
      raise exception 'plano novo nao pode nascer % (validado exige conclusao; vencido e derivado da data)',
        app.action_status_to_ui(v_status) using errcode = 'integrity_constraint_violation';
    end if;
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
      p_input->>'completionNote', v_status, auth.uid()
    ) returning id into v_id;
  end if;

  return app.action_plan_dto(v_id);
end $$;

-- ---------------------------------------------------------------------------
-- Projeção com a trilha de validação e a autoria (a UI esconde "Validado" de
-- quem criou o plano; a autoridade continua no servidor). Colunas novas
-- apenas APÊNDICE — create or replace view exige preservar as existentes.
-- ---------------------------------------------------------------------------
create or replace view public.ui_action_plans
  with (security_invoker = true) as
select
  a.id                                        as "id",
  a.operation_id                              as "operationId",
  coalesce(a.evaluation_id::text, '')         as "evaluationId",
  coalesce(a.theme_code, (
    select ai.code from public.audit_items ai where ai.id = a.item_id
  ), '')                                      as "themeId",
  a.problem                                   as "problem",
  a.root_cause                                as "rootCause",
  coalesce(nullif(a.action_text, ''), a.description) as "action",
  coalesce(nullif(a.owner_name, ''), a.owner_user_id::text, '') as "owner",
  a.due_date::text                            as "dueDate",
  a.priority                                  as "priority",
  a.expected_evidence                         as "expectedEvidence",
  app.action_status_to_ui(a.status)           as "status",
  a.completion_note                           as "completionNote",
  a.created_at                                as "createdAt",
  a.updated_at                                as "updatedAt",
  a.created_by                                as "createdBy",
  app.user_display_name(a.validated_by)       as "validatorName",
  a.validated_at                              as "validatedAt"
from public.action_plans a;

-- ---------------------------------------------------------------------------
-- ui_evaluations: a justificativa entra na projeção — e, por consequência, no
-- payload do snapshot oficial (validate_evaluation grava app.evaluation_dto,
-- que lê esta view). Snapshots já aprovados permanecem intactos.
-- ---------------------------------------------------------------------------
create or replace view public.ui_evaluations
  with (security_invoker = true) as
select
  e.id                          as "id",
  e.operation_id                as "operationId",
  coalesce(e.cycle_label, '')   as "cycleLabel",
  e.period_start::text          as "periodStart",
  e.period_end::text            as "periodEnd",
  coalesce(e.frequency, (
    select v.visit_type from public.visits v where v.id = e.visit_id
  ))::text                      as "frequency",
  e.author_user_id              as "evaluatorId",
  e.submitted_at                as "submittedAt",
  e.validated_at                as "validatedAt",
  e.validator_user_id           as "validatorId",
  e.validator_note              as "validatorNote",
  (case when e.status = 'superseded' then 'approved' else e.status::text end) as "status",
  e.score::double precision     as "score",
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'themeId',       ai.code,
        'status',        ea.status,
        'measuredValue', ea.measured_value,
        'observation',   ea.observation,
        'notApplicableReason', ea.not_applicable_reason,
        'evidenceIds',   coalesce((
          select jsonb_agg(link.evidence_id)
          from public.evaluation_answer_evidence link
          where link.answer_id = ea.id
        ), '[]'::jsonb)
      ) order by ai.code
    )
    from public.evaluation_answers ea
    join public.audit_items ai on ai.id = ea.item_id
    where ea.evaluation_id = e.id
  ), '[]'::jsonb)               as "answers",
  e.created_at                  as "createdAt",
  e.updated_at                  as "updatedAt"
from public.evaluations e;

-- ---------------------------------------------------------------------------
-- save_evaluation_answer: persiste a justificativa (trimada no servidor).
-- ---------------------------------------------------------------------------
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
    observation   = coalesce(p_patch->>'observation', observation),
    not_applicable_reason = coalesce(btrim(p_patch->>'notApplicableReason'), not_applicable_reason)
   where id = v_answer;

  update public.evaluations set score = app.evaluation_score(p_evaluation_id)
   where id = p_evaluation_id;

  return app.evaluation_dto(p_evaluation_id);
end $$;

-- ---------------------------------------------------------------------------
-- submit_evaluation: QUARTO portão — não aplicável sem justificativa útil.
-- Os três portões anteriores (completude, evidência, plano para vermelho)
-- permanecem byte a byte.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Grants: EXECUTE fechado para public/anon nas funções tocadas (convenção
-- 0010+/0023); aberto só a authenticated. A autorização real está nos corpos.
-- ---------------------------------------------------------------------------
revoke all on function public.update_action_status(uuid, text) from public, anon;
revoke all on function public.save_action_plan(jsonb) from public, anon;
revoke all on function public.save_evaluation_answer(uuid, text, jsonb) from public, anon;
revoke all on function public.submit_evaluation(uuid) from public, anon;
grant execute on function
  public.update_action_status(uuid, text),
  public.save_action_plan(jsonb),
  public.save_evaluation_answer(uuid, text, jsonb),
  public.submit_evaluation(uuid)
to authenticated;

-- Invocadas em contexto INVOKER (view/trigger sob o papel do usuário):
revoke all on function app.user_display_name(uuid) from public, anon;
grant execute on function app.user_display_name(uuid) to authenticated;
revoke all on function app.action_transition_allowed(app.action_status, app.action_status) from public, anon;
grant execute on function app.action_transition_allowed(app.action_status, app.action_status) to authenticated;
-- Somente dentro de SECURITY DEFINER (submit_evaluation): sem grant a authenticated.
revoke all on function app.na_reason_is_valid(text) from public, anon;
revoke all on function app.action_status_to_db(text) from public, anon;
