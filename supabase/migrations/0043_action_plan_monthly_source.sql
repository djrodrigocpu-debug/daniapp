-- =============================================================================
-- AAPEX 1.3.5 — Migration 0043: a TERCEIRA origem do motor único de planos
-- =============================================================================
-- CORREÇÃO REGISTRADA. O ADR-135-002 (decisão D-H) previu `monthly_audit_id ->
-- evaluations(id)` como terceira perna do CHECK. Está errado, e a correção está
-- em ADR-135-003, decisão D-Q, escrita ANTES desta migration:
--
--   1. seria REDUNDANTE — `action_plans.evaluation_id` existe desde `0001:334`
--      e já referencia `evaluations(id)`. Duas colunas para a mesma coisa
--      divergem no primeiro conserto;
--   2. seria GROSSO DEMAIS — apontar para a auditoria inteira não diz QUAL não
--      conformidade originou o plano. O ciclo semanal aponta para o item; o
--      mensal precisa apontar para a RESPOSTA.
--
-- MOTOR ÚNICO, PRESERVADO. Nenhuma alteração na máquina de estados
-- (`app.action_transition_allowed`), na anti-auto-validação
-- (`app.guard_action_plan_write`) ou no `overdue` derivado da data.
--
-- ADITIVA. Uma coluna anulável e a substituição de um CHECK criado nesta mesma
-- branch pela 0040. Nenhum `UPDATE` de dado: plano legado continua `legacy`,
-- plano da Gestão Assistida continua `assisted`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. A coluna que faltava
-- ---------------------------------------------------------------------------
-- `app.action_source` já nasceu na 0040 com os TRÊS valores de D6, justamente
-- para esta migration não precisar de `alter type ... add value` — que não pode
-- ser referenciado na mesma transação em que é criado.
alter table public.action_plans
  add column if not exists monthly_criterion_answer_id uuid
    references public.evaluation_criterion_answers(id);

create index if not exists action_plans_monthly_answer_idx
  on public.action_plans(monthly_criterion_answer_id);

-- ---------------------------------------------------------------------------
-- 2. CHECK com as três origens
-- ---------------------------------------------------------------------------
-- `item_id is null` na terceira perna NÃO é decoração. `submit_evaluation`
-- (0025) recusa item vermelho sem plano consultando
-- `ap.evaluation_id = ... and (ap.item_id = ... or ap.theme_code = ...)`. Um
-- plano mensal que carregasse `item_id` seria contado por esse portão, e
-- satisfaria a auditoria LEGADA com um plano que não é dela.
alter table public.action_plans drop constraint if exists action_plans_source_ck;

do $$ begin
  alter table public.action_plans add constraint action_plans_source_ck check (
    (source = 'legacy'
      and assisted_entry_id is null
      and monthly_criterion_answer_id is null)
    or (source = 'assisted'
      and assisted_entry_id is not null
      and monthly_criterion_answer_id is null)
    or (source = 'monthly_audit'
      and assisted_entry_id is null
      and monthly_criterion_answer_id is not null
      and evaluation_id is not null
      and item_id is null)
  );
exception when duplicate_object then null; end $$;

-- SEM índice único (ADR-135-003, decisão D-R). O vínculo semanal é 1:1 porque
-- toda a documentação canônica fala do plano do desvio no singular. Para a
-- auditoria mensal NÃO HÁ decisão equivalente, e uma não conformidade de
-- processo pode razoavelmente exigir mais de uma ação. A submissão exige AO
-- MENOS UM plano — não exatamente um. A assimetria é deliberada.

-- ---------------------------------------------------------------------------
-- 3. Coerência do vínculo — o que o CHECK não alcança
-- ---------------------------------------------------------------------------
-- O CHECK garante a forma. Não garante que a resposta é DESTA auditoria, que a
-- auditoria é DESTE parceiro, nem que a resposta está mesmo em não
-- conformidade. Isso depende de junção, e `actions_write` (0002) permite escrita
-- direta por PostgREST no escopo — então precisa estar em gatilho.
create or replace function app.guard_action_plan_monthly_link() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare
  v_answer_eval  uuid;
  v_answer_state app.criterion_answer_status;
  v_audit_op     uuid;
  v_audit_status app.evaluation_status;
begin
  -- Vínculo e origem são IMUTÁVEIS depois de criados, pelo mesmo motivo do
  -- vínculo semanal: repontar um plano reescreveria a composição de uma
  -- auditoria sem passar por ela.
  if tg_op = 'UPDATE'
     and new.monthly_criterion_answer_id is distinct from old.monthly_criterion_answer_id then
    raise exception 'origem do plano nao pode ser repontada para outra nao conformidade'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.monthly_criterion_answer_id is null then
    return new;
  end if;

  select a.evaluation_id, a.status into v_answer_eval, v_answer_state
    from public.evaluation_criterion_answers a where a.id = new.monthly_criterion_answer_id;

  if v_answer_eval is null then
    raise exception 'resposta de criterio inexistente'
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_answer_eval is distinct from new.evaluation_id then
    raise exception 'a nao conformidade pertence a outra auditoria'
      using errcode = 'integrity_constraint_violation';
  end if;

  select e.operation_id, e.status into v_audit_op, v_audit_status
    from public.evaluations e where e.id = new.evaluation_id;

  if v_audit_op is distinct from new.operation_id then
    raise exception 'plano de outro parceiro nao pode ser vinculado a esta auditoria'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Plano existe para tratar NÃO CONFORMIDADE. Vincular a uma resposta conforme
  -- ou não aplicável não é um caso de uso — é um erro que ninguém veria depois.
  if v_answer_state <> 'nao_conforme' then
    raise exception 'plano mensal so se vincula a resposta em nao conformidade'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Auditoria enviada ou aprovada não recebe vínculo NOVO. O plano já vinculado
  -- continua evoluindo — é outro objeto, com ciclo de vida próprio — mas criar
  -- vínculo retroativo reescreveria a composição da submissão.
  if tg_op = 'INSERT' and v_audit_status in ('submitted', 'approved', 'superseded') then
    raise exception 'auditoria enviada ou aprovada nao aceita vinculo de plano novo'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end $$;

-- Prefixo `a` para rodar ANTES de `trg_guard_action_plan_insert`, pelo mesmo
-- motivo do gatilho semanal: a recusa por origem incoerente é mais informativa
-- que a de autoria, e nada é escrito de qualquer forma.
drop trigger if exists trg_a_action_plan_monthly_link on public.action_plans;
create trigger trg_a_action_plan_monthly_link
  before insert or update on public.action_plans
  for each row execute function app.guard_action_plan_monthly_link();

revoke all on function app.guard_action_plan_monthly_link() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. `save_action_plan` — terceira origem, mesma porta
-- ---------------------------------------------------------------------------
-- Continua sendo a ÚNICA porta de entrada do motor de planos. Quem não envia
-- `assistedEntryId` nem `monthlyCriterionAnswerId` obtém o comportamento de
-- 0025, byte a byte, inclusive a derivação de `item_id` a partir de `themeId`.
--
-- `item_id` é forçado a NULO na origem mensal — o CHECK exigiria de qualquer
-- forma, e derivá-lo de um `themeId` que a auditoria mensal nem usa produziria
-- uma recusa opaca em vez de comportamento correto.
create or replace function public.save_action_plan(p_input jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_op uuid := (p_input->>'operationId')::uuid; v_id uuid; v_item uuid;
  v_theme text := p_input->>'themeId'; v_current app.action_status;
  v_status app.action_status;
  v_entry   uuid := nullif(p_input->>'assistedEntryId','')::uuid;
  v_manswer uuid := nullif(p_input->>'monthlyCriterionAnswerId','')::uuid;
  v_eval    uuid := nullif(p_input->>'evaluationId','')::uuid;
  v_source  app.action_source;
begin
  if v_entry is not null and v_manswer is not null then
    raise exception 'um plano tem uma origem so' using errcode = 'check_violation';
  end if;

  v_source := case
    when v_entry   is not null then 'assisted'
    when v_manswer is not null then 'monthly_audit'
    else 'legacy'
  end;

  if not app.has_operation_access(v_op) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  -- Registrar resultado da Gestão Assistida é do GC responsável (Matriz §3), e
  -- o plano do desvio é parte do mesmo ato.
  if v_entry is not null and not app.is_assisted_operator(v_op) then
    raise exception 'apenas o gerente de canal responsavel registra plano da Gestao Assistida'
      using errcode = 'insufficient_privilege';
  end if;

  -- Responder a Auditoria Mensal é do AUTOR da auditoria (Matriz §4: criar,
  -- responder e enviar são do GC; validar é de outro papel). O plano da não
  -- conformidade nasce no mesmo ato de responder.
  if v_manswer is not null then
    if not exists (
      select 1 from public.evaluations e
       where e.id = v_eval and e.author_user_id = auth.uid()
    ) then
      raise exception 'apenas o autor da auditoria registra plano de nao conformidade'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if v_manswer is null then
    select id into v_item from public.audit_items where code = v_theme
     order by template_version_id desc limit 1;
  end if;

  if (p_input ? 'id') and nullif(p_input->>'id','') is not null then
    v_id := (p_input->>'id')::uuid;
    select status into v_current from public.action_plans where id = v_id;
    if v_current is null then raise exception 'plano inexistente'; end if;
    if v_current = 'validated' then
      raise exception 'plano validado e imutavel' using errcode = 'integrity_constraint_violation';
    end if;
    -- As colunas de ORIGEM não entram no UPDATE: o gatilho recusaria a troca, e
    -- omiti-las deixa a edição de conteúdo fazendo só o que promete.
    update public.action_plans set
      operation_id      = v_op,
      evaluation_id     = v_eval,
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
      completion_note, status, created_by,
      assisted_entry_id, monthly_criterion_answer_id, source
    ) values (
      v_op, v_eval, v_item, v_theme,
      coalesce(p_input->>'action',''), coalesce(p_input->>'action',''),
      coalesce(p_input->>'problem',''), coalesce(p_input->>'rootCause',''),
      coalesce(p_input->>'owner',''), (p_input->>'dueDate')::date,
      coalesce(p_input->>'priority','medium'), coalesce(p_input->>'expectedEvidence',''),
      p_input->>'completionNote', v_status, auth.uid(),
      v_entry, v_manswer, v_source
    ) returning id into v_id;
  end if;

  return app.action_plan_dto(v_id);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Projeção
-- ---------------------------------------------------------------------------
-- Coluna nova SÓ NO FIM: `create or replace view` aceita apenas apêndice.
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
  a.validated_at                              as "validatedAt",
  a.source::text                              as "source",
  coalesce(a.assisted_entry_id::text, '')     as "assistedEntryId",
  coalesce(a.monthly_criterion_answer_id::text, '') as "monthlyCriterionAnswerId"
from public.action_plans a;

revoke all on function public.save_action_plan(jsonb) from public, anon;
grant execute on function public.save_action_plan(jsonb) to authenticated;
