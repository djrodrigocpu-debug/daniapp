/**
 * Provider de Visitas/Auditorias/Avaliações (Masterplan §6, §7.4). As telas
 * consomem `useEvaluations()` — nunca o AppContext como banco.
 *
 * Leituras reativas vêm do store local (fonte REAL LOCAL); as mutações passam pelo
 * `EvaluationsRepository` selecionado (Local ou Supabase). Assim OperationDetail e
 * Evaluation operam sobre persistência real, com a mesma interface em ambos os modos.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActionPlan, AssessmentAnswer, Evaluation, Evidence, Frequency, Operation, User } from '../types';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { EvidenceInput, ActionPlanInput } from '../data/repositories/EvaluationsRepository';
import { scopeFromUser } from '../data/repositories/OperationsRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';
import { useOperations } from './OperationsProvider';
import { useDirectory } from './DirectoryProvider';
import {
  exportarRelatorioOficial,
  type ResultadoDaExportacao,
} from '../domain/report/exportarRelatorioOficial';
import { renderOfficialAuditReportPdf } from '../domain/report/pdf/renderOfficialAuditReport';
import { entregarPdf } from '../utils/entregarPdf';

export type SubmitResult = { ok: true } | { ok: false; message: string };

interface EvaluationsContextValue {
  /** true enquanto a carga inicial das coleções não terminou. */
  loading: boolean;
  /** Falha ao carregar as AVALIAÇÕES — nunca é apresentada como inexistência. */
  error: string | null;
  getEvaluation: (id: string) => Evaluation | undefined;
  getOperation: (id: string) => Operation | undefined;
  getUser: (id: string) => User | undefined;
  listByOperation: (operationId: string) => Evaluation[];
  getCurrentDraft: (operationId: string) => Evaluation | undefined;
  getActionPlan: (evaluationId: string, themeId: string) => ActionPlan | undefined;
  getEvidences: (ids: string[]) => Evidence[];
  startEvaluation: (operationId: string, frequency: Frequency) => Promise<string | null>;
  saveAnswer: (evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>) => void;
  /** Só resolve depois de o arquivo estar realmente armazenado (D-02). */
  addEvidence: (evaluationId: string, themeId: string, input: EvidenceInput) => Promise<SubmitResult>;
  removeEvidence: (evaluationId: string, evidenceId: string) => Promise<SubmitResult>;
  /**
   * Endereço de leitura da evidência para quem tem acesso (D-03). No modo
   * corporativo é URL assinada de curta duração; no local, a URI do arquivo.
   */
  getEvidenceUrl: (evidenceId: string) => Promise<{ ok: true; url: string } | { ok: false; message: string }>;
  saveActionPlan: (input: ActionPlanInput) => void;
  submit: (evaluationId: string) => Promise<SubmitResult>;
  /**
   * Gera e entrega o Relatório Oficial de Auditoria em PDF (1.3.3). Não
   * recarrega nada: é leitura, e o documento sai do snapshot oficial.
   */
  exportOfficialReport: (evaluationId: string) => Promise<ResultadoDaExportacao>;
}

const EvaluationsContext = createContext<EvaluationsContextValue | undefined>(undefined);

export function EvaluationsProvider({ children }: { children: React.ReactNode }) {
  const { evaluations: repo, actions: actionsRepo, evidence: evidenceRepo, source } = useRepositories();
  const user = useOperationalUser();
  // Operação é entidade REAL, já buscada pela mesma fonte que preenche a
  // lista (§ correção do bug "Parceiro não existente").
  const { operations } = useOperations();
  // Usuário real vem do diretório compartilhado, não do seed local.
  const { getUser } = useDirectory();

  /**
   * Avaliações, planos de ação e evidências visíveis — TRÊS consultas por
   * sessão, uma por coleção, pelo repositório do modo vigente. Antes os
   * lookups liam o localStore de demonstração: em modo corporativo o
   * histórico vinha vazio, uma avaliação criada no servidor voltava como
   * "não encontrada", o guard de rascunho aberto nunca disparava e — última
   * ocorrência da mesma classe — plano de ação e evidência reais gravados
   * pelo servidor apareciam como inexistentes na edição da avaliação.
   */
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [actionPlans, setActionPlans] = useState<ActionPlan[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setEvaluations([]);
      setActionPlans([]);
      setEvidences([]);
      setLoading(false);
      setError(null);
      return;
    }
    // Os planos vêm do MESMO repositório que a aba Ações usa (uma consulta por
    // escopo), e as evidências da projeção do modo vigente — nada por item.
    const [evals, plans, evid] = await Promise.all([
      repo.listVisible(),
      actionsRepo.listByScope(scopeFromUser(user)),
      repo.listVisibleEvidences(),
    ]);
    setEvaluations(evals.ok ? evals.value : []);
    setActionPlans(plans.ok ? plans.value : []);
    setEvidences(evid.ok ? evid.value : []);
    // Erro de rede/RLS nas avaliações NÃO é inexistência: a tela distingue.
    setError(evals.ok ? null : evals.error.message);
    setLoading(false);
  }, [repo, actionsRepo, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reatividade do modo demonstração; em corporativo o refetch é explícito.
  useEffect(() => {
    if (source !== 'local') return undefined;
    return localStore.subscribe(() => void load());
  }, [source, load]);

  const getEvaluation = useCallback((id: string) => evaluations.find((e) => e.id === id), [evaluations]);
  const getOperation = useCallback((id: string) => operations.find((o) => o.id === id), [operations]);
  const listByOperation = useCallback(
    (operationId: string) =>
      evaluations
        .filter((e) => e.operationId === operationId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [evaluations],
  );
  const getCurrentDraft = useCallback(
    (operationId: string) =>
      evaluations.find((e) => e.operationId === operationId && ['draft', 'returned'].includes(e.status)),
    [evaluations],
  );
  const getActionPlan = useCallback(
    (evaluationId: string, themeId: string) =>
      actionPlans.find((p) => p.evaluationId === evaluationId && p.themeId === themeId),
    [actionPlans],
  );
  // Índice por UUID: o lookup por resposta renderizada é O(k) sobre a lista
  // já carregada — nenhuma consulta por item.
  const evidenceById = useMemo(() => new Map(evidences.map((e) => [e.id, e])), [evidences]);
  const getEvidences = useCallback(
    (ids: string[]) => ids.map((id) => evidenceById.get(id)).filter((e): e is Evidence => !!e),
    [evidenceById],
  );

  const startEvaluation = useCallback(
    async (operationId: string, frequency: Frequency) => {
      const res = await repo.startEvaluation(operationId, frequency, user?.id ?? '');
      // Recarrega ANTES de devolver o id: a tela navega em seguida e precisa
      // encontrar a avaliação recém-criada no servidor.
      await load();
      return res.ok ? res.value.id : null;
    },
    [repo, user?.id, load],
  );
  const saveAnswer = useCallback(
    (evaluationId: string, themeId: string, patch: Partial<AssessmentAnswer>) => {
      void repo.saveAnswer(evaluationId, themeId, patch).then(() => load());
    },
    [repo, load],
  );
  // As três mutações recarregam: a tela relê getEvidences/getActionPlan em
  // seguida e precisa encontrar o que o servidor acabou de gravar.
  /**
   * Devolve o resultado em vez de engolir a falha. Antes era disparo e esquece:
   * se o anexo falhava, a tela não dizia nada e o usuário seguia achando que a
   * comprovação estava lá — no modo corporativo nem chegava a subir arquivo
   * (D-02). Sucesso aqui significa arquivo no bucket, metadata e vínculo.
   */
  const addEvidence = useCallback(
    async (evaluationId: string, themeId: string, input: EvidenceInput): Promise<SubmitResult> => {
      const res = await repo.addEvidence(evaluationId, themeId, input);
      await load();
      return res.ok ? { ok: true } : { ok: false, message: res.error.message };
    },
    [repo, load],
  );
  const removeEvidence = useCallback(
    async (evaluationId: string, evidenceId: string): Promise<SubmitResult> => {
      const res = await repo.removeEvidence(evaluationId, evidenceId);
      await load();
      return res.ok ? { ok: true } : { ok: false, message: res.error.message };
    },
    [repo, load],
  );
  /**
   * Não recarrega nada: é leitura. O endereço vem do repositório de evidências,
   * que é quem fala com o Storage — a tela só recebe uma URL pronta e efêmera.
   */
  const getEvidenceUrl = useCallback(
    async (evidenceId: string) => {
      const res = await evidenceRepo.getUrl(evidenceId);
      return res.ok
        ? ({ ok: true, url: res.value } as const)
        : ({ ok: false, message: res.error.message } as const);
    },
    [evidenceRepo],
  );
  const saveActionPlan = useCallback(
    (input: ActionPlanInput) => {
      // Autoria: no modo local o repositório grava o que vem daqui; no modo
      // Supabase o servidor IGNORA este campo e carimba auth.uid() (0025).
      void repo.saveActionPlan({ ...input, createdBy: input.createdBy ?? user?.id }).then(() => load());
    },
    [repo, user?.id, load],
  );
  const submit = useCallback(
    async (evaluationId: string): Promise<SubmitResult> => {
      const res = await repo.submit(evaluationId);
      // O status muda no servidor; sem recarregar, a tela seguiria mostrando
      // a avaliação como rascunho.
      await load();
      return res.ok ? { ok: true } : { ok: false, message: res.error.message };
    },
    [repo, load],
  );
  /**
   * A ORDEM da exportação vive no domínio puro; aqui só se ligam as peças:
   * os dados vêm do repositório do modo vigente, o desenho é o renderizador de
   * PDF e a entrega é a da plataforma. Nada é recarregado — exportar não muda
   * estado nenhum.
   */
  const exportOfficialReport = useCallback(
    (evaluationId: string) => exportarRelatorioOficial({
      obterDados: () => repo.getOfficialReportData(evaluationId),
      agora: () => new Date().toISOString(),
      renderizar: (modelo) => renderOfficialAuditReportPdf(modelo),
      entregar: entregarPdf(),
      registrar: (dados) => repo.logReportExport(dados),
    }),
    [repo],
  );

  const value = useMemo<EvaluationsContextValue>(
    () => ({
      loading,
      error,
      getEvaluation,
      getOperation,
      getUser,
      listByOperation,
      getCurrentDraft,
      getActionPlan,
      getEvidences,
      startEvaluation,
      saveAnswer,
      addEvidence,
      removeEvidence,
      getEvidenceUrl,
      saveActionPlan,
      submit,
      exportOfficialReport,
    }),
    [loading, error, getEvaluation, getOperation, getUser, listByOperation, getCurrentDraft, getActionPlan, getEvidences, startEvaluation, saveAnswer, addEvidence, removeEvidence, getEvidenceUrl, saveActionPlan, submit, exportOfficialReport],
  );

  return <EvaluationsContext.Provider value={value}>{children}</EvaluationsContext.Provider>;
}

export function useEvaluations(): EvaluationsContextValue {
  const ctx = useContext(EvaluationsContext);
  if (!ctx) throw new Error('useEvaluations exige EvaluationsProvider.');
  return ctx;
}
