-- =============================================================================
-- AAPEX / AACE V2.0 — Reversão da migration 0001 (e dependentes 0002/0003)
-- Uso: rollback controlado em homologação. NUNCA em produção sem plano (§18.3).
-- =============================================================================
-- Remove todo o esquema de aplicação. Como as tabelas têm FKs, usa CASCADE.
-- Os triggers/policies (0002/0003) caem junto com as tabelas.

-- RPCs de Parceiros AACE (0009) — funções plpgsql em `public` não caem com o
-- `drop schema app cascade`; drop explícito para reversão autocontida.
drop function if exists
  public.admin_create_operation(jsonb),
  public.admin_update_operation(uuid, jsonb),
  public.admin_import_partners(jsonb, boolean);

-- Catálogo com escopo global/regional (AAPEx 1.3.5, migrations 0036–0038).
-- Mesmo motivo: função em `public` sobrevive ao `drop schema app cascade`, e o
-- harness reaplica todas as migrations sobre o mesmo banco depois deste arquivo.
drop function if exists
  public.catalog_create_theme(text, uuid, text, jsonb),
  public.catalog_add_theme_version(uuid, jsonb),
  public.catalog_publish_theme_version(uuid),
  public.catalog_set_theme_lifecycle(uuid, text),
  public.catalog_create_indicator(text, uuid, text, jsonb),
  public.catalog_add_indicator_version(uuid, jsonb),
  public.catalog_publish_indicator_version(uuid),
  public.catalog_set_indicator_lifecycle(uuid, text),
  public.catalog_save_regional_config_draft(uuid, uuid, jsonb),
  public.catalog_publish_regional_config_version(uuid),
  public.catalog_create_criterion(uuid, text, jsonb),
  public.catalog_add_criterion_version(uuid, jsonb),
  public.catalog_publish_criterion_version(uuid),
  public.catalog_set_criterion_lifecycle(uuid, text);

-- Gestão Assistida semanal (AAPEx 1.3.5, migrations 0039–0041). Mesmo motivo.
drop function if exists
  public.open_assisted_cycle(uuid, date),
  public.save_assisted_entry(uuid, jsonb),
  public.close_assisted_cycle(uuid),
  public.get_assisted_cycle(uuid, date),
  public.list_assisted_cycles(uuid, int);

-- Projeções de leitura (0005/0009) — dependem das tabelas-base (cairiam por
-- cascade, mas são removidas explicitamente para uma reversão autocontida).
drop view if exists
  public.ui_operations,
  public.ui_evaluations,
  public.ui_action_plans,
  public.ui_users,
  public.ui_indicators,
  public.ui_admin_partners
  cascade;

drop table if exists
  -- Auditoria Mensal materializada (0042). Mesmo motivo da Gestão Assistida
  -- abaixo: sem listar aqui, a tabela sobrevive ao teardown e perde as colunas
  -- tipadas por enum de `app`, e o `create table if not exists` não as recria.
  public.evaluation_criterion_answer_evidence,
  public.evaluation_criterion_answers,
  public.evaluation_criteria,
  -- Gestão Assistida antes do catálogo: aponta para configuração regional,
  -- temas e operações, e `action_plans` aponta para ela.
  --
  -- LISTAR AQUI NÃO É OPCIONAL. Sem isto a tabela SOBREVIVE ao teardown, mas
  -- `drop schema app cascade` derruba `app.assisted_status` e
  -- `app.indicator_direction` — e com eles as COLUNAS tipadas por esses enums.
  -- O `create table if not exists` da reaplicação então não recria nada, e a
  -- tabela fica sem `direction` nem `status`. O sintoma é opaco: "column
  -- e.direction does not exist" numa RPC que não tem nada a ver com o assunto.
  public.assisted_cycle_entries,
  public.assisted_cycles,
  -- Catálogo 1.3.5 depois: apontam para regions e indicator_definitions.
  public.audit_criteria_versions,
  public.audit_criteria,
  public.indicator_regional_config_versions,
  public.indicator_regional_configs,
  public.theme_versions,
  public.themes,
  public.evidence_upload_reservations,
  public.visit_reports,
  public.indicator_results,
  public.sync_operations,
  public.audit_logs,
  public.best_practices,
  public.validations,
  public.action_plans,
  public.diagnoses,
  public.evaluation_answer_evidence,
  public.evidence_files,
  public.official_snapshots,
  public.evaluation_answers,
  public.evaluations,
  public.visits,
  public.measurements,
  public.indicator_versions,
  public.indicator_definitions,
  public.audit_items,
  public.audit_template_versions,
  public.audit_templates,
  public.calendar_exceptions,
  public.visit_rules,
  public.operation_assignments,
  public.user_scopes,
  public.operations,
  public.coordinations,
  public.units,
  public.regions,
  public.organizations,
  public.users
  cascade;

drop schema if exists app cascade;

drop type if exists
  app.role_code, app.user_status, app.visit_type, app.visit_status,
  app.evaluation_status, app.action_status, app.evidence_status,
  app.indicator_lifecycle, app.traffic_light, app.indicator_direction,
  app.calendar_exception, app.validation_decision,
  app.scope_kind, app.catalog_status,
  app.assisted_cycle_status, app.assisted_status, app.action_source,
  app.evaluation_model, app.criterion_answer_status
  cascade;
