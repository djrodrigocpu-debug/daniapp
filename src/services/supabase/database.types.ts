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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_plans: {
        Row: {
          action_text: string
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
          operation_id: string
          origin: string
          owner_name: string
          owner_user_id: string | null
          priority: string
          problem: string
          root_cause: string
          row_version: number
          status:
            | "open"
            | "in_progress"
            | "blocked"
            | "done"
            | "overdue"
            | "cancelled_justified"
          theme_code: string | null
          updated_at: string
        }
        Insert: {
          action_text?: string
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
          operation_id: string
          origin?: string
          owner_name?: string
          owner_user_id?: string | null
          priority: string
          problem?: string
          root_cause?: string
          row_version?: number
          status?:
            | "open"
            | "in_progress"
            | "blocked"
            | "done"
            | "overdue"
            | "cancelled_justified"
          theme_code?: string | null
          updated_at?: string
        }
        Update: {
          action_text?: string
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
          operation_id?: string
          origin?: string
          owner_name?: string
          owner_user_id?: string | null
          priority?: string
          problem?: string
          root_cause?: string
          row_version?: number
          status?:
            | "open"
            | "in_progress"
            | "blocked"
            | "done"
            | "overdue"
            | "cancelled_justified"
          theme_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_completion_evidence_id_fkey"
            columns: ["completion_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
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
        ]
      }
      evaluation_answers: {
        Row: {
          evaluation_id: string
          id: string
          item_id: string
          measured_value: string
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
      evaluations: {
        Row: {
          approved_at: string | null
          author_user_id: string
          created_at: string
          cycle_label: string | null
          frequency: "weekly" | "monthly" | null
          id: string
          operation_id: string
          period_end: string | null
          period_start: string | null
          row_version: number
          score: number
          status: "draft" | "submitted" | "returned" | "approved" | "superseded"
          submitted_at: string | null
          template_version_id: string
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
          frequency?: "weekly" | "monthly" | null
          id?: string
          operation_id: string
          period_end?: string | null
          period_start?: string | null
          row_version?: number
          score?: number
          status?:
            | "draft"
            | "submitted"
            | "returned"
            | "approved"
            | "superseded"
          submitted_at?: string | null
          template_version_id: string
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
          frequency?: "weekly" | "monthly" | null
          id?: string
          operation_id?: string
          period_end?: string | null
          period_start?: string | null
          row_version?: number
          score?: number
          status?:
            | "draft"
            | "submitted"
            | "returned"
            | "approved"
            | "superseded"
          submitted_at?: string | null
          template_version_id?: string
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
      indicator_definitions: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          lifecycle: "draft" | "active" | "inactive"
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: "draft" | "active" | "inactive"
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: "draft" | "active" | "inactive"
          name?: string
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
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      indicator_versions: {
        Row: {
          created_at: string
          definition_id: string
          direction: "higher_better" | "lower_better" | "target_band"
          effective_from: string
          id: string
          limitations: string | null
          target: number
          unit: string
          version_number: number
          weight: number
          yellow_tolerance: number
        }
        Insert: {
          created_at?: string
          definition_id: string
          direction: "higher_better" | "lower_better" | "target_band"
          effective_from?: string
          id?: string
          limitations?: string | null
          target: number
          unit: string
          version_number: number
          weight?: number
          yellow_tolerance?: number
        }
        Update: {
          created_at?: string
          definition_id?: string
          direction?: "higher_better" | "lower_better" | "target_band"
          effective_from?: string
          id?: string
          limitations?: string | null
          target?: number
          unit?: string
          version_number?: number
          weight?: number
          yellow_tolerance?: number
        }
        Relationships: [
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
          id: string
          operation_id: string
          payload: Json
          period: string
          score: number
          template_version_id: string
        }
        Insert: {
          approved_by_user_id: string
          created_at?: string
          evaluation_id: string
          id?: string
          operation_id: string
          payload: Json
          period: string
          score: number
          template_version_id: string
        }
        Update: {
          approved_by_user_id?: string
          created_at?: string
          evaluation_id?: string
          id?: string
          operation_id?: string
          payload?: Json
          period?: string
          score?: number
          template_version_id?: string
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
          coordination_id: string
          created_at: string
          id: string
          office_name: string
          partner_name: string
          state: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel_manager_user_id?: string | null
          city: string
          coordination_id: string
          created_at?: string
          id?: string
          office_name: string
          partner_name: string
          state: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel_manager_user_id?: string | null
          city?: string
          coordination_id?: string
          created_at?: string
          id?: string
          office_name?: string
          partner_name?: string
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
          completionNote: string | null
          createdAt: string | null
          dueDate: string | null
          evaluationId: string | null
          expectedEvidence: string | null
          id: string | null
          operationId: string | null
          owner: string | null
          priority: string | null
          problem: string | null
          rootCause: string | null
          status: string | null
          themeId: string | null
          updatedAt: string | null
        }
        Insert: {
          action?: never
          completionNote?: string | null
          createdAt?: string | null
          dueDate?: never
          evaluationId?: never
          expectedEvidence?: string | null
          id?: string | null
          operationId?: string | null
          owner?: never
          priority?: string | null
          problem?: string | null
          rootCause?: string | null
          status?: never
          themeId?: never
          updatedAt?: string | null
        }
        Update: {
          action?: never
          completionNote?: string | null
          createdAt?: string | null
          dueDate?: never
          evaluationId?: never
          expectedEvidence?: string | null
          id?: string | null
          operationId?: string | null
          owner?: never
          priority?: string | null
          problem?: string | null
          rootCause?: string | null
          status?: never
          themeId?: never
          updatedAt?: string | null
        }
        Relationships: [
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
            referencedRelation: "ui_operations"
            referencedColumns: ["id"]
          },
        ]
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
      ui_indicators: {
        Row: {
          code: string | null
          createdAt: string | null
          id: string | null
          lifecycle: string | null
          name: string | null
          usageCount: number | null
          versions: Json | null
        }
        Insert: {
          code?: string | null
          createdAt?: string | null
          id?: string | null
          lifecycle?: never
          name?: string | null
          usageCount?: never
          versions?: never
        }
        Update: {
          code?: string | null
          createdAt?: string | null
          id?: string | null
          lifecycle?: never
          name?: string | null
          usageCount?: never
          versions?: never
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
          coordinatorId: string | null
          email: string | null
          id: string | null
          name: string | null
          region: string | null
          role: string | null
        }
        Insert: {
          active?: never
          avatarInitials?: never
          coordinatorId?: never
          email?: string | null
          id?: string | null
          name?: string | null
          region?: never
          role?: never
        }
        Update: {
          active?: never
          avatarInitials?: never
          coordinatorId?: never
          email?: string | null
          id?: string | null
          name?: string | null
          region?: never
          role?: never
        }
        Relationships: []
      }
    }
    Functions: {
      add_evidence: {
        Args: { p_evaluation_id: string; p_input: Json; p_theme_id: string }
        Returns: Json
      }
      admin_add_indicator_version: {
        Args: { p_indicator_id: string; p_version: Json }
        Returns: Json
      }
      admin_create_indicator: {
        Args: { p_code: string; p_name: string; p_version: Json }
        Returns: Json
      }
      admin_create_user: { Args: { p_input: Json }; Returns: Json }
      admin_deactivate_indicator: {
        Args: { p_indicator_id: string }
        Returns: Json
      }
      admin_delete_indicator: {
        Args: { p_indicator_id: string }
        Returns: undefined
      }
      admin_set_user_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: Json
      }
      admin_set_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: Json
      }
      create_visit_report: {
        Args: { p_created_by: string; p_input: Json }
        Returns: Json
      }
      evidence_path: { Args: { p_evidence_id: string }; Returns: string }
      remove_evidence: {
        Args: { p_evaluation_id: string; p_evidence_id: string }
        Returns: undefined
      }
      remove_evidence_file: {
        Args: { p_evidence_id: string }
        Returns: undefined
      }
      save_action_plan: { Args: { p_input: Json }; Returns: Json }
      save_evaluation_answer: {
        Args: { p_evaluation_id: string; p_patch: Json; p_theme_id: string }
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
      submit_evaluation: { Args: { p_evaluation_id: string }; Returns: Json }
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
