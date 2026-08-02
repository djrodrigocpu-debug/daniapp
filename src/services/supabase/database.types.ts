export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      action_plans: {
        Row: {
          action_text: string
          assisted_entry_id: string | null
          completion_criterion: string
          completion_evidence_id: string | null
          completion_note: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          evaluation_id: string | null
          expected_evidence: string
          id: string
          item_id: string | null
          monthly_criterion_answer_id: string | null
          operation_id: string
          origin: string
          owner_name: string
          owner_user_id: string | null
          priority: string
          problem: string
          root_cause: string
          row_version: number
          source: "legacy" | "assisted" | "monthly_audit"
          status:
            | "open"
            | "in_progress"
            | "blocked"
            | "done"
            | "overdue"
            | "cancelled_justified"
            | "waiting_partner"
            | "validated"
          theme_code: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          action_text?: string
          assisted_entry_id?: string | null
          completion_criterion?: string
          completion_evidence_id?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          evaluation_id?: string | null
          expected_evidence?: string
          id?: string
          item_id?: string | null
          monthly_criterion_answer_id?: string | null
          operation_id: string
          origin?: string
          owner_name?: string
          owner_user_id?: string | null
          priority: string
          problem?: string
          root_cause?: string
          row_version?: number
          source?: "legacy" | "assisted" | "monthly_audit"
          status?:
            | "open"
            | "in_progress"
            | "blocked"
            | "done"
            | "overdue"
            | "cancelled_justified"
            | "waiting_partner"
            | "validated"
          theme_code?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          action_text?: string
          assisted_entry_id?: string | null
          completion_criterion?: string
          completion_evidence_id?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          evaluation_id?: string | null
          expected_evidence?: string
          id?: string
          item_id?: string | null
          monthly_criterion_answer_id?: string | null
          operation_id?: string
          origin?: string
          owner_name?: string
          owner_user_id?: string | null
          priority?: string
          problem?: string
          root_cause?: string
          row_version?: number
          source?: "legacy" | "assisted" | "monthly_audit"
          status?:
            | "open"
            | "in_progress"
            | "blocked"
            | "done"
            | "overdue"
            | "cancelled_justified"
            | "waiting_partner"
            | "validated"
          theme_code?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_assisted_entry_id_fkey"
            columns: ["assisted_entry_id"]
            isOneToOne: false
            referencedRelation: "assisted_cycle_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_completion_evidence_id_fkey"
            columns: ["completion_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_completion_evidence_id_fkey"
            columns: ["completion_evidence_id"]
            isOneToOne: false
            referencedRelation: "ui_evidences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluation_people"
            referencedColumns: ["evaluationId"]
          },
          {
            foreignKeyName: "action_plans_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "audit_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_monthly_criterion_answer_id_fkey"
            columns: ["monthly_criterion_answer_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criterion_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "action_plans_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      assisted_cycle_entries: {
        Row: {
          actual: number | null
          created_at: string
          cycle_id: string
          diagnosis: string
          direction: "higher_better" | "lower_better" | "target_band"
          id: string
          indicator_code: string
          indicator_definition_id: string
          indicator_name: string
          indicator_version_id: string
          observation: string
          orientation: string
          recorded_at: string | null
          recorded_by: string | null
          regional_config_id: string
          regional_config_version_id: string
          rule_version: string
          sort_order: number
          source_consulted_at: string | null
          source_period: string
          source_reference: string
          status: "conforme" | "atencao" | "nao_conforme" | "sem_dado"
          target: number
          theme_code: string
          theme_id: string
          theme_name: string
          theme_version_id: string
          tolerance: number
          unit: string
          updated_at: string
          weight: number
        }
        Insert: {
          actual?: number | null
          created_at?: string
          cycle_id: string
          diagnosis?: string
          direction: "higher_better" | "lower_better" | "target_band"
          id?: string
          indicator_code: string
          indicator_definition_id: string
          indicator_name: string
          indicator_version_id: string
          observation?: string
          orientation?: string
          recorded_at?: string | null
          recorded_by?: string | null
          regional_config_id: string
          regional_config_version_id: string
          rule_version?: string
          sort_order?: number
          source_consulted_at?: string | null
          source_period?: string
          source_reference?: string
          status?: "conforme" | "atencao" | "nao_conforme" | "sem_dado"
          target: number
          theme_code: string
          theme_id: string
          theme_name: string
          theme_version_id: string
          tolerance?: number
          unit: string
          updated_at?: string
          weight?: number
        }
        Update: {
          actual?: number | null
          created_at?: string
          cycle_id?: string
          diagnosis?: string
          direction?: "higher_better" | "lower_better" | "target_band"
          id?: string
          indicator_code?: string
          indicator_definition_id?: string
          indicator_name?: string
          indicator_version_id?: string
          observation?: string
          orientation?: string
          recorded_at?: string | null
          recorded_by?: string | null
          regional_config_id?: string
          regional_config_version_id?: string
          rule_version?: string
          sort_order?: number
          source_consulted_at?: string | null
          source_period?: string
          source_reference?: string
          status?: "conforme" | "atencao" | "nao_conforme" | "sem_dado"
          target?: number
          theme_code?: string
          theme_id?: string
          theme_name?: string
          theme_version_id?: string
          tolerance?: number
          unit?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assisted_cycle_entries_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "assisted_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycle_entries_indicator_definition_id_fkey"
            columns: ["indicator_definition_id"]
            isOneToOne: false
            referencedRelation: "indicator_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycle_entries_indicator_definition_id_fkey"
            columns: ["indicator_definition_id"]
            isOneToOne: false
            referencedRelation: "ui_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycle_entries_indicator_version_id_fkey"
            columns: ["indicator_version_id"]
            isOneToOne: false
            referencedRelation: "indicator_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycle_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycle_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycle_entries_regional_config_id_fkey"
            columns: ["regional_config_id"]
            isOneToOne: false
            referencedRelation: "indicator_regional_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycle_entries_regional_config_version_id_fkey"
            columns: ["regional_config_version_id"]
            isOneToOne: false
            referencedRelation: "indicator_regional_config_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycle_entries_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycle_entries_theme_version_id_fkey"
            columns: ["theme_version_id"]
            isOneToOne: false
            referencedRelation: "theme_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      assisted_cycles: {
        Row: {
          author_user_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          operation_id: string
          row_version: number
          rule_version: string | null
          status: "draft" | "closed"
          updated_at: string
          week_start_date: string
        }
        Insert: {
          author_user_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          operation_id: string
          row_version?: number
          rule_version?: string | null
          status?: "draft" | "closed"
          updated_at?: string
          week_start_date: string
        }
        Update: {
          author_user_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          operation_id?: string
          row_version?: number
          rule_version?: string | null
          status?: "draft" | "closed"
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "assisted_cycles_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycles_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycles_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycles_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycles_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycles_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_cycles_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "assisted_cycles_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_criteria: {
        Row: {
          code: string
          config_id: string
          created_at: string
          created_by: string | null
          id: string
          lifecycle: "draft" | "active" | "inactive"
        }
        Insert: {
          code: string
          config_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: "draft" | "active" | "inactive"
        }
        Update: {
          code?: string
          config_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: "draft" | "active" | "inactive"
        }
        Relationships: [
          {
            foreignKeyName: "audit_criteria_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "indicator_regional_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_criteria_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_criteria_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_criteria_versions: {
        Row: {
          active: boolean
          allows_na: boolean
          created_at: string
          created_by: string | null
          criterion_id: string
          description: string | null
          effective_from: string
          effective_to: string | null
          evidence_required: boolean
          guidance: string | null
          id: string
          question: string
          required: boolean
          requires_justification: boolean
          sort_order: number
          status: "draft" | "published"
          version_number: number
        }
        Insert: {
          active?: boolean
          allows_na?: boolean
          created_at?: string
          created_by?: string | null
          criterion_id: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          evidence_required?: boolean
          guidance?: string | null
          id?: string
          question: string
          required?: boolean
          requires_justification?: boolean
          sort_order?: number
          status?: "draft" | "published"
          version_number: number
        }
        Update: {
          active?: boolean
          allows_na?: boolean
          created_at?: string
          created_by?: string | null
          criterion_id?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          evidence_required?: boolean
          guidance?: string | null
          id?: string
          question?: string
          required?: boolean
          requires_justification?: boolean
          sort_order?: number
          status?: "draft" | "published"
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_criteria_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_criteria_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_criteria_versions_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "audit_criteria"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_items: {
        Row: {
          code: string
          evidence_required: boolean
          frequency: "weekly" | "monthly"
          id: string
          pillar: string
          required: boolean
          template_version_id: string
          title: string
          weight: number
        }
        Insert: {
          code: string
          evidence_required?: boolean
          frequency: "weekly" | "monthly"
          id?: string
          pillar: string
          required?: boolean
          template_version_id: string
          title: string
          weight: number
        }
        Update: {
          code?: string
          evidence_required?: boolean
          frequency?: "weekly" | "monthly"
          id?: string
          pillar?: string
          required?: boolean
          template_version_id?: string
          title?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_items_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "audit_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          actor_user_id: string | null
          correlation: string | null
          created_at: string
          event: string
          id: number
          metadata: Json | null
          object_id: string | null
          object_type: string | null
          result: string | null
        }
        Insert: {
          actor_user_id?: string | null
          correlation?: string | null
          created_at?: string
          event: string
          id?: never
          metadata?: Json | null
          object_id?: string | null
          object_type?: string | null
          result?: string | null
        }
        Update: {
          actor_user_id?: string | null
          correlation?: string | null
          created_at?: string
          event?: string
          id?: never
          metadata?: Json | null
          object_id?: string | null
          object_type?: string | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_template_versions: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          locked: boolean
          template_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          locked?: boolean
          template_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          locked?: boolean
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      best_practices: {
        Row: {
          author_user_id: string
          content: string
          created_at: string
          id: string
          moderated_by: string | null
          operation_id: string | null
          published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          content: string
          created_at?: string
          id?: string
          moderated_by?: string | null
          operation_id?: string | null
          published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          content?: string
          created_at?: string
          id?: string
          moderated_by?: string | null
          operation_id?: string | null
          published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_practices_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_practices_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_practices_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_practices_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_practices_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_practices_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_practices_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "best_practices_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_exceptions: {
        Row: {
          created_at: string
          created_by: string | null
          exception_date: string
          id: string
          kind:
            | "holiday"
            | "rescheduled"
            | "cancelled_justified"
            | "not_performed"
          reason: string
          rescheduled_to: string | null
          unit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exception_date: string
          id?: string
          kind:
            | "holiday"
            | "rescheduled"
            | "cancelled_justified"
            | "not_performed"
          reason: string
          rescheduled_to?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exception_date?: string
          id?: string
          kind?:
            | "holiday"
            | "rescheduled"
            | "cancelled_justified"
            | "not_performed"
          reason?: string
          rescheduled_to?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_exceptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_exceptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_exceptions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinations: {
        Row: {
          active: boolean
          coordinator_user_id: string | null
          created_at: string
          id: string
          name: string
          region_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          coordinator_user_id?: string | null
          created_at?: string
          id?: string
          name: string
          region_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          coordinator_user_id?: string | null
          created_at?: string
          id?: string
          name?: string
          region_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordinations_coordinator_fk"
            columns: ["coordinator_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinations_coordinator_fk"
            columns: ["coordinator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["regionId"]
          },
        ]
      }
      diagnoses: {
        Row: {
          created_at: string
          created_by: string | null
          evaluation_id: string
          finding: string
          id: string
          impact: string
          item_id: string
          probable_cause: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          evaluation_id: string
          finding: string
          id?: string
          impact: string
          item_id: string
          probable_cause: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          evaluation_id?: string
          finding?: string
          id?: string
          impact?: string
          item_id?: string
          probable_cause?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnoses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnoses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnoses_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnoses_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluation_people"
            referencedColumns: ["evaluationId"]
          },
          {
            foreignKeyName: "diagnoses_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnoses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "audit_items"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_answer_evidence: {
        Row: {
          answer_id: string
          evidence_id: string
        }
        Insert: {
          answer_id: string
          evidence_id: string
        }
        Update: {
          answer_id?: string
          evidence_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_answer_evidence_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "evaluation_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_answer_evidence_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_answer_evidence_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "ui_evidences"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_answers: {
        Row: {
          evaluation_id: string
          id: string
          item_id: string
          measured_value: string
          not_applicable_reason: string
          observation: string
          status:
            | "green"
            | "yellow"
            | "red"
            | "not_evaluated"
            | "not_applicable"
        }
        Insert: {
          evaluation_id: string
          id?: string
          item_id: string
          measured_value?: string
          not_applicable_reason?: string
          observation?: string
          status?:
            | "green"
            | "yellow"
            | "red"
            | "not_evaluated"
            | "not_applicable"
        }
        Update: {
          evaluation_id?: string
          id?: string
          item_id?: string
          measured_value?: string
          not_applicable_reason?: string
          observation?: string
          status?:
            | "green"
            | "yellow"
            | "red"
            | "not_evaluated"
            | "not_applicable"
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_answers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_answers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluation_people"
            referencedColumns: ["evaluationId"]
          },
          {
            foreignKeyName: "evaluation_answers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_answers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "audit_items"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_criteria: {
        Row: {
          allows_na: boolean
          created_at: string
          criterion_code: string
          criterion_id: string
          criterion_version_id: string
          description: string
          effective_from: string
          effective_to: string | null
          evaluation_id: string
          evidence_required: boolean
          guidance: string
          id: string
          indicator_code: string
          indicator_definition_id: string
          indicator_name: string
          indicator_version_id: string
          question: string
          regional_config_id: string
          regional_config_version_id: string
          required: boolean
          requires_justification: boolean
          sort_order: number
          theme_code: string
          theme_id: string
          theme_name: string
          theme_version_id: string
        }
        Insert: {
          allows_na?: boolean
          created_at?: string
          criterion_code: string
          criterion_id: string
          criterion_version_id: string
          description?: string
          effective_from: string
          effective_to?: string | null
          evaluation_id: string
          evidence_required?: boolean
          guidance?: string
          id?: string
          indicator_code: string
          indicator_definition_id: string
          indicator_name: string
          indicator_version_id: string
          question: string
          regional_config_id: string
          regional_config_version_id: string
          required?: boolean
          requires_justification?: boolean
          sort_order?: number
          theme_code: string
          theme_id: string
          theme_name: string
          theme_version_id: string
        }
        Update: {
          allows_na?: boolean
          created_at?: string
          criterion_code?: string
          criterion_id?: string
          criterion_version_id?: string
          description?: string
          effective_from?: string
          effective_to?: string | null
          evaluation_id?: string
          evidence_required?: boolean
          guidance?: string
          id?: string
          indicator_code?: string
          indicator_definition_id?: string
          indicator_name?: string
          indicator_version_id?: string
          question?: string
          regional_config_id?: string
          regional_config_version_id?: string
          required?: boolean
          requires_justification?: boolean
          sort_order?: number
          theme_code?: string
          theme_id?: string
          theme_name?: string
          theme_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_criteria_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "audit_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_criterion_version_id_fkey"
            columns: ["criterion_version_id"]
            isOneToOne: false
            referencedRelation: "audit_criteria_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluation_people"
            referencedColumns: ["evaluationId"]
          },
          {
            foreignKeyName: "evaluation_criteria_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_indicator_definition_id_fkey"
            columns: ["indicator_definition_id"]
            isOneToOne: false
            referencedRelation: "indicator_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_indicator_definition_id_fkey"
            columns: ["indicator_definition_id"]
            isOneToOne: false
            referencedRelation: "ui_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_indicator_version_id_fkey"
            columns: ["indicator_version_id"]
            isOneToOne: false
            referencedRelation: "indicator_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_regional_config_id_fkey"
            columns: ["regional_config_id"]
            isOneToOne: false
            referencedRelation: "indicator_regional_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_regional_config_version_id_fkey"
            columns: ["regional_config_version_id"]
            isOneToOne: false
            referencedRelation: "indicator_regional_config_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_theme_version_id_fkey"
            columns: ["theme_version_id"]
            isOneToOne: false
            referencedRelation: "theme_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_criterion_answer_evidence: {
        Row: {
          answer_id: string
          evidence_id: string
        }
        Insert: {
          answer_id: string
          evidence_id: string
        }
        Update: {
          answer_id?: string
          evidence_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_criterion_answer_evidence_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criterion_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criterion_answer_evidence_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criterion_answer_evidence_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "ui_evidences"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_criterion_answers: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          created_at: string
          diagnosis: string
          evaluation_criterion_id: string
          evaluation_id: string
          id: string
          justification: string
          observation: string
          row_version: number
          status: "nao_avaliado" | "conforme" | "nao_conforme" | "nao_aplicavel"
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          diagnosis?: string
          evaluation_criterion_id: string
          evaluation_id: string
          id?: string
          justification?: string
          observation?: string
          row_version?: number
          status?:
            | "nao_avaliado"
            | "conforme"
            | "nao_conforme"
            | "nao_aplicavel"
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          diagnosis?: string
          evaluation_criterion_id?: string
          evaluation_id?: string
          id?: string
          justification?: string
          observation?: string
          row_version?: number
          status?:
            | "nao_avaliado"
            | "conforme"
            | "nao_conforme"
            | "nao_aplicavel"
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_criterion_answers_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criterion_answers_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criterion_answers_evaluation_criterion_id_fkey"
            columns: ["evaluation_criterion_id"]
            isOneToOne: true
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criterion_answers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criterion_answers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluation_people"
            referencedColumns: ["evaluationId"]
          },
          {
            foreignKeyName: "evaluation_criterion_answers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          approved_at: string | null
          author_user_id: string
          created_at: string
          cycle_label: string | null
          evaluation_model: "legacy_template" | "monthly_criteria"
          frequency: "weekly" | "monthly" | null
          id: string
          operation_id: string
          period_end: string | null
          period_start: string | null
          row_version: number
          score: number | null
          status: "draft" | "submitted" | "returned" | "approved" | "superseded"
          submitted_at: string | null
          template_version_id: string | null
          updated_at: string
          validated_at: string | null
          validator_note: string | null
          validator_user_id: string | null
          visit_id: string | null
        }
        Insert: {
          approved_at?: string | null
          author_user_id: string
          created_at?: string
          cycle_label?: string | null
          evaluation_model?: "legacy_template" | "monthly_criteria"
          frequency?: "weekly" | "monthly" | null
          id?: string
          operation_id: string
          period_end?: string | null
          period_start?: string | null
          row_version?: number
          score?: number | null
          status?:
            | "draft"
            | "submitted"
            | "returned"
            | "approved"
            | "superseded"
          submitted_at?: string | null
          template_version_id?: string | null
          updated_at?: string
          validated_at?: string | null
          validator_note?: string | null
          validator_user_id?: string | null
          visit_id?: string | null
        }
        Update: {
          approved_at?: string | null
          author_user_id?: string
          created_at?: string
          cycle_label?: string | null
          evaluation_model?: "legacy_template" | "monthly_criteria"
          frequency?: "weekly" | "monthly" | null
          id?: string
          operation_id?: string
          period_end?: string | null
          period_start?: string | null
          row_version?: number
          score?: number | null
          status?:
            | "draft"
            | "submitted"
            | "returned"
            | "approved"
            | "superseded"
          submitted_at?: string | null
          template_version_id?: string | null
          updated_at?: string
          validated_at?: string | null
          validator_note?: string | null
          validator_user_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "evaluations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "audit_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_validator_user_id_fkey"
            columns: ["validator_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_validator_user_id_fkey"
            columns: ["validator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_files: {
        Row: {
          author_user_id: string
          bucket: string
          created_at: string
          id: string
          mime_type: string
          path: string
          retention_until: string | null
          sha256: string | null
          size_bytes: number
          source_object_id: string
          status:
            | "local_pending"
            | "uploading"
            | "stored"
            | "failed"
            | "expired"
        }
        Insert: {
          author_user_id: string
          bucket: string
          created_at?: string
          id?: string
          mime_type: string
          path: string
          retention_until?: string | null
          sha256?: string | null
          size_bytes: number
          source_object_id: string
          status?:
            | "local_pending"
            | "uploading"
            | "stored"
            | "failed"
            | "expired"
        }
        Update: {
          author_user_id?: string
          bucket?: string
          created_at?: string
          id?: string
          mime_type?: string
          path?: string
          retention_until?: string | null
          sha256?: string | null
          size_bytes?: number
          source_object_id?: string
          status?:
            | "local_pending"
            | "uploading"
            | "stored"
            | "failed"
            | "expired"
        }
        Relationships: [
          {
            foreignKeyName: "evidence_files_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_files_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_upload_reservations: {
        Row: {
          answer_id: string | null
          author_user_id: string
          bucket: string
          created_at: string
          criterion_answer_id: string | null
          evaluation_id: string
          id: string
          mime_type: string
          original_name: string
          path: string
          size_bytes: number
        }
        Insert: {
          answer_id?: string | null
          author_user_id: string
          bucket: string
          created_at?: string
          criterion_answer_id?: string | null
          evaluation_id: string
          id?: string
          mime_type: string
          original_name: string
          path: string
          size_bytes: number
        }
        Update: {
          answer_id?: string | null
          author_user_id?: string
          bucket?: string
          created_at?: string
          criterion_answer_id?: string | null
          evaluation_id?: string
          id?: string
          mime_type?: string
          original_name?: string
          path?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "evidence_upload_reservations_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "evaluation_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_upload_reservations_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_upload_reservations_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_upload_reservations_criterion_answer_id_fkey"
            columns: ["criterion_answer_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criterion_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_upload_reservations_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_upload_reservations_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluation_people"
            referencedColumns: ["evaluationId"]
          },
          {
            foreignKeyName: "evidence_upload_reservations_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      indicator_definitions: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          lifecycle: "draft" | "active" | "inactive"
          name: string
          region_id: string | null
          scope_kind: "global" | "regional"
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: "draft" | "active" | "inactive"
          name: string
          region_id?: string | null
          scope_kind?: "global" | "regional"
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: "draft" | "active" | "inactive"
          name?: string
          region_id?: string | null
          scope_kind?: "global" | "regional"
        }
        Relationships: [
          {
            foreignKeyName: "indicator_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_definitions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_definitions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["regionId"]
          },
        ]
      }
      indicator_regional_config_versions: {
        Row: {
          active: boolean
          config_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          include_in_assisted_management: boolean
          include_in_monthly_audit: boolean
          indicator_version_id: string
          sort_order: number
          status: "draft" | "published"
          target: number
          theme_version_id: string
          tolerance: number
          version_number: number
          weight: number
        }
        Insert: {
          active?: boolean
          config_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          include_in_assisted_management?: boolean
          include_in_monthly_audit?: boolean
          indicator_version_id: string
          sort_order?: number
          status?: "draft" | "published"
          target: number
          theme_version_id: string
          tolerance?: number
          version_number: number
          weight?: number
        }
        Update: {
          active?: boolean
          config_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          include_in_assisted_management?: boolean
          include_in_monthly_audit?: boolean
          indicator_version_id?: string
          sort_order?: number
          status?: "draft" | "published"
          target?: number
          theme_version_id?: string
          tolerance?: number
          version_number?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "indicator_regional_config_versions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "indicator_regional_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_regional_config_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_regional_config_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_regional_config_versions_indicator_version_id_fkey"
            columns: ["indicator_version_id"]
            isOneToOne: false
            referencedRelation: "indicator_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_regional_config_versions_theme_version_id_fkey"
            columns: ["theme_version_id"]
            isOneToOne: false
            referencedRelation: "theme_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      indicator_regional_configs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          indicator_definition_id: string
          region_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          indicator_definition_id: string
          region_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          indicator_definition_id?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicator_regional_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_regional_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_regional_configs_indicator_definition_id_fkey"
            columns: ["indicator_definition_id"]
            isOneToOne: false
            referencedRelation: "indicator_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_regional_configs_indicator_definition_id_fkey"
            columns: ["indicator_definition_id"]
            isOneToOne: false
            referencedRelation: "ui_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_regional_configs_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_regional_configs_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["regionId"]
          },
        ]
      }
      indicator_results: {
        Row: {
          actual: number
          created_at: string
          created_by: string | null
          diagnosis: string | null
          id: string
          indicator_id: string
          observation: string | null
          operation_id: string
          period: string
          previous_actual: number
          target: number
          updated_at: string
        }
        Insert: {
          actual?: number
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          indicator_id: string
          observation?: string | null
          operation_id: string
          period: string
          previous_actual?: number
          target?: number
          updated_at?: string
        }
        Update: {
          actual?: number
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          indicator_id?: string
          observation?: string | null
          operation_id?: string
          period?: string
          previous_actual?: number
          target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicator_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_results_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicator_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_results_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "ui_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_results_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_results_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_results_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "indicator_results_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      indicator_versions: {
        Row: {
          created_at: string
          created_by: string | null
          definition_id: string
          description: string | null
          direction: "higher_better" | "lower_better" | "target_band"
          effective_from: string
          effective_to: string | null
          id: string
          limitations: string | null
          name: string | null
          status: "draft" | "published"
          target: number
          unit: string
          version_number: number
          weight: number
          yellow_tolerance: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition_id: string
          description?: string | null
          direction: "higher_better" | "lower_better" | "target_band"
          effective_from?: string
          effective_to?: string | null
          id?: string
          limitations?: string | null
          name?: string | null
          status?: "draft" | "published"
          target: number
          unit: string
          version_number: number
          weight?: number
          yellow_tolerance?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition_id?: string
          description?: string | null
          direction?: "higher_better" | "lower_better" | "target_band"
          effective_from?: string
          effective_to?: string | null
          id?: string
          limitations?: string | null
          name?: string | null
          status?: "draft" | "published"
          target?: number
          unit?: string
          version_number?: number
          weight?: number
          yellow_tolerance?: number
        }
        Relationships: [
          {
            foreignKeyName: "indicator_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_versions_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "indicator_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_versions_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "ui_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      measurements: {
        Row: {
          actual_value: number
          created_at: string
          created_by: string | null
          id: string
          indicator_version_id: string
          operation_id: string
          period: string
          target_value: number
          updated_at: string
        }
        Insert: {
          actual_value: number
          created_at?: string
          created_by?: string | null
          id?: string
          indicator_version_id: string
          operation_id: string
          period: string
          target_value: number
          updated_at?: string
        }
        Update: {
          actual_value?: number
          created_at?: string
          created_by?: string | null
          id?: string
          indicator_version_id?: string
          operation_id?: string
          period?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_indicator_version_id_fkey"
            columns: ["indicator_version_id"]
            isOneToOne: false
            referencedRelation: "indicator_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "measurements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      official_snapshots: {
        Row: {
          approved_by_user_id: string
          created_at: string
          evaluation_id: string
          evaluation_model: "legacy_template" | "monthly_criteria"
          id: string
          operation_id: string
          payload: Json
          period: string
          score: number | null
          template_version_id: string | null
        }
        Insert: {
          approved_by_user_id: string
          created_at?: string
          evaluation_id: string
          evaluation_model?: "legacy_template" | "monthly_criteria"
          id?: string
          operation_id: string
          payload: Json
          period: string
          score?: number | null
          template_version_id?: string | null
        }
        Update: {
          approved_by_user_id?: string
          created_at?: string
          evaluation_id?: string
          evaluation_model?: "legacy_template" | "monthly_criteria"
          id?: string
          operation_id?: string
          payload?: Json
          period?: string
          score?: number | null
          template_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "official_snapshots_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_snapshots_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_snapshots_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_snapshots_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluation_people"
            referencedColumns: ["evaluationId"]
          },
          {
            foreignKeyName: "official_snapshots_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_snapshots_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_snapshots_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_snapshots_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "official_snapshots_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_snapshots_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "audit_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_assignments: {
        Row: {
          active: boolean
          operation_id: string
          user_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          operation_id: string
          user_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          operation_id?: string
          user_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_assignments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_assignments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_assignments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "operation_assignments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          active: boolean
          channel_manager_user_id: string | null
          city: string
          cnpj: string | null
          coordination_id: string
          created_at: string
          ddd: string | null
          id: string
          office_name: string
          partner_name: string
          source_code: string | null
          state: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel_manager_user_id?: string | null
          city: string
          cnpj?: string | null
          coordination_id: string
          created_at?: string
          ddd?: string | null
          id?: string
          office_name: string
          partner_name: string
          source_code?: string | null
          state: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel_manager_user_id?: string | null
          city?: string
          cnpj?: string | null
          coordination_id?: string
          created_at?: string
          ddd?: string | null
          id?: string
          office_name?: string
          partner_name?: string
          source_code?: string | null
          state?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_channel_manager_user_id_fkey"
            columns: ["channel_manager_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_channel_manager_user_id_fkey"
            columns: ["channel_manager_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_coordination_id_fkey"
            columns: ["coordination_id"]
            isOneToOne: false
            referencedRelation: "coordinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      region_weightings: {
        Row: {
          assisted_weight: number
          audit_weight: number
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          published_at: string | null
          published_by: string | null
          region_id: string
          status: "draft" | "published"
          version_number: number
        }
        Insert: {
          assisted_weight: number
          audit_weight: number
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          region_id: string
          status?: "draft" | "published"
          version_number: number
        }
        Update: {
          assisted_weight?: number
          audit_weight?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          region_id?: string
          status?: "draft" | "published"
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "region_weightings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_weightings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_weightings_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_weightings_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_weightings_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_weightings_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["regionId"]
          },
        ]
      }
      regions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_operations: {
        Row: {
          attempts: number
          created_at: string
          device_id: string | null
          expected_row_version: number | null
          id: string
          idempotency_key: string
          kind: string
          last_error: string | null
          payload: Json | null
          processed_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          device_id?: string | null
          expected_row_version?: number | null
          id?: string
          idempotency_key: string
          kind: string
          last_error?: string | null
          payload?: Json | null
          processed_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          device_id?: string | null
          expected_row_version?: number | null
          id?: string
          idempotency_key?: string
          kind?: string
          last_error?: string | null
          payload?: Json | null
          processed_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_operations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_operations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          client_readable: boolean
          description: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          client_readable?: boolean
          description?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          client_readable?: boolean
          description?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_versions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          name: string
          sort_order: number
          status: "draft" | "published"
          theme_id: string
          version_number: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          name: string
          sort_order?: number
          status?: "draft" | "published"
          theme_id: string
          version_number: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          name?: string
          sort_order?: number
          status?: "draft" | "published"
          theme_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "theme_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_versions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          lifecycle: "draft" | "active" | "inactive"
          region_id: string | null
          scope_kind: "global" | "regional"
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: "draft" | "active" | "inactive"
          region_id?: string | null
          scope_kind?: "global" | "regional"
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: "draft" | "active" | "inactive"
          region_id?: string | null
          scope_kind?: "global" | "regional"
        }
        Relationships: [
          {
            foreignKeyName: "themes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "themes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "themes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "themes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["regionId"]
          },
        ]
      }
      units: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          region_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          region_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          region_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["regionId"]
          },
        ]
      }
      user_scopes: {
        Row: {
          active: boolean
          coordination_id: string | null
          created_at: string
          created_by: string | null
          id: string
          region_id: string | null
          role: "admin" | "regional" | "coordinator" | "channel_manager"
          unit_id: string | null
          user_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          coordination_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          region_id?: string | null
          role: "admin" | "regional" | "coordinator" | "channel_manager"
          unit_id?: string | null
          user_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          coordination_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          region_id?: string | null
          role?: "admin" | "regional" | "coordinator" | "channel_manager"
          unit_id?: string | null
          user_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_scopes_coordination_id_fkey"
            columns: ["coordination_id"]
            isOneToOne: false
            referencedRelation: "coordinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["regionId"]
          },
          {
            foreignKeyName: "user_scopes_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          corporate_email: string
          created_at: string
          display_name: string
          id: string
          status: "invited" | "active" | "suspended" | "inactive"
          updated_at: string
        }
        Insert: {
          corporate_email: string
          created_at?: string
          display_name: string
          id: string
          status?: "invited" | "active" | "suspended" | "inactive"
          updated_at?: string
        }
        Update: {
          corporate_email?: string
          created_at?: string
          display_name?: string
          id?: string
          status?: "invited" | "active" | "suspended" | "inactive"
          updated_at?: string
        }
        Relationships: []
      }
      validations: {
        Row: {
          created_at: string
          decision: "approved" | "returned"
          evaluation_id: string
          id: string
          reason: string
          validator_user_id: string
        }
        Insert: {
          created_at?: string
          decision: "approved" | "returned"
          evaluation_id: string
          id?: string
          reason: string
          validator_user_id: string
        }
        Update: {
          created_at?: string
          decision?: "approved" | "returned"
          evaluation_id?: string
          id?: string
          reason?: string
          validator_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validations_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validations_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluation_people"
            referencedColumns: ["evaluationId"]
          },
          {
            foreignKeyName: "validations_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "ui_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validations_validator_user_id_fkey"
            columns: ["validator_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validations_validator_user_id_fkey"
            columns: ["validator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_reports: {
        Row: {
          action_plan_ids: string[]
          created_at: string
          created_by: string
          critical_indicators: string[]
          id: string
          next_review_date: string | null
          objective: string
          operation_id: string
          summary: string
        }
        Insert: {
          action_plan_ids?: string[]
          created_at?: string
          created_by: string
          critical_indicators?: string[]
          id?: string
          next_review_date?: string | null
          objective?: string
          operation_id: string
          summary?: string
        }
        Update: {
          action_plan_ids?: string[]
          created_at?: string
          created_by?: string
          critical_indicators?: string[]
          id?: string
          next_review_date?: string | null
          objective?: string
          operation_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_reports_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_reports_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_reports_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "visit_reports_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_rules: {
        Row: {
          created_at: string
          id: string
          monthly_audit_week_ordinal: number
          monthly_audit_weekday: number
          tolerance_days: number
          unit_id: string
          updated_at: string
          weekly_visit_weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_audit_week_ordinal?: number
          monthly_audit_weekday?: number
          tolerance_days?: number
          unit_id: string
          updated_at?: string
          weekly_visit_weekday?: number
        }
        Update: {
          created_at?: string
          id?: string
          monthly_audit_week_ordinal?: number
          monthly_audit_weekday?: number
          tolerance_days?: number
          unit_id?: string
          updated_at?: string
          weekly_visit_weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "visit_rules_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          author_user_id: string | null
          created_at: string
          id: string
          operation_id: string
          scheduled_at: string
          status:
            | "planned"
            | "draft"
            | "ready"
            | "submitted"
            | "returned"
            | "approved"
            | "cancelled"
          updated_at: string
          visit_type: "weekly" | "monthly"
        }
        Insert: {
          author_user_id?: string | null
          created_at?: string
          id?: string
          operation_id: string
          scheduled_at: string
          status?:
            | "planned"
            | "draft"
            | "ready"
            | "submitted"
            | "returned"
            | "approved"
            | "cancelled"
          updated_at?: string
          visit_type: "weekly" | "monthly"
        }
        Update: {
          author_user_id?: string | null
          created_at?: string
          id?: string
          operation_id?: string
          scheduled_at?: string
          status?:
            | "planned"
            | "draft"
            | "ready"
            | "submitted"
            | "returned"
            | "approved"
            | "cancelled"
          updated_at?: string
          visit_type?: "weekly" | "monthly"
        }
        Relationships: [
          {
            foreignKeyName: "visits_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "visits_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ui_action_plans: {
        Row: {
          action: string | null
          assistedEntryId: string | null
          completionNote: string | null
          createdAt: string | null
          createdBy: string | null
          dueDate: string | null
          evaluationId: string | null
          expectedEvidence: string | null
          id: string | null
          monthlyCriterionAnswerId: string | null
          operationId: string | null
          owner: string | null
          priority: string | null
          problem: string | null
          rootCause: string | null
          source: string | null
          status: string | null
          themeId: string | null
          updatedAt: string | null
          validatedAt: string | null
          validatorName: string | null
        }
        Insert: {
          action?: never
          assistedEntryId?: never
          completionNote?: string | null
          createdAt?: string | null
          createdBy?: string | null
          dueDate?: never
          evaluationId?: never
          expectedEvidence?: string | null
          id?: string | null
          monthlyCriterionAnswerId?: never
          operationId?: string | null
          owner?: never
          priority?: string | null
          problem?: string | null
          rootCause?: string | null
          source?: never
          status?: never
          themeId?: never
          updatedAt?: string | null
          validatedAt?: string | null
          validatorName?: never
        }
        Update: {
          action?: never
          assistedEntryId?: never
          completionNote?: string | null
          createdAt?: string | null
          createdBy?: string | null
          dueDate?: never
          evaluationId?: never
          expectedEvidence?: string | null
          id?: string | null
          monthlyCriterionAnswerId?: never
          operationId?: string | null
          owner?: never
          priority?: string | null
          problem?: string | null
          rootCause?: string | null
          source?: never
          status?: never
          themeId?: never
          updatedAt?: string | null
          validatedAt?: string | null
          validatorName?: never
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_created_by_fkey"
            columns: ["createdBy"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_created_by_fkey"
            columns: ["createdBy"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_operation_id_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_operation_id_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_operation_id_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "action_plans_operation_id_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_admin_partners: {
        Row: {
          active: boolean | null
          city: string | null
          cnpj: string | null
          coordinationId: string | null
          coordinationName: string | null
          coordinatorId: string | null
          coordinatorMissing: boolean | null
          coordinatorName: string | null
          createdAt: string | null
          ddd: string | null
          id: string | null
          managerEmail: string | null
          managerId: string | null
          managerMissing: boolean | null
          managerName: string | null
          officeName: string | null
          partnerName: string | null
          regionId: string | null
          regionName: string | null
          sourceCode: string | null
          state: string | null
          unitId: string | null
          unitName: string | null
          updatedAt: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coordinations_coordinator_fk"
            columns: ["coordinatorId"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinations_coordinator_fk"
            columns: ["coordinatorId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_channel_manager_user_id_fkey"
            columns: ["managerId"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_channel_manager_user_id_fkey"
            columns: ["managerId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_coordination_id_fkey"
            columns: ["coordinationId"]
            isOneToOne: false
            referencedRelation: "coordinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_unit_id_fkey"
            columns: ["unitId"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_evaluation_people: {
        Row: {
          evaluationId: string | null
          evaluatorName: string | null
        }
        Relationships: []
      }
      ui_evaluations: {
        Row: {
          answers: Json | null
          createdAt: string | null
          cycleLabel: string | null
          evaluatorId: string | null
          frequency: string | null
          id: string | null
          operationId: string | null
          periodEnd: string | null
          periodStart: string | null
          score: number | null
          status: string | null
          submittedAt: string | null
          updatedAt: string | null
          validatedAt: string | null
          validatorId: string | null
          validatorNote: string | null
        }
        Insert: {
          answers?: never
          createdAt?: string | null
          cycleLabel?: never
          evaluatorId?: string | null
          frequency?: never
          id?: string | null
          operationId?: string | null
          periodEnd?: never
          periodStart?: never
          score?: never
          status?: never
          submittedAt?: string | null
          updatedAt?: string | null
          validatedAt?: string | null
          validatorId?: string | null
          validatorNote?: string | null
        }
        Update: {
          answers?: never
          createdAt?: string | null
          cycleLabel?: never
          evaluatorId?: string | null
          frequency?: never
          id?: string | null
          operationId?: string | null
          periodEnd?: never
          periodStart?: never
          score?: never
          status?: never
          submittedAt?: string | null
          updatedAt?: string | null
          validatedAt?: string | null
          validatorId?: string | null
          validatorNote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_author_user_id_fkey"
            columns: ["evaluatorId"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_author_user_id_fkey"
            columns: ["evaluatorId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_operation_id_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_operation_id_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_operation_id_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "ui_operation_people"
            referencedColumns: ["operationId"]
          },
          {
            foreignKeyName: "evaluations_operation_id_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_validator_user_id_fkey"
            columns: ["validatorId"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_validator_user_id_fkey"
            columns: ["validatorId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_evidences: {
        Row: {
          createdAt: string | null
          evaluationId: string | null
          id: string | null
          mimeType: string | null
          name: string | null
          sizeBytes: number | null
          status: string | null
          themeId: string | null
          type: string | null
          uri: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_answers_evaluation_id_fkey"
            columns: ["evaluationId"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_answers_evaluation_id_fkey"
            columns: ["evaluationId"]
            isOneToOne: false
            referencedRelation: "ui_evaluation_people"
            referencedColumns: ["evaluationId"]
          },
          {
            foreignKeyName: "evaluation_answers_evaluation_id_fkey"
            columns: ["evaluationId"]
            isOneToOne: false
            referencedRelation: "ui_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_indicators: {
        Row: {
          code: string | null
          createdAt: string | null
          id: string | null
          lifecycle: string | null
          name: string | null
          regionalConfigCount: number | null
          regionId: string | null
          scopeKind: "global" | "regional" | null
          usageCount: number | null
          versions: Json | null
        }
        Insert: {
          code?: string | null
          createdAt?: string | null
          id?: string | null
          lifecycle?: never
          name?: string | null
          regionalConfigCount?: never
          regionId?: string | null
          scopeKind?: "global" | "regional" | null
          usageCount?: never
          versions?: never
        }
        Update: {
          code?: string | null
          createdAt?: string | null
          id?: string | null
          lifecycle?: never
          name?: string | null
          regionalConfigCount?: never
          regionId?: string | null
          scopeKind?: "global" | "regional" | null
          usageCount?: never
          versions?: never
        }
        Relationships: [
          {
            foreignKeyName: "indicator_definitions_region_id_fkey"
            columns: ["regionId"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_definitions_region_id_fkey"
            columns: ["regionId"]
            isOneToOne: false
            referencedRelation: "ui_admin_partners"
            referencedColumns: ["regionId"]
          },
        ]
      }
      ui_operation_people: {
        Row: {
          coordinationName: string | null
          coordinatorName: string | null
          managerName: string | null
          operationId: string | null
        }
        Relationships: []
      }
      ui_operations: {
        Row: {
          active: boolean | null
          city: string | null
          coordinatorId: string | null
          currentScore: number | null
          id: string | null
          lastAudit: string | null
          managerId: string | null
          nextAudit: string | null
          officeName: string | null
          openActions: number | null
          partnerName: string | null
          previousScore: number | null
          state: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coordinations_coordinator_fk"
            columns: ["coordinatorId"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordinations_coordinator_fk"
            columns: ["coordinatorId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_channel_manager_user_id_fkey"
            columns: ["managerId"]
            isOneToOne: false
            referencedRelation: "ui_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_channel_manager_user_id_fkey"
            columns: ["managerId"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_users: {
        Row: {
          active: boolean | null
          avatarInitials: string | null
          coordinationId: string | null
          coordinatorId: string | null
          email: string | null
          id: string | null
          name: string | null
          region: string | null
          regionId: string | null
          role: string | null
          status: string | null
        }
        Insert: {
          active?: never
          avatarInitials?: never
          coordinationId?: never
          coordinatorId?: never
          email?: string | null
          id?: string | null
          name?: string | null
          region?: never
          regionId?: never
          role?: never
          status?: never
        }
        Update: {
          active?: never
          avatarInitials?: never
          coordinationId?: never
          coordinatorId?: never
          email?: string | null
          id?: string | null
          name?: string | null
          region?: never
          regionId?: never
          role?: never
          status?: never
        }
        Relationships: []
      }
    }
    Functions: {
      activate_self: { Args: never; Returns: Json }
      admin_activate_confirmed_user: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_activate_confirmed_users: {
        Args: { p_user_ids: string[] }
        Returns: Json
      }
      admin_add_indicator_version: {
        Args: { p_indicator_id: string; p_version: Json }
        Returns: Json
      }
      admin_bootstrap_organizational_structure: {
        Args: { p_commit?: boolean; p_rows: Json }
        Returns: Json
      }
      admin_bootstrap_partners: {
        Args: { p_commit: boolean; p_rows: Json }
        Returns: Json
      }
      admin_create_indicator: {
        Args: { p_code: string; p_name: string; p_version: Json }
        Returns: Json
      }
      admin_create_operation: { Args: { p_input: Json }; Returns: Json }
      admin_create_user: { Args: { p_input: Json }; Returns: Json }
      admin_deactivate_indicator: {
        Args: { p_indicator_id: string }
        Returns: Json
      }
      admin_delete_indicator: {
        Args: { p_indicator_id: string }
        Returns: undefined
      }
      admin_import_partners: {
        Args: { p_commit: boolean; p_rows: Json }
        Returns: Json
      }
      admin_import_users: {
        Args: { p_commit: boolean; p_rows: Json }
        Returns: Json
      }
      admin_require_password_change: {
        Args: { p_user_ids: string[] }
        Returns: Json
      }
      admin_set_user_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: Json
      }
      admin_set_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: Json
      }
      admin_set_weekly_audit_cutover: {
        Args: { p_confirm_retroactive?: boolean; p_date: string }
        Returns: Json
      }
      admin_update_indicator: {
        Args: { p_code: string; p_indicator_id: string; p_name: string }
        Returns: Json
      }
      admin_update_operation: {
        Args: { p_id: string; p_patch: Json }
        Returns: Json
      }
      catalog_add_criterion_version: {
        Args: { p_criterion_id: string; p_payload: Json }
        Returns: Json
      }
      catalog_add_indicator_version: {
        Args: { p_indicator_id: string; p_payload: Json }
        Returns: Json
      }
      catalog_add_theme_version: {
        Args: { p_payload: Json; p_theme_id: string }
        Returns: Json
      }
      catalog_create_criterion: {
        Args: { p_code: string; p_config_id: string; p_payload: Json }
        Returns: Json
      }
      catalog_create_indicator: {
        Args: {
          p_code: string
          p_payload: Json
          p_region_id: string
          p_scope: string
        }
        Returns: Json
      }
      catalog_create_theme: {
        Args: {
          p_code: string
          p_payload: Json
          p_region_id: string
          p_scope: string
        }
        Returns: Json
      }
      catalog_publish_criterion_version: {
        Args: { p_version_id: string }
        Returns: Json
      }
      catalog_publish_indicator_version: {
        Args: { p_version_id: string }
        Returns: Json
      }
      catalog_publish_region_weighting: {
        Args: { p_id: string }
        Returns: Json
      }
      catalog_publish_regional_config_version: {
        Args: { p_version_id: string }
        Returns: Json
      }
      catalog_publish_theme_version: {
        Args: { p_version_id: string }
        Returns: Json
      }
      catalog_save_region_weighting_draft: {
        Args: { p_input: Json; p_region_id: string }
        Returns: Json
      }
      catalog_save_regional_config_draft: {
        Args: { p_indicator_id: string; p_payload: Json; p_region_id: string }
        Returns: Json
      }
      catalog_set_criterion_lifecycle: {
        Args: { p_criterion_id: string; p_lifecycle: string }
        Returns: Json
      }
      catalog_set_indicator_lifecycle: {
        Args: { p_indicator_id: string; p_lifecycle: string }
        Returns: Json
      }
      catalog_set_theme_lifecycle: {
        Args: { p_lifecycle: string; p_theme_id: string }
        Returns: Json
      }
      close_assisted_cycle: { Args: { p_cycle_id: string }; Returns: Json }
      confirm_evidence_upload: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      create_visit_report: {
        Args: { p_created_by: string; p_input: Json }
        Returns: Json
      }
      discard_evidence_reservation: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      evidence_path: { Args: { p_evidence_id: string }; Returns: string }
      export_dataset: {
        Args: { p_filters?: Json; p_module: string }
        Returns: Json
      }
      get_assisted_cycle: {
        Args: { p_operation_id: string; p_week_start_date?: string }
        Returns: Json
      }
      get_dashboard_aggregates: { Args: { p_filters?: Json }; Returns: Json }
      get_matrix_dataset: { Args: { p_filters?: Json }; Returns: Json }
      get_monthly_audit: {
        Args: { p_competence: string; p_operation_id: string }
        Returns: Json
      }
      get_monthly_audit_report_data: {
        Args: { p_evaluation_id: string }
        Returns: Json
      }
      get_monthly_audit_snapshot: {
        Args: { p_evaluation_id: string }
        Returns: Json
      }
      get_official_audit_report_data: {
        Args: { p_evaluation_id: string }
        Returns: Json
      }
      get_system_settings: { Args: never; Returns: Json }
      get_weighting_status: { Args: { p_region_id?: string }; Returns: Json }
      list_assisted_cycles: {
        Args: { p_limit?: number; p_operation_id: string }
        Returns: Json
      }
      list_monthly_audits: {
        Args: { p_limit?: number; p_operation_id: string }
        Returns: Json
      }
      log_official_audit_report_export: {
        Args: {
          p_evaluation_id: string
          p_integrity_code: string
          p_report_version: string
          p_snapshot_id: string
        }
        Returns: Json
      }
      open_assisted_cycle: {
        Args: { p_operation_id: string; p_reference_date?: string }
        Returns: Json
      }
      password_change_status: { Args: never; Returns: Json }
      remove_evidence: {
        Args: { p_evaluation_id: string; p_evidence_id: string }
        Returns: undefined
      }
      remove_evidence_file: {
        Args: { p_evidence_id: string }
        Returns: undefined
      }
      reserve_evidence_upload: {
        Args: { p_evaluation_id: string; p_input: Json; p_theme_id: string }
        Returns: Json
      }
      save_action_plan: { Args: { p_input: Json }; Returns: Json }
      save_assisted_entry: {
        Args: { p_entry_id: string; p_patch: Json }
        Returns: Json
      }
      save_criterion_answer: {
        Args: { p_answer_id: string; p_patch: Json }
        Returns: Json
      }
      save_evaluation_answer: {
        Args: { p_evaluation_id: string; p_patch: Json; p_theme_id: string }
        Returns: Json
      }
      save_indicator_result: { Args: { p_input: Json }; Returns: Json }
      service_complete_initial_password_change: {
        Args: { p_user_id: string }
        Returns: Json
      }
      start_evaluation: {
        Args: {
          p_evaluator_id: string
          p_frequency: string
          p_operation_id: string
        }
        Returns: Json
      }
      start_monthly_audit: {
        Args: { p_competence: string; p_operation_id: string }
        Returns: Json
      }
      submit_evaluation: { Args: { p_evaluation_id: string }; Returns: Json }
      submit_monthly_audit: { Args: { p_evaluation_id: string }; Returns: Json }
      update_action_status: {
        Args: { p_plan_id: string; p_status: string }
        Returns: Json
      }
      update_indicator_result: {
        Args: { p_patch: Json; p_result_id: string }
        Returns: Json
      }
      validate_evaluation: {
        Args: { p_decision: string; p_evaluation_id: string; p_note: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
