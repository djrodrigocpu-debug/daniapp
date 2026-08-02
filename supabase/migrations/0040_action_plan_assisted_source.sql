-- =============================================================================
-- AAPEX 1.3.5 — Migration 0040: ORIGEM ÍNTEGRA dos planos da Gestão Assistida
-- =============================================================================
-- POR QUE ESTA MIGRATION VEM ANTES DAS RPCs DO CICLO. O fechamento do ciclo
-- exige plano de ação para todo desvio (D2). Sem vínculo verificável, a única
-- validação possível seria contra um texto solto ou um UUID que o banco não
-- conhece — as duas coisas que D6 proíbe nominalmente. A Fase 3 absorve, por
-- decisão registrada em ADR-135-002, o mínimo da Fase 4 que torna o fechamento
-- verificável. Nada além disso.
--
-- MOTOR ÚNICO, PRESERVADO. Esta migration NÃO cria plano paralelo, NÃO altera a
-- máquina de estados (`app.action_transition_allowed`), NÃO toca a
-- anti-auto-validação nem o `overdue` derivado da data — todos em
-- `app.guard_action_plan_write` (0025), que continua exatamente como está.
--
-- ADITIVA. Duas colunas anuláveis/com default e um CHECK. Nenhum `UPDATE`
-- semântico: plano existente vira `legacy` pelo DEFAULT DA COLUNA, que é o que
-- ele sempre foi.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. As três origens de D6
-- ---------------------------------------------------------------------------
-- O enum nasce com os TRÊS valores porque `alter type … add value` não pode ser
-- referenciado na mesma transação em que é criado — foi por isso que a 0024 e a
-- 0025 foram partidas em duas migrations. Deixar `monthly_audit` pronto poupa a
-- Fase 5 de repetir a divisão.
--
-- Mas o valor é RECUSADO PELO CHECK até que exista `monthly_audit_id`. Aceitar
-- `monthly_audit` sem coluna de origem seria um plano afirmando vir da Auditoria
-- Mensal sem que o banco pudesse verificar de qual — exatamente o tipo de
-- comportamento inventado que esta versão recusa em `target_band`.
--
-- ESCOPO RESIDUAL DA FASE 4: acrescentar `monthly_audit_id` e relaxar o CHECK
-- para a terceira perna. Nada mais.
do $$ begin
  create type app.action_source as enum ('legacy', 'assisted', 'monthly_audit');
exception when duplicate_object then null; end $$;

alter table public.action_plans
  add column if not exists assisted_entry_id uuid references public.assisted_cycle_entries(id),
  add column if not exists source app.action_source not null default 'legacy';

do $$ begin
  alter table public.action_plans add constraint action_plans_source_ck check (
    (source = 'legacy'   and assisted_entry_id is null)
    or (source = 'assisted' and assisted_entry_id is not null)
  );
exception when duplicate_object then null; end $$;

-- UM PLANO POR ITEM (ADR-135-002, decisão D-I). Toda a documentação canônica
-- fala do plano do desvio no singular — D1: "cria plano de ação com responsável
-- e prazo". Com 1:1 a guarda de fechamento é exata e a interface não precisa
-- escolher qual plano exibir.
--
-- É restrição, e está registrada como tal: remover um índice único depois é
-- aditivo e não perde dado; o inverso exigiria decidir o que fazer com os
-- duplicados já criados.
create unique index if not exists action_plans_assisted_entry_uk
  on public.action_plans(assisted_entry_id) where assisted_entry_id is not null;

create index if not exists action_plans_source_idx on public.action_plans(source);

-- ---------------------------------------------------------------------------
-- 2. Coerência do vínculo — o que a FK sozinha NÃO garante
-- ---------------------------------------------------------------------------
-- A FK prova que o item existe. Não prova que é o item do parceiro certo: um
-- usuário com acesso a dois parceiros pode, por PostgREST, gravar um plano de
-- `opA` apontando para o item do ciclo de `opB` — e `actions_write` (0002)
-- deixaria, porque ele alcança as duas operações.
--
-- Como região é derivada de operação → unidade → região, coerência de operação
-- IMPLICA coerência de região. Não há segunda verificação, e não deve haver:
-- duas fontes para o mesmo invariante divergem no primeiro conserto.
create or replace function app.guard_action_plan_assisted_link() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare
  v_entry_op     uuid;
  v_cycle_status app.assisted_cycle_status;
begin
  -- Vínculo é IMUTÁVEL depois de criado: repontar um plano para outro item
  -- reescreveria a história de um ciclo sem passar por ele.
  if tg_op = 'UPDATE'
     and new.assisted_entry_id is distinct from old.assisted_entry_id then
    raise exception 'origem do plano nao pode ser repontada para outro item'
      using errcode = 'integrity_constraint_violation';
  end if;

  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    raise exception 'origem do plano nao pode ser alterada'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.assisted_entry_id is null then
    return new;
  end if;

  select c.operation_id, c.status into v_entry_op, v_cycle_status
    from public.assisted_cycle_entries e
    join public.assisted_cycles c on c.id = e.cycle_id
   where e.id = new.assisted_entry_id;

  if v_entry_op is null then
    raise exception 'item de gestao assistida inexistente'
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_entry_op is distinct from new.operation_id then
    raise exception 'plano de outro parceiro nao pode ser vinculado a este item'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Ciclo fechado não recebe vínculo NOVO. O plano já vinculado continua
  -- evoluindo — é outro objeto, com ciclo de vida próprio (ADR-135-002 §5) —
  -- mas criar vínculo retroativo reescreveria a composição do fechamento.
  if tg_op = 'INSERT' and v_cycle_status = 'closed' then
    raise exception 'ciclo fechado nao aceita vinculo de plano novo'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end $$;

-- Nome com prefixo `a` para rodar ANTES de `trg_guard_action_plan_insert`
-- (gatilhos de mesmo momento disparam em ordem alfabética): a recusa por origem
-- incoerente é mais informativa que a de autoria, e nada é escrito de qualquer
-- forma.
drop trigger if exists trg_a_action_plan_assisted_link on public.action_plans;
create trigger trg_a_action_plan_assisted_link
  before insert or update on public.action_plans
  for each row execute function app.guard_action_plan_assisted_link();

-- ---------------------------------------------------------------------------
-- 3. `save_action_plan` ESTENDIDA — não substituída
-- ---------------------------------------------------------------------------
-- Quem não envia `assistedEntryId` obtém o comportamento ATUAL, byte a byte,
-- inclusive a derivação de `item_id` a partir de `themeId`. Quem envia passa
-- pelas verificações do gatilho antes de qualquer escrita.
--
-- NÃO existe `save_assisted_action_plan`. Uma segunda porta de entrada para o
-- mesmo objeto é como um segundo motor nasce (D6).
create or replace function public.save_action_plan(p_input jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_op uuid := (p_input->>'operationId')::uuid; v_id uuid; v_item uuid;
  v_theme text := p_input->>'themeId'; v_current app.action_status;
  v_status app.action_status;
  v_entry  uuid := nullif(p_input->>'assistedEntryId','')::uuid;
  v_source app.action_source := case when nullif(p_input->>'assistedEntryId','') is null
                                     then 'legacy' else 'assisted' end;
begin
  if not app.has_operation_access(v_op) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  -- Registrar resultado da Gestão Assistida é do GC responsável (Matriz §3), e
  -- o plano do desvio é parte do mesmo ato. Quem apenas ALCANÇA a operação —
  -- coordenador, regional, admin — não cria plano em nome do GC.
  if v_entry is not null and not app.is_assisted_operator(v_op) then
    raise exception 'apenas o gerente de canal responsavel registra plano da Gestao Assistida'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_item from public.audit_items where code = v_theme order by template_version_id desc limit 1;

  if (p_input ? 'id') and nullif(p_input->>'id','') is not null then
    v_id := (p_input->>'id')::uuid;
    select status into v_current from public.action_plans where id = v_id;
    if v_current is null then raise exception 'plano inexistente'; end if;
    if v_current = 'validated' then
      raise exception 'plano validado e imutavel' using errcode = 'integrity_constraint_violation';
    end if;
    -- `assisted_entry_id` e `source` NÃO entram no UPDATE: o gatilho recusaria a
    -- troca, e omiti-los deixa a edição de conteúdo fazendo só o que promete.
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
      completion_note, status, created_by, assisted_entry_id, source
    ) values (
      v_op, nullif(p_input->>'evaluationId','')::uuid, v_item, v_theme,
      coalesce(p_input->>'action',''), coalesce(p_input->>'action',''),
      coalesce(p_input->>'problem',''), coalesce(p_input->>'rootCause',''),
      coalesce(p_input->>'owner',''), (p_input->>'dueDate')::date,
      coalesce(p_input->>'priority','medium'), coalesce(p_input->>'expectedEvidence',''),
      p_input->>'completionNote', v_status, auth.uid(), v_entry, v_source
    ) returning id into v_id;
  end if;

  return app.action_plan_dto(v_id);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Projeção
-- ---------------------------------------------------------------------------
-- Colunas novas SÓ NO FIM: `create or replace view` aceita apenas apêndice —
-- inserir no meio é lido como renomear coluna existente e o comando é recusado.
-- As anteriores permanecem com o mesmo nome, ordem e significado.
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
  coalesce(a.assisted_entry_id::text, '')     as "assistedEntryId"
from public.action_plans a;

revoke all on function public.save_action_plan(jsonb) from public, anon;
grant execute on function public.save_action_plan(jsonb) to authenticated;
revoke all on function app.guard_action_plan_assisted_link() from public, anon, authenticated;
