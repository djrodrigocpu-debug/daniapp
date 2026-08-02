/**
 * Fixture do Relatório Oficial da Auditoria Mensal — dados **sintéticos**.
 *
 * Espelha o que `get_monthly_audit_report_data` (0051) devolve. Serve ao modelo
 * e ao PDF, e é a razão de os dois poderem ser testados sem banco.
 *
 * Nenhum nome, e-mail ou documento real. A acentuação é deliberada: é ela que
 * prova que o caminho inteiro — canonicalização, WinAnsi e texto pesquisável —
 * preserva o português.
 */
import { MonthlyAuditReportInput } from './monthlyAuditReport';

/** Texto longo o bastante para forçar quebra de linha e paginação. */
export const DIAGNOSTICO_LONGO =
  'A rotina de conferência diária não está implantada: não há registro de execução, não há '
  + 'responsável nomeado e a equipe descreve o procedimento de três maneiras diferentes. '
  + 'A ausência de padrão faz com que o resultado dependa de quem está de plantão, e é isso '
  + 'que precisa ser corrigido antes de qualquer meta ser renegociada. A verificação in loco '
  + 'confirmou que o quadro de acompanhamento estava desatualizado havia mais de seis semanas.';

export function monthlyReportInputFixture(
  over: Partial<MonthlyAuditReportInput> = {},
): MonthlyAuditReportInput {
  return {
    identity: {
      reportFormatVersion: '1.3.5',
      evaluationId: '11111111-2222-3333-4444-555555555555',
      operationId: '66666666-7777-8888-9999-000000000000',
      partnerName: 'Parceiro Exemplo Comunicações Ltda.',
      competence: '2026-07',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      status: 'approved',
      approvedBy: 'Coordenação Exemplo',
      approvedAt: '2026-08-05T13:40:00.000Z',
      snapshotId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    },
    summary: {
      processScore: 66.67,
      sufficient: true,
      insufficiencyReasons: [],
      totalCriteria: 4,
      applicableCriteria: 3,
      conformCount: 2,
      nonConformCount: 1,
      notApplicableCount: 1,
      notEvaluatedCount: 0,
      plansByStatus: { 'Em aberto': 1 },
      ruleVersions: {
        processScoreRule: 'conformidade-simples-processo/1.3.5',
        reportFormatVersion: '1.3.5',
      },
    },
    content: [
      {
        themeCode: 'TEMA-01', themeName: 'Atendimento e relacionamento',
        indicatorCode: 'IND-011', indicatorName: 'Conversão de propostas',
        criterionCode: 'CRIT-011-A',
        question: 'A rotina de acompanhamento diário da conversão está implantada?',
        description: 'Verificar se existe registro diário e responsável nomeado.',
        guidance: 'Solicitar o quadro de acompanhamento das últimas quatro semanas.',
        required: true, evidenceRequired: true, allowsNa: false,
        answer: 'conforme', justification: '', observation: 'Quadro atualizado e afixado.',
        diagnosis: '',
        evidences: [
          { name: 'quadro-semana-27.jpg', mimeType: 'image/jpeg', sizeBytes: 184320 },
          { name: 'ata-reuniao.pdf', mimeType: 'application/pdf', sizeBytes: 51200 },
        ],
        plans: [],
      },
      {
        themeCode: 'TEMA-01', themeName: 'Atendimento e relacionamento',
        indicatorCode: 'IND-011', indicatorName: 'Conversão de propostas',
        criterionCode: 'CRIT-011-B',
        question: 'A conferência diária é executada e registrada?',
        description: 'Verificar execução, não apenas existência do procedimento.',
        guidance: 'Confrontar o registro com a operação observada.',
        required: true, evidenceRequired: false, allowsNa: false,
        answer: 'nao_conforme', justification: '',
        observation: 'Equipe descreve o procedimento de três formas.',
        diagnosis: DIAGNOSTICO_LONGO,
        evidences: [],
        plans: [
          {
            action: 'Implantar a conferência diária com responsável nomeado e registro em quadro',
            owner: 'Responsável Exemplo', dueDate: '2026-09-30',
            priority: 'high', status: 'Em aberto',
          },
        ],
      },
      {
        themeCode: 'TEMA-02', themeName: 'Processos internos',
        indicatorCode: 'IND-021', indicatorName: 'Prazo de retorno',
        criterionCode: 'CRIT-021-A',
        question: 'O prazo de retorno é medido e divulgado à equipe?',
        description: '', guidance: 'Verificar painel de divulgação.',
        required: true, evidenceRequired: false, allowsNa: true,
        answer: 'conforme', justification: '', observation: '', diagnosis: '',
        evidences: [],
        plans: [],
      },
      {
        themeCode: 'TEMA-02', themeName: 'Processos internos',
        indicatorCode: 'IND-021', indicatorName: 'Prazo de retorno',
        criterionCode: 'CRIT-021-B',
        question: 'A escala de plantão cobre o horário estendido?',
        description: '', guidance: '',
        required: true, evidenceRequired: false, allowsNa: true,
        answer: 'nao_aplicavel',
        justification: 'O parceiro não opera em horário estendido nesta praça.',
        observation: '', diagnosis: '',
        evidences: [],
        plans: [],
      },
    ],
    integrity: {
      formatVersion: '1.3.5',
      ruleVersion: 'conformidade-simples-processo/1.3.5',
      canonicalization: 'linha-por-fato/1.3.5',
      ordering: 'tema,indicador,ordem,criterio',
    },
    generatedAt: '2026-09-02T10:15:30.000Z',
    ...over,
  };
}

/** A auditoria em que NENHUM critério era aplicável — nota ausente, jamais zero. */
export function monthlyReportInsufficientFixture(): MonthlyAuditReportInput {
  const base = monthlyReportInputFixture();
  return {
    ...base,
    summary: {
      ...base.summary,
      processScore: null,
      sufficient: false,
      insufficiencyReasons: ['no_applicable_criteria'],
      totalCriteria: 2, applicableCriteria: 0,
      conformCount: 0, nonConformCount: 0, notApplicableCount: 2, notEvaluatedCount: 0,
      plansByStatus: {},
    },
    content: base.content
      .filter((c) => c.themeCode === 'TEMA-02')
      .map((c) => ({
        ...c, answer: 'nao_aplicavel',
        justification: 'Não se aplica a este parceiro.',
        diagnosis: '', plans: [], evidences: [],
      })),
  };
}
