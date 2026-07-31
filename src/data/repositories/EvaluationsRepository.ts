/**
 * Contrato do repositório de Visitas/Auditorias/Avaliações (Masterplan §6, §7.4).
 *
 * No modelo da UI, a "visita/auditoria" de um ciclo é a própria `Evaluation`
 * (respostas por item, diagnóstico na observação, ciclo em cycleLabel/frequency).
 * As telas consomem via `EvaluationsProvider` — nunca o AppContext como banco.
 *
 * Adapters: `LocalEvaluationsRepository` (REAL LOCAL) e
 * `SupabaseEvaluationsRepository` (REAL REMOTO, pronto para conexão).
 */
import { ActionPlan, AssessmentAnswer, Evaluation, Evidence, Frequency } from '../../types';
import { Result } from '../../domain/errors/result';
import type { ResultadoDosDados } from '../../domain/report/exportarRelatorioOficial';

export type EvidenceInput = Omit<Evidence, 'id' | 'themeId' | 'createdAt'>;
export type ActionPlanInput = Omit<ActionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export interface EvaluationsRepository {
  /**
   * Avaliações visíveis ao solicitante — UMA consulta, não uma por tela.
   *
   * Existe porque os lookups síncronos do provider (`getEvaluation`,
   * `listByOperation`, `getCurrentDraft`) liam do `localStore` de demonstração
   * mesmo em modo corporativo: avaliação criada no servidor voltava como
   * "não encontrada" e o histórico vinha sempre vazio. Carregar a lista uma
   * vez mantém a API síncrona das telas sem N+1.
   */
  listVisible(): Promise<Result<Evaluation[]>>;
  /**
   * Metadados das evidências visíveis — UMA consulta, indexável por id.
   *
   * Existe pela mesma razão de `listVisible`: `ui_evaluations` entrega apenas
   * os `evidenceIds` de cada resposta, e o lookup de metadados (nome, tipo,
   * status) lia o store local de demonstração — evidência real gravada pelo
   * servidor aparecia como inexistente. No modo corporativo a fonte é a
   * projeção `ui_evidences` (0019), sob a RLS de `evidence_files`.
   */
  listVisibleEvidences(): Promise<Result<Evidence[]>>;
  getById(id: string): Promise<Result<Evaluation | null>>;
  listByOperation(operationId: string): Promise<Result<Evaluation[]>>;
  /** Rascunho/devolvida em aberto para a operação (idempotência de ciclo). */
  getCurrentDraft(operationId: string): Promise<Result<Evaluation | null>>;
  /** Abre (ou reaproveita) a auditoria do ciclo — não duplica em retry. */
  startEvaluation(operationId: string, frequency: Frequency, evaluatorId: string): Promise<Result<Evaluation>>;
  /** Salva resposta de um item e recalcula a nota projetada (rascunho). */
  saveAnswer(evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>): Promise<Result<Evaluation>>;
  addEvidence(evaluationId: string, themeId: string, input: EvidenceInput): Promise<Result<Evidence>>;
  removeEvidence(evaluationId: string, evidenceId: string): Promise<Result<true>>;
  saveActionPlan(input: ActionPlanInput): Promise<Result<ActionPlan>>;
  listActionPlans(evaluationId: string): Promise<Result<ActionPlan[]>>;
  /** Envia para validação aplicando as travas (completo/evidência/plano vermelho). */
  submit(evaluationId: string): Promise<Result<Evaluation>>;

  /**
   * Dados autorizados do Relatório Oficial de Auditoria (RPC 0035).
   *
   * Devolve a CAUSA da recusa, não só a mensagem: "ainda não validada",
   * "sem snapshot" e "fora do escopo" levam o usuário a ações diferentes, e a
   * tela precisa distingui-las sem interpretar texto de servidor.
   */
  getOfficialReportData(evaluationId: string): Promise<ResultadoDosDados>;

  /**
   * Registra na trilha a exportação que já foi entregue ao usuário. Devolve
   * `false` quando não registrou — nunca lança: a falha do registro não pode
   * desfazer um download que já aconteceu.
   */
  logReportExport(dados: {
    evaluationId: string; snapshotId: string; reportVersion: string; integrityCode: string;
  }): Promise<boolean>;
}
