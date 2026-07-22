-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0002: Row Level Security (deny-by-default)
-- Masterplan §5.1, §13.3 [R8]; Anexo B (matriz), Anexo D (T01, T02, T17).
-- =============================================================================
-- Regra: a autorização verdadeira ocorre no banco. A interface apenas repete.
-- Toda tabela tem RLS habilitada; sem policy permissiva => acesso negado.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Funções de autorização (SECURITY DEFINER: leem user_scopes sem recursão RLS)
-- ---------------------------------------------------------------------------
create or replace function app.uid() returns uuid
  language sql stable as $$ select auth.uid() $$;

create or replace function app.has_role(target app.role_code) returns boolean
  language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.user_scopes s
    where s.user_id = auth.uid()
      and s.role = target
      and s.active
      and (s.valid_to is null or s.valid_to > now())
  )
$$;

create or replace function app.is_admin() returns boolean
  language sql stable security definer set search_path = public, app as $$
  select app.has_role('admin')
$$;

-- Regiões sob escopo do usuário (admin vê todas; regional vê as suas).
create or replace function app.scoped_region_ids() returns setof uuid
  language sql stable security definer set search_path = public, app as $$
  select r.id from public.regions r where app.is_admin()
  union
  select s.region_id from public.user_scopes s
    where s.user_id = auth.uid() and s.role = 'regional' and s.active
      and s.region_id is not null and (s.valid_to is null or s.valid_to > now())
$$;

-- Coordenadorias sob escopo do usuário (coordenador).
create or replace function app.scoped_coordination_ids() returns setof uuid
  language sql stable security definer set search_path = public, app as $$
  select s.coordination_id from public.user_scopes s
    where s.user_id = auth.uid() and s.role = 'coordinator' and s.active
      and s.coordination_id is not null and (s.valid_to is null or s.valid_to > now())
$$;

-- Acesso a uma operação conforme perfil e escopo (§5.1; T01).
create or replace function app.has_operation_access(op_id uuid) returns boolean
  language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.operations o where o.id = op_id and (
      app.is_admin()
      or o.unit_id in (select u.id from public.units u where u.region_id in (select app.scoped_region_ids()))
      or o.coordination_id in (select app.scoped_coordination_ids())
      or exists (
        select 1 from public.operation_assignments a
        where a.operation_id = o.id and a.user_id = auth.uid() and a.active
          and (a.valid_to is null or a.valid_to > now())
      )
    )
  )
$$;

-- Pode validar a avaliação? Coordenador com acesso à operação E NÃO é o autor
-- (§5.3, Anexo D — T02: ninguém aprova a própria submissão).
create or replace function app.can_validate(eval_id uuid) returns boolean
  language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.evaluations e
    where e.id = eval_id
      and e.author_user_id <> auth.uid()
      and app.has_role('coordinator')
      and app.has_operation_access(e.operation_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Habilita RLS em todas as tabelas
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Catálogo organizacional/estrutural: leitura para autenticados, escrita admin
-- ---------------------------------------------------------------------------
create policy org_read   on public.organizations for select to authenticated using (true);
create policy org_write  on public.organizations for all    to authenticated using (app.is_admin()) with check (app.is_admin());

create policy region_read  on public.regions for select to authenticated using (true);
create policy region_write on public.regions for all    to authenticated using (app.is_admin()) with check (app.is_admin());

create policy unit_read  on public.units for select to authenticated using (true);
create policy unit_write on public.units for all    to authenticated using (app.is_admin()) with check (app.is_admin());

create policy coord_read  on public.coordinations for select to authenticated using (true);
create policy coord_write on public.coordinations for all    to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Usuários e escopos: somente Administrador gerencia (Anexo B)
-- ---------------------------------------------------------------------------
create policy users_self_read on public.users for select to authenticated
  using (id = auth.uid() or app.is_admin());
create policy users_admin_write on public.users for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy scopes_read on public.user_scopes for select to authenticated
  using (user_id = auth.uid() or app.is_admin());
create policy scopes_admin_write on public.user_scopes for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy assign_read on public.operation_assignments for select to authenticated
  using (user_id = auth.uid() or app.is_admin() or app.has_operation_access(operation_id));
create policy assign_admin_write on public.operation_assignments for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Operações: visíveis apenas no escopo (T01, T17)
-- ---------------------------------------------------------------------------
create policy operations_scoped_read on public.operations for select to authenticated
  using (app.has_operation_access(id));
create policy operations_admin_write on public.operations for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Calendário: leitura no escopo; escrita admin
-- ---------------------------------------------------------------------------
create policy visit_rules_read on public.visit_rules for select to authenticated using (true);
create policy visit_rules_write on public.visit_rules for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy cal_exc_read on public.calendar_exceptions for select to authenticated using (true);
create policy cal_exc_write on public.calendar_exceptions for all to authenticated
  using (app.is_admin() or app.has_role('regional')) with check (app.is_admin() or app.has_role('regional'));

-- ---------------------------------------------------------------------------
-- Templates e itens: leitura autenticada; escrita admin; sem alterar passado
-- ---------------------------------------------------------------------------
create policy templates_read on public.audit_templates for select to authenticated using (true);
create policy templates_write on public.audit_templates for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy tversions_read on public.audit_template_versions for select to authenticated using (true);
create policy tversions_write on public.audit_template_versions for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy items_read on public.audit_items for select to authenticated using (true);
create policy items_write on public.audit_items for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Indicadores: SOMENTE Administrador cadastra/versiona/inativa (D-05, T05)
-- ---------------------------------------------------------------------------
create policy ind_def_read on public.indicator_definitions for select to authenticated using (true);
create policy ind_def_admin on public.indicator_definitions for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy ind_ver_read on public.indicator_versions for select to authenticated using (true);
create policy ind_ver_admin on public.indicator_versions for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy meas_read on public.measurements for select to authenticated
  using (app.has_operation_access(operation_id));
create policy meas_write on public.measurements for all to authenticated
  using (app.has_operation_access(operation_id)) with check (app.has_operation_access(operation_id));

-- ---------------------------------------------------------------------------
-- Visitas e avaliações: leitura no escopo; rascunho do autor; validação segregada
-- ---------------------------------------------------------------------------
create policy visits_read on public.visits for select to authenticated
  using (app.has_operation_access(operation_id));
create policy visits_write on public.visits for all to authenticated
  using (app.has_operation_access(operation_id)) with check (app.has_operation_access(operation_id));

create policy evals_scoped_read on public.evaluations for select to authenticated
  using (app.has_operation_access(operation_id));
-- autor cria/edita rascunho no seu escopo
create policy evals_author_insert on public.evaluations for insert to authenticated
  with check (author_user_id = auth.uid() and app.has_operation_access(operation_id));
create policy evals_author_update on public.evaluations for update to authenticated
  using (author_user_id = auth.uid() and status in ('draft', 'returned') and app.has_operation_access(operation_id))
  with check (author_user_id = auth.uid() and app.has_operation_access(operation_id));

create policy answers_read on public.evaluation_answers for select to authenticated
  using (exists (select 1 from public.evaluations e where e.id = evaluation_id and app.has_operation_access(e.operation_id)));
create policy answers_author_write on public.evaluation_answers for all to authenticated
  using (exists (select 1 from public.evaluations e where e.id = evaluation_id and e.author_user_id = auth.uid() and e.status in ('draft','returned')))
  with check (exists (select 1 from public.evaluations e where e.id = evaluation_id and e.author_user_id = auth.uid() and e.status in ('draft','returned')));

-- Validação: apenas quem PODE validar e NÃO é o autor (T02)
create policy validations_read on public.validations for select to authenticated
  using (exists (select 1 from public.evaluations e where e.id = evaluation_id and app.has_operation_access(e.operation_id)));
create policy validations_insert on public.validations for insert to authenticated
  with check (validator_user_id = auth.uid() and app.can_validate(evaluation_id));

-- Snapshots oficiais: leitura no escopo; escrita apenas por função server-side (deny direto)
create policy snapshots_read on public.official_snapshots for select to authenticated
  using (app.has_operation_access(operation_id));
-- sem policy de insert/update/delete => bloqueado ao cliente (gerado via RPC/trigger)

-- ---------------------------------------------------------------------------
-- Evidências: leitura/escrita no escopo do objeto de origem
-- ---------------------------------------------------------------------------
create policy evidence_scoped_read on public.evidence_files for select to authenticated
  using (author_user_id = auth.uid() or app.is_admin()
    or exists (select 1 from public.evaluations e where e.id = source_object_id and app.has_operation_access(e.operation_id)));
create policy evidence_author_write on public.evidence_files for all to authenticated
  using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());

create policy answer_evidence_read on public.evaluation_answer_evidence for select to authenticated using (true);
create policy answer_evidence_write on public.evaluation_answer_evidence for all to authenticated
  using (exists (select 1 from public.evidence_files f where f.id = evidence_id and f.author_user_id = auth.uid()))
  with check (exists (select 1 from public.evidence_files f where f.id = evidence_id and f.author_user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Diagnóstico e planos: no escopo da operação
-- ---------------------------------------------------------------------------
create policy diag_read on public.diagnoses for select to authenticated
  using (exists (select 1 from public.evaluations e where e.id = evaluation_id and app.has_operation_access(e.operation_id)));
create policy diag_write on public.diagnoses for all to authenticated
  using (exists (select 1 from public.evaluations e where e.id = evaluation_id and app.has_operation_access(e.operation_id)))
  with check (exists (select 1 from public.evaluations e where e.id = evaluation_id and app.has_operation_access(e.operation_id)));

create policy actions_read on public.action_plans for select to authenticated
  using (app.has_operation_access(operation_id));
create policy actions_write on public.action_plans for all to authenticated
  using (app.has_operation_access(operation_id)) with check (app.has_operation_access(operation_id));

-- ---------------------------------------------------------------------------
-- Boas práticas: propor no escopo; publicar exige moderação (Anexo B)
-- ---------------------------------------------------------------------------
create policy bp_read on public.best_practices for select to authenticated
  using (published or author_user_id = auth.uid() or app.has_role('coordinator') or app.is_admin());
create policy bp_propose on public.best_practices for insert to authenticated
  with check (author_user_id = auth.uid() and published = false);
create policy bp_moderate on public.best_practices for update to authenticated
  using (app.has_role('coordinator') or app.is_admin())
  with check (app.has_role('coordinator') or app.is_admin());

-- ---------------------------------------------------------------------------
-- Trilha de auditoria: append-only. Insert por autenticados; leitura por perfil;
-- update/delete negados a todos (sem policy + trigger em 0003).
-- ---------------------------------------------------------------------------
create policy audit_insert on public.audit_logs for insert to authenticated with check (true);
create policy audit_read on public.audit_logs for select to authenticated
  using (actor_user_id = auth.uid() or app.is_admin() or app.has_role('regional'));

-- ---------------------------------------------------------------------------
-- Sincronização: cada usuário vê e enfileira as próprias operações
-- ---------------------------------------------------------------------------
create policy sync_owner_read on public.sync_operations for select to authenticated
  using (user_id = auth.uid() or app.is_admin());
create policy sync_owner_write on public.sync_operations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
