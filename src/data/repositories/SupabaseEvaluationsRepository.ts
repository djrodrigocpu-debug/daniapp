/**
 * Adapter Supabase do EvaluationsRepository (Masterplan §6, §7.4, §11.4).
 *
 * CLASSIFICAÇÃO: REAL REMOTO — **não exercitado neste ambiente** (sem Supabase).
 * Pronto para conexão: leituras por projeções `ui_*` (RLS no servidor) e escritas
 * por RPCs server-side idempotentes (a autoridade das travas de envio e do
 * versionamento fica no servidor — §7.4, §11.4). As funções/projeções server-side
 * são criadas no provisionamento; até lá permanece BLOQUEADO PARA AMBIENTE REMOTO.
 * Nunca usa `service_role`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ActionPlan, AssessmentAnswer, Evaluation, Evidence, Frequency } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import {
  ActionPlanInput,
  EvaluationsRepository,
  EvidenceInput,
} from './EvaluationsRepository';

function fail(message: string, cause?: unknown): AppError {
  return new AppError('network/unavailable', message, { severity: 'high', cause });
}

/** Mapeia rpc/select genérico → Result, com mensagem apresentável. */
function toResult<T>(data: T | null, error: unknown, message: string): Result<T> {
  if (error) return err(fail(message, error));
  return ok(data as T);
}

export class SupabaseEvaluationsRepository implements EvaluationsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getById(id: string): Promise<Result<Evaluation | null>> {
    const { data, error } = await this.client.from('ui_evaluations').select('*').eq('id', id).maybeSingle();
    return toResult((data as Evaluation) ?? null, error, 'Falha ao carregar a avaliação.');
  }

  async listByOperation(operationId: string): Promise<Result<Evaluation[]>> {
    const { data, error } = await this.client
      .from('ui_evaluations')
      .select('*')
      .eq('operationId', operationId)
      .order('createdAt', { ascending: false });
    return toResult((data as Evaluation[]) ?? [], error, 'Falha ao carregar o histórico.');
  }

  async getCurrentDraft(operationId: string): Promise<Result<Evaluation | null>> {
    const { data, error } = await this.client
      .from('ui_evaluations')
      .select('*')
      .eq('operationId', operationId)
      .in('status', ['draft', 'returned'])
      .maybeSingle();
    return toResult((data as Evaluation) ?? null, error, 'Falha ao carregar o rascunho.');
  }

  async startEvaluation(operationId: string, frequency: Frequency, evaluatorId: string): Promise<Result<Evaluation>> {
    const { data, error } = await this.client.rpc('start_evaluation', {
      p_operation_id: operationId,
      p_frequency: frequency,
      p_evaluator_id: evaluatorId,
    });
    return toResult(data as Evaluation, error, 'Falha ao abrir a auditoria.');
  }

  async saveAnswer(evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>): Promise<Result<Evaluation>> {
    const { data, error } = await this.client.rpc('save_evaluation_answer', {
      p_evaluation_id: evaluationId,
      p_theme_id: themeId,
      p_patch: patch,
    });
    return toResult(data as Evaluation, error, 'Falha ao salvar a resposta.');
  }

  async addEvidence(evaluationId: string, themeId: string, input: EvidenceInput): Promise<Result<Evidence>> {
    const { data, error } = await this.client.rpc('add_evidence', {
      p_evaluation_id: evaluationId,
      p_theme_id: themeId,
      p_input: input,
    });
    return toResult(data as Evidence, error, 'Falha ao anexar a evidência.');
  }

  async removeEvidence(evaluationId: string, evidenceId: string): Promise<Result<true>> {
    const { error } = await this.client.rpc('remove_evidence', {
      p_evaluation_id: evaluationId,
      p_evidence_id: evidenceId,
    });
    return error ? err(fail('Falha ao remover a evidência.', error)) : ok(true);
  }

  async saveActionPlan(input: ActionPlanInput): Promise<Result<ActionPlan>> {
    const { data, error } = await this.client.rpc('save_action_plan', { p_input: input });
    return toResult(data as ActionPlan, error, 'Falha ao salvar o plano de ação.');
  }

  async listActionPlans(evaluationId: string): Promise<Result<ActionPlan[]>> {
    const { data, error } = await this.client
      .from('ui_action_plans')
      .select('*')
      .eq('evaluation_id', evaluationId);
    return toResult((data as ActionPlan[]) ?? [], error, 'Falha ao carregar os planos.');
  }

  async submit(evaluationId: string): Promise<Result<Evaluation>> {
    // A autoridade das travas de envio (§7.4) é o servidor; o cliente apenas dispara.
    const { data, error } = await this.client.rpc('submit_evaluation', { p_evaluation_id: evaluationId });
    return toResult(data as Evaluation, error, 'Falha ao enviar para validação.');
  }
}
