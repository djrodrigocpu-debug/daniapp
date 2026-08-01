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
import { SupabaseEvidenceRepository, mensagemDoServidor } from './EvidenceRepository';
import {
  MENSAGENS,
  motivoDoErroDoServidor,
  type ResultadoDosDados,
} from '../../domain/report/exportarRelatorioOficial';
import type { OfficialAuditReportInput } from '../../domain/report/officialAuditReport';

function fail(message: string, cause?: unknown): AppError {
  return new AppError('network/unavailable', message, { severity: 'high', cause });
}

/** Mapeia rpc/select genérico → Result, com mensagem apresentável. */
function toResult<T>(data: T | null, error: unknown, message: string): Result<T> {
  if (error) return err(fail(message, error));
  return ok(data as T);
}

export class SupabaseEvaluationsRepository implements EvaluationsRepository {
  /**
   * O armazenamento da evidência é delegado ao repositório de evidências —
   * mesmo desenho já usado no modo local. Antes da 1.3.1 esta classe chamava a
   * RPC `add_evidence` direto, que criava metadata dizendo 'stored' sem que
   * nenhum byte subisse: o repositório de upload existia e ficava fora do
   * caminho da tela (D-02).
   */
  constructor(
    private readonly client: SupabaseClient,
    private readonly evidence: SupabaseEvidenceRepository,
  ) {}

  /** A RLS restringe as linhas ao escopo do usuário autenticado. */
  async listVisible(): Promise<Result<Evaluation[]>> {
    const { data, error } = await this.client
      .from('ui_evaluations')
      .select('*')
      .order('createdAt', { ascending: false });
    return toResult((data as Evaluation[]) ?? [], error, 'Falha ao carregar as avaliações.');
  }

  /**
   * Projeção `ui_evidences` (0019): metadados sob a RLS de `evidence_files`.
   * A view traz também `evaluationId` (chave de limpeza administrativa);
   * o mapeamento devolve exatamente a forma `Evidence` que a tela consome.
   */
  async listVisibleEvidences(): Promise<Result<Evidence[]>> {
    const { data, error } = await this.client.from('ui_evidences').select('*');
    if (error) return err(fail('Falha ao carregar as evidências.', error));
    const rows = (data ?? []) as Array<Evidence & { evaluationId?: string }>;
    return ok(rows.map(({ evaluationId: _descartado, ...evidence }) => evidence as Evidence));
  }

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
    return this.evidence.attach(evaluationId, themeId, {
      themeId,
      name: input.name,
      uri: input.uri,
      mimeType: input.mimeType,
      type: input.type,
      sizeBytes: input.sizeBytes,
    });
  }

  /**
   * Remove metadata, vínculo e TAMBÉM o binário. O caminho é obtido antes, pela
   * `evidence_path` (verificada por escopo no servidor); a ordem é metadata →
   * objeto, para que uma falha na segunda etapa deixe no máximo um objeto órfão,
   * nunca um metadata apontando para arquivo inexistente.
   *
   * A ORDEM banco → Storage também é o que torna a guarda de estado da 0034
   * efetiva: a recusa acontece antes de qualquer remoção física, então uma
   * tentativa em avaliação enviada não chega a tocar o arquivo.
   */
  async removeEvidence(evaluationId: string, evidenceId: string): Promise<Result<true>> {
    const caminho = await this.client.rpc('evidence_path', { p_evidence_id: evidenceId });
    const { error } = await this.client.rpc('remove_evidence', {
      p_evaluation_id: evaluationId,
      p_evidence_id: evidenceId,
    });
    // A mensagem do servidor é escrita para o usuário final e explica POR QUE a
    // remoção foi recusada. Trocá-la por um texto genérico deixaria a pessoa
    // sem a única informação que resolve o problema dela: devolver a avaliação.
    if (error) return err(fail(mensagemDoServidor(error, 'Falha ao remover a evidência.'), error));

    if (!caminho.error && typeof caminho.data === 'string') {
      const limpeza = await this.client.storage.from('evidencias').remove([caminho.data]);
      if (limpeza.error) {
        return err(new AppError('network/unavailable',
          'A evidência saiu da avaliação, mas o arquivo não pôde ser apagado do armazenamento.',
          { severity: 'medium', cause: limpeza.error }));
      }
    }
    return ok(true);
  }

  async saveActionPlan(input: ActionPlanInput): Promise<Result<ActionPlan>> {
    const { data, error } = await this.client.rpc('save_action_plan', { p_input: input });
    return toResult(data as ActionPlan, error, 'Falha ao salvar o plano de ação.');
  }

  async listActionPlans(evaluationId: string): Promise<Result<ActionPlan[]>> {
    // A coluna da view é a quotada "evaluationId" — `evaluation_id` não existe
    // em ui_action_plans e derrubava a consulta inteira.
    const { data, error } = await this.client
      .from('ui_action_plans')
      .select('*')
      .eq('evaluationId', evaluationId);
    return toResult((data as ActionPlan[]) ?? [], error, 'Falha ao carregar os planos.');
  }

  async submit(evaluationId: string): Promise<Result<Evaluation>> {
    // A autoridade das travas de envio (§7.4) é o servidor; o cliente apenas dispara.
    const { data, error } = await this.client.rpc('submit_evaluation', { p_evaluation_id: evaluationId });
    return toResult(data as Evaluation, error, 'Falha ao enviar para validação.');
  }

  /**
   * Relatório Oficial de Auditoria (RPC 0035). Quem autoriza é o servidor: a
   * RPC exige `auth.uid()`, deriva a operação da própria avaliação, confere o
   * escopo e só então revela estado. Aqui a recusa é apenas CLASSIFICADA, para
   * que a tela escolha a mensagem certa — a mensagem crua do servidor nunca
   * chega ao usuário.
   */
  async getOfficialReportData(evaluationId: string): Promise<ResultadoDosDados> {
    const { data, error } = await this.client.rpc('get_official_audit_report_data', {
      p_evaluation_id: evaluationId,
    });
    if (error) {
      const motivo = motivoDoErroDoServidor(error.message ?? '');
      return { ok: false, motivo, message: MENSAGENS[motivo] };
    }
    if (!data) return { ok: false, motivo: 'dados', message: MENSAGENS.dados };
    return { ok: true, value: data as OfficialAuditReportInput };
  }

  /**
   * Trilha da exportação. O ator NUNCA é enviado daqui — a RPC o toma de
   * `auth.uid()`. Só o identificador da avaliação, o snapshot conferido pelo
   * servidor, a versão do relatório e o código de integridade.
   */
  async logReportExport(dados: {
    evaluationId: string; snapshotId: string; reportVersion: string; integrityCode: string;
  }): Promise<boolean> {
    const { data, error } = await this.client.rpc('log_official_audit_report_export', {
      p_evaluation_id: dados.evaluationId,
      p_snapshot_id: dados.snapshotId,
      p_report_version: dados.reportVersion,
      p_integrity_code: dados.integrityCode,
    });
    if (error) return false;
    return (data as { logged?: boolean } | null)?.logged === true;
  }
}
