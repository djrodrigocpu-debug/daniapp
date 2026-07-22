-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0003: integridade histórica (triggers)
-- Masterplan §8.1, §11.3, §11.4, §15.1; Anexo D — T05, T06, T07, T25.
-- =============================================================================
-- A integridade crítica é reforçada no banco, não apenas na tela.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$I
       for each row execute function app.touch_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- row_version: concorrência otimista (§11.1) — incrementa a cada UPDATE
-- ---------------------------------------------------------------------------
create or replace function app.bump_row_version() returns trigger
  language plpgsql as $$
begin
  new.row_version := coalesce(old.row_version, 0) + 1;
  return new;
end $$;

create trigger trg_rowver_evaluations before update on public.evaluations
  for each row execute function app.bump_row_version();
create trigger trg_rowver_actions before update on public.action_plans
  for each row execute function app.bump_row_version();

-- ---------------------------------------------------------------------------
-- Trilha append-only (§15.1; T25): bloqueia UPDATE e DELETE em audit_logs
-- ---------------------------------------------------------------------------
create or replace function app.block_mutation() returns trigger
  language plpgsql as $$
begin
  raise exception 'append-only: % nao permitido nesta tabela', tg_op
    using errcode = 'insufficient_privilege';
end $$;

create trigger trg_audit_no_update before update on public.audit_logs
  for each row execute function app.block_mutation();
create trigger trg_audit_no_delete before delete on public.audit_logs
  for each row execute function app.block_mutation();

-- Snapshots oficiais também são imutáveis (§11.4)
create trigger trg_snapshot_no_update before update on public.official_snapshots
  for each row execute function app.block_mutation();
create trigger trg_snapshot_no_delete before delete on public.official_snapshots
  for each row execute function app.block_mutation();

-- ---------------------------------------------------------------------------
-- Indicador usado NUNCA é apagado fisicamente (D-05; T05)
-- ---------------------------------------------------------------------------
create or replace function app.guard_indicator_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if exists (
    select 1 from public.measurements m
    join public.indicator_versions v on v.id = m.indicator_version_id
    where v.definition_id = old.id
  ) then
    raise exception 'indicador % ja utilizado: inative para novas avaliacoes, nao exclua',
      old.code using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

create trigger trg_guard_indicator_delete before delete on public.indicator_definitions
  for each row execute function app.guard_indicator_delete();

create or replace function app.guard_indicator_version_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if exists (select 1 from public.measurements m where m.indicator_version_id = old.id) then
    raise exception 'versao de indicador ja medida nao pode ser excluida'
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

create trigger trg_guard_indicator_version_delete before delete on public.indicator_versions
  for each row execute function app.guard_indicator_version_delete();

-- ---------------------------------------------------------------------------
-- Template travado ao ser usado; itens de versão travada são imutáveis (T06)
-- ---------------------------------------------------------------------------
create or replace function app.lock_template_on_use() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  update public.audit_template_versions
    set locked = true
    where id = new.template_version_id and locked = false;
  return new;
end $$;

create trigger trg_lock_template_on_eval after insert on public.evaluations
  for each row execute function app.lock_template_on_use();

create or replace function app.guard_locked_items() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare v_locked boolean;
begin
  select locked into v_locked from public.audit_template_versions
    where id = coalesce(new.template_version_id, old.template_version_id);
  if v_locked then
    raise exception 'versao de template ja utilizada e imutavel'
      using errcode = 'integrity_constraint_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_guard_items_update before update on public.audit_items
  for each row execute function app.guard_locked_items();
create trigger trg_guard_items_delete before delete on public.audit_items
  for each row execute function app.guard_locked_items();

-- ---------------------------------------------------------------------------
-- Avaliação aprovada é imutável; só adendo/supersede controlado (T07)
-- ---------------------------------------------------------------------------
create or replace function app.guard_approved_evaluation() returns trigger
  language plpgsql as $$
begin
  if old.status = 'approved' then
    -- única transição permitida: aprovada -> supersedida (via adendo)
    if new.status = 'superseded'
       and new.score = old.score
       and new.operation_id = old.operation_id
       and new.template_version_id = old.template_version_id then
      return new;
    end if;
    raise exception 'avaliacao aprovada e imutavel: use adendo (registro supersedido)'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;

create trigger trg_guard_approved_eval before update on public.evaluations
  for each row execute function app.guard_approved_evaluation();

-- Respostas de avaliação não-rascunho são imutáveis
create or replace function app.guard_answer_mutation() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare v_status app.evaluation_status;
begin
  select status into v_status from public.evaluations
    where id = coalesce(new.evaluation_id, old.evaluation_id);
  if v_status not in ('draft', 'returned') then
    raise exception 'respostas so podem mudar em rascunho/devolvida'
      using errcode = 'integrity_constraint_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_guard_answer_update before update on public.evaluation_answers
  for each row execute function app.guard_answer_mutation();
create trigger trg_guard_answer_delete before delete on public.evaluation_answers
  for each row execute function app.guard_answer_mutation();
