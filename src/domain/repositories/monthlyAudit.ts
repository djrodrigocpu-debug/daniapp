/**
 * Contrato do repositório da AUDITORIA MENSAL por competência (AAPEx 1.3.5, D4).
 *
 * Fica no domínio, separado das implementações, pelo mesmo motivo do catálogo e
 * da Gestão Assistida: modelo puro · interface · adapter Supabase · adapter
 * honesto de demonstração.
 *
 * Toda operação devolve `Result` — recusa de regra e recusa de autorização são
 * VALORES, não exceções.
 */
import { Result } from '../errors/result';
import { MonthlyAuditReportInput } from '../report/monthlyAuditReport';
import {
  CriterionAnswerPatch,
  MaterializedCriterion,
  MonthlyAudit,
  MonthlyAuditSnapshot,
  MonthlyAuditSummary,
  MonthlyPlanInput,
} from '../monthlyAudit/types';

/** Arquivo escolhido pelo operador, antes de virar evidência. */
export interface MonthlyEvidenceUpload {
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** URI local do arquivo, para o adapter subir ao bucket. */
  uri: string;
}

export interface MonthlyAuditRepository {
  /**
   * Cria ou recupera a auditoria da competência. IDEMPOTENTE no servidor: a
   * mesma competência devolve a mesma auditoria, nunca uma segunda.
   *
   * `competence` é `AAAA-MM` e vem POR PARÂMETRO — é isto que torna competência
   * passada registrável pelo caminho oficial.
   */
  startAudit(operationId: string, competence: string): Promise<Result<MonthlyAudit>>;

  /**
   * A auditoria da competência, ou `null` quando ela ainda não foi iniciada.
   * `null` é estado legítimo da tela, não falha.
   */
  getAudit(operationId: string, competence: string): Promise<Result<MonthlyAudit | null>>;

  /** Competências do parceiro, da mais recente para a mais antiga. */
  listAudits(operationId: string, limit?: number): Promise<Result<MonthlyAuditSummary[]>>;

  /**
   * Grava a resposta a um critério. O status da AUDITORIA e o score não entram
   * no patch: quem os calcula é o servidor.
   */
  saveAnswer(answerId: string, patch: CriterionAnswerPatch): Promise<Result<MaterializedCriterion>>;

  /**
   * Anexa evidência pelo fluxo oficial: reserva → upload → confirmação. O
   * critério é identificado pelo seu CÓDIGO dentro da auditoria.
   */
  attachEvidence(
    evaluationId: string,
    criterionCode: string,
    file: MonthlyEvidenceUpload,
  ): Promise<Result<void>>;

  removeEvidence(evaluationId: string, evidenceId: string): Promise<Result<void>>;

  /**
   * Cria ou edita um plano da não conformidade NO MOTOR ÚNICO, vinculado à
   * resposta concreta. N:1 — uma não conformidade pode ter mais de um plano.
   */
  savePlan(
    operationId: string,
    evaluationId: string,
    answerId: string,
    input: MonthlyPlanInput,
  ): Promise<Result<void>>;

  /**
   * Envia para validação. O servidor recusa se houver critério obrigatório sem
   * resposta, evidência ausente, não conformidade sem diagnóstico ou sem plano,
   * plano sem responsável e prazo, ou N/A sem justificativa.
   */
  submitAudit(evaluationId: string): Promise<Result<MonthlyAudit>>;

  /** Aprova ou devolve. Quem pode é decidido pelo servidor, nunca pela tela. */
  validateAudit(
    evaluationId: string,
    decision: 'approved' | 'returned',
    note: string,
  ): Promise<Result<MonthlyAudit>>;

  /**
   * Conteúdo oficial CONGELADO da auditoria aprovada. Não é o estado atual, e
   * não produz PDF — o contrato do novo documento não foi congelado (A-05).
   */
  getSnapshot(evaluationId: string): Promise<Result<MonthlyAuditSnapshot>>;

  /**
   * Os dados do **Relatório Oficial da Auditoria Mensal** (1.3.5, RPC 0051).
   *
   * Só responde por auditoria `monthly_criteria` **aprovada**, e lê SOMENTE o
   * snapshot. É deliberadamente separado de `getSnapshot`: aquele devolve o
   * payload congelado inteiro, para a tela de detalhe; este devolve o CONTRATO
   * do documento, que é o que o PDF assina.
   */
  getReportData(evaluationId: string): Promise<Result<MonthlyAuditReportInput>>;
}
