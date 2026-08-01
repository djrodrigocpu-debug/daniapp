/**
 * Entrada sintética do relatório, no formato exato da RPC 0035.
 *
 * Existe para os testes do modelo, do código de integridade e do PDF. Dados
 * inteiramente fictícios — nenhum nome, e-mail ou conteúdo real (§23). Fica
 * fora de `*.test.ts` porque é compartilhada por três arquivos de teste.
 */
import type { OfficialAuditReportInput } from './officialAuditReport';

export const JUSTIFICATIVA_LONGA =
  'O tema não se aplica a esta operação porque a praça não possui carteira de clientes ' +
  'empresariais ativa no período avaliado, conforme conferência da base cadastral realizada ' +
  'em conjunto com a coordenação regional. Não há, portanto, população elegível para a ' +
  'medição prevista no critério, e a exclusão do item do cálculo preserva a comparabilidade ' +
  'da nota entre operações de portes diferentes.';

export const OBSERVACAO_LONGA =
  'Durante a auditoria foram conferidos os relatórios de produção, o funil de oportunidades e ' +
  'a rotina comercial da operação. A equipe demonstra domínio consistente do portfólio e a ' +
  'argumentação técnica em campo evoluiu em relação ao ciclo anterior. A cadência de ' +
  'acompanhamento individual, porém, ainda não está formalizada em agenda protegida, o que ' +
  'compromete a previsibilidade do resultado no fechamento e concentra a conversão na última ' +
  'semana do mês. Recomenda-se instituir a reunião semanal de pipeline com ata e lista de ' +
  'presença, além de registrar o plano individual de cada vendedor com metas parciais.';

interface Ajustes {
  answers?: OfficialAuditReportInput['official']['answers'];
  plans?: OfficialAuditReportInput['current']['actionPlans'];
  score?: number;
  readAt?: string;
}

/** Auditoria semanal fictícia com 16 itens, N/A justificado e comentários longos. */
export function reportInputFixture(ajustes: Ajustes = {}): OfficialAuditReportInput {
  const answers = ajustes.answers ?? defaultAnswers();
  return {
    evaluationId: '3f2a91c4-77bd-4e0a-9c31-0b5d2e7a4f18',
    snapshotId: 'a81c6d20-4e93-4b77-8f05-6c1a9e3b2d44',
    operationId: 'c40b7e15-2a86-4d19-b3f7-8e5c0a2d9147',
    official: {
      partnerName: 'Parceiro Exemplo Comunicações Ltda.',
      officeName: 'Escritório Centro',
      city: 'Curitiba',
      state: 'PR',
      regionName: 'Região Sul',
      unitName: 'Unidade PR Capital',
      coordinationName: 'Coordenação Curitiba Centro',
      period: '2026-07',
      periodStart: '2026-07-06',
      periodEnd: '2026-07-12',
      cycleLabel: 'Semana de 06/07/2026',
      frequency: 'weekly',
      score: ajustes.score ?? 82.5,
      status: 'approved',
      evaluatorName: 'Avaliador Fictício',
      evaluatorRole: 'channel_manager',
      validatorName: 'Validadora Fictícia',
      validatorRole: 'coordinator',
      validatorNote:
        'Auditoria aprovada. A operação sustenta desempenho acima da meta regional em portfólio ' +
        'e convergência, mas segue com não conformidade em cadência comercial. O plano de ação ' +
        'registrado é adequado e deve ser acompanhado semanalmente até o próximo ciclo.',
      startedAt: '2026-07-06T12:00:00.000Z',
      submittedAt: '2026-07-10T18:32:00.000Z',
      validatedAt: '2026-07-12T14:05:00.000Z',
      answers,
      evidenceIndex: [
        { code: 'T02', name: 'Relatorio_producao_julho.pdf', mimeType: 'application/pdf', sizeBytes: 204_800, confirmed: true },
        { code: 'T02', name: 'Funil_oportunidades.png', mimeType: 'image/png', sizeBytes: 88_140, confirmed: true },
        { code: 'T07', name: 'Dashboard_churn.pdf', mimeType: 'application/pdf', sizeBytes: 1_572_864, confirmed: true },
      ],
    },
    current: {
      readAt: ajustes.readAt ?? '2026-09-02T10:15:00.000Z',
      actionPlans: ajustes.plans ?? [
        {
          code: 'T04', action: 'Reinstituir a reunião semanal de pipeline com ata e lista de presença.',
          owner: 'Liderança da operação', dueDate: '2026-08-15', priority: 'high',
          status: 'in_progress', overdue: true, validatorName: null, validatedAt: null,
          updatedAt: '2026-08-20T11:00:00.000Z',
        },
        {
          code: 'T11', action: 'Registrar plano individual de crescimento para os seis vendedores da carteira.',
          owner: 'Coordenação comercial', dueDate: '2026-07-31', priority: 'medium',
          status: 'validated', overdue: false, validatorName: 'Validadora Fictícia',
          validatedAt: '2026-08-05', updatedAt: '2026-08-05T09:40:00.000Z',
        },
      ],
    },
  };
}

/** Os 16 itens semanais do catálogo, com um N/A e dois comentários longos. */
function defaultAnswers(): OfficialAuditReportInput['official']['answers'] {
  const base = [
    ['T02', 'Resultado e portfólio', 'Venda de Soluções Digitais', 5, 'green'],
    ['T03', 'Resultado e portfólio', 'Venda de soluções avançadas', 5, 'green'],
    ['T04', 'Expansão e capilaridade', 'Capilaridade de novos parceiros', 4, 'red'],
    ['T05', 'Execução comercial', 'BCC', 4, 'yellow'],
    ['T06', 'Resultado e portfólio', 'Convergência', 5, 'green'],
    ['T07', 'Qualidade e retenção', 'Churn', 5, 'green'],
    ['T08', 'Qualidade e retenção', 'Percentual de quebra', 5, 'yellow'],
    ['T11', 'Qualidade e retenção', 'Renovação', 5, 'green'],
    ['T14', 'Execução comercial', 'Rotina de campo', 4, 'green'],
    ['T17', 'Pessoas e liderança', 'Clima e engajamento', 3, 'green'],
    ['T18', 'Execução comercial', 'Disciplina de agenda', 3, 'yellow'],
    ['T19', 'Rentabilidade', 'Mix de rentabilidade', 4, 'green'],
    ['T20', 'Qualidade e retenção', 'Pós-venda', 4, 'green'],
    ['T21', 'Execução comercial', 'Prospecção ativa', 4, 'green'],
    ['T22', 'Pessoas e liderança', 'Treinamento contínuo', 3, 'not_applicable'],
    ['T24', 'Resultado e portfólio', 'Cobertura de portfólio', 4, 'green'],
  ] as const;

  return base.map(([code, pillar, title, weight, status]) => ({
    code,
    pillar,
    title,
    weight,
    status,
    measuredValue: status === 'not_applicable' ? '' : `${70 + (code.charCodeAt(2) % 30)}% da meta`,
    observation: status === 'not_applicable' ? ''
      : code === 'T02' || code === 'T04' ? OBSERVACAO_LONGA
        : `Conferência documental do item ${code} realizada em campo com a liderança da operação.`,
    notApplicableReason: status === 'not_applicable' ? JUSTIFICATIVA_LONGA : '',
    evidenceCount: code === 'T02' ? 2 : code === 'T07' ? 1 : 0,
  }));
}
