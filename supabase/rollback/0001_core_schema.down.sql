-- =============================================================================
-- AAPEX / AACE V2.0 — Reversão da migration 0001 (e dependentes 0002/0003)
-- Uso: rollback controlado em homologação. NUNCA em produção sem plano (§18.3).
-- =============================================================================
-- Remove todo o esquema de aplicação. Como as tabelas têm FKs, usa CASCADE.
-- Os triggers/policies (0002/0003) caem junto com as tabelas.

-- Projeções de leitura (0005) — dependem das tabelas-base (cairiam por cascade,
-- mas são removidas explicitamente para uma reversão autocontida e legível).
drop view if exists
  public.ui_operations,
  public.ui_evaluations,
  public.ui_action_plans,
  public.ui_users,
  public.ui_indicators
  cascade;

drop table if exists
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
  app.calendar_exception, app.validation_decision
  cascade;
