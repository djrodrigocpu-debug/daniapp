/**
 * Contratos de domínio do DASHBOARD e da MATRIZ (AAPEx 1.3.5, decisão D10).
 *
 * Espelham a migration 0048 e nada mais. Como em toda superfície desta versão, o
 * que o servidor calcula aparece aqui como campo de LEITURA: `quadrant`,
 * `weightedIndex`, `score` e os contadores não entram em nenhum tipo de entrada.
 *
 * TRÊS COISAS QUE ESTES TIPOS TORNAM IMPOSSÍVEIS DE ESQUECER:
 *
 *   1. `weightedIndex` é `null` quando não há ponderação publicada OU quando
 *      falta um módulo. Não é zero, não é média, e o tipo não deixa confundir;
 *   2. `quadrant` é `null` quando falta dado, e vem acompanhado dos motivos;
 *   3. `RuleProvenance` viaja em toda resposta, e nomeia a versão EXATA de cada
 *      regra usada. Desde a Fase 10 as duas notas são DEFINITIVAS (A-10 e A-11
 *      congeladas em 02/08/2026); A-04 continua aberta, e é ela — não a
 *      fórmula — que impede o índice quando não há peso publicado.
 */

/** Os oito filtros canônicos de D9/D10. Nenhum a mais é aceito pelo servidor. */
export interface DashboardFilters {
  /** Início do recorte, AAAA-MM-DD. */
  periodFrom?: string;
  /** Fim do recorte, AAAA-MM-DD. */
  periodTo?: string;
  /** Parceiros. Lista VAZIA significa "sem filtro", não "nenhum parceiro". */
  operationIds?: string[];
  channelManagerIds?: string[];
  coordinationIds?: string[];
  themeIds?: string[];
  indicatorIds?: string[];
  modules?: DashboardModule[];
  statuses?: string[];
}

export type DashboardModule = 'assisted' | 'monthly_audit' | 'plans';

/**
 * Os filtros como o SERVIDOR os resolveu. `operationIds` volta preenchido com o
 * que realmente foi alcançado — é por ele que a tela sabe o recorte, e não pelo
 * que pediu.
 */
export interface ResolvedFilters extends DashboardFilters {
  operationIds: string[];
  resolvedOperationCount: number;
}

export interface DashboardCoverage {
  partners: number;
  partnersWithAssisted: number;
  partnersWithMonthlyAudit: number;
}

export interface AssistedStatusCounts {
  conforme: number;
  atencao: number;
  nao_conforme: number;
  sem_dado: number;
}

export interface AssistedIndicatorRow {
  indicatorCode: string;
  indicatorName: string;
  themeCode: string;
  conforme: number;
  atencao: number;
  naoConforme: number;
  semDado: number;
}

export interface AssistedWeekRow {
  weekStartDate: string;
  conforme: number;
  atencao: number;
  naoConforme: number;
  semDado: number;
}

export interface AssistedAggregate {
  cycles: { total: number; closed: number; draft: number };
  entryStatusCounts: AssistedStatusCounts;
  byIndicator: AssistedIndicatorRow[];
  evolution: AssistedWeekRow[];
}

export interface MonthlyAnswerCounts {
  conforme: number;
  nao_conforme: number;
  nao_aplicavel: number;
  nao_avaliado: number;
}

export interface MonthlyCompetenceRow {
  competence: string;
  audits: number;
  conforme: number;
  naoConforme: number;
  naoAplicavel: number;
  naoAvaliado: number;
}

export interface MonthlyAuditAggregate {
  audits: { total: number; draft: number; submitted: number; returned: number; approved: number };
  answerStatusCounts: MonthlyAnswerCounts;
  byCompetence: MonthlyCompetenceRow[];
}

export interface ActionPlanAggregate {
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  /** DERIVADO da data pelo servidor — nunca lido de coluna gravada à mão. */
  overdue: number;
  total: number;
}

/** Uma linha por parceiro — a base da comparação e da evolução. */
export interface PartnerEvolution {
  operationId: string;
  partnerName: string;
  assisted: { conforme: number; atencao: number; naoConforme: number; semDado: number };
  monthlyAudit: { conforme: number; naoConforme: number; naoAplicavel: number; naoAvaliado: number };
  openPlans: number;
}

/**
 * A proveniência das regras. Existe para que nenhum número desta tela possa ser
 * lido sem que a própria resposta diga QUAL versão de regra o produziu.
 *
 * Até a Fase 9 ela servia sobretudo para declarar provisoriedade. Desde a Fase
 * 10 as duas notas são definitivas, e o papel dela passou a ser rastreabilidade:
 * um número exibido hoje precisa poder ser reproduzido amanhã.
 */
export interface RuleProvenance {
  assistedStatusRule: string;
  /** Ex.: `desempenho-ponderado-status/1.3.5`. */
  performanceScoreRule: string;
  performanceProvisional: boolean;
  /** Ex.: `conformidade-simples-processo/1.3.5`. */
  monthlyScoreRule: string;
  monthlyProvisional: boolean;
  weightingRule: string;
  quadrantRule: string;
  trafficLightRule: string;
  /** Pendências empresariais que ainda governam estes números. */
  openDecisions: string[];
}

export interface DashboardAggregates {
  contractVersion: string;
  generatedAt: string;
  today: string;
  filters: ResolvedFilters;
  ruleProvenance: RuleProvenance;
  coverage: DashboardCoverage;
  assisted: AssistedAggregate;
  monthlyAudit: MonthlyAuditAggregate;
  actionPlans: ActionPlanAggregate;
  partners: PartnerEvolution[];
}

// ---------------------------------------------------------------------------
// Matriz
// ---------------------------------------------------------------------------

/** Eixo de DESEMPENHO — Gestão Assistida. Gravidade máxima vence. */
export type PerformanceAxis = 'on_target' | 'attention' | 'critical' | 'no_measurement';

/** Eixo de PROCESSO — Auditoria Mensal, pelo semáforo de 0004. */
/**
 * `no_score` é a Fase 10: a auditoria FOI aprovada, mas nenhum critério era
 * aplicável. Não é `no_audit` (que seria falso) e não é `red` (que seria zero).
 */
export type ProcessAxis =
  'green' | 'yellow' | 'red' | 'not_evaluated' | 'no_audit' | 'no_score';

/** Os quatro quadrantes cruzáveis. O quinto estado é `quadrant = null`. */
export type MatrixQuadrant =
  | 'healthy'
  | 'ineffective_routine'
  | 'result_without_process'
  | 'critical';

/**
 * Por que o dado é insuficiente. Os três primeiros vêm do eixo de desempenho e
 * os dois últimos do eixo de processo — e cada um se resolve de um jeito
 * diferente, que é a razão de não haver um "insuficiente" genérico.
 */
export type SufficiencyReason =
  /** Nenhuma auditoria mensal aprovada no recorte. */
  | 'missing_audit'
  /** Nenhum item da Gestão Assistida no recorte. */
  | 'missing_measurement'
  /** Há itens, mas ao menos um está `sem_dado` — e todo item é obrigatório. */
  | 'incomplete_measurement'
  /** A soma dos pesos materializados não é positiva. */
  | 'weight_sum_not_positive'
  /** A auditoria existe e foi aprovada, mas nenhum critério era aplicável. */
  | 'no_applicable_criteria';

export interface DataSufficiency {
  sufficient: boolean;
  reasons: SufficiencyReason[];
}

export interface MatrixAxes {
  performance: {
    axis: PerformanceAxis;
    /**
     * A-11 DEFINITIVA: média de 100/50/0 ponderada pelo peso materializado.
     * `null` sempre que o eixo é insuficiente — e insuficiente NUNCA é zero.
     */
    score: number | null;
    /** `false` quando falta medição, há `sem_dado`, ou a soma de pesos não é positiva. */
    sufficient: boolean;
    insufficiencyReasons: SufficiencyReason[];
    /** Soma dos pesos materializados que entraram na conta. */
    weightSum: number;
    conforme: number;
    atencao: number;
    naoConforme: number;
    semDado: number;
    /** Identificador versionado da regra que produziu esta nota. */
    rule: string;
  };
  process: {
    axis: ProcessAxis;
    /**
     * A-10 DEFINITIVA: conformes / (conformes + não conformes) × 100, com
     * `nao_aplicavel` fora dos dois lados. `null` quando não há auditoria
     * aprovada OU quando nenhum critério era aplicável.
     */
    score: number | null;
    sufficient: boolean;
    insufficiencyReasons: SufficiencyReason[];
    trafficLight: string;
    auditsConsidered: number;
    rule: string;
  };
}

/**
 * O estado da ponderação da região. `configured: false` é o caso ESPERADO
 * enquanto A-04 estiver aberta — não é falha.
 */
export interface WeightingVersion {
  configured: boolean;
  regionId: string;
  reason?: string;
  id?: string;
  versionNumber?: number;
  assistedWeight?: number;
  auditWeight?: number;
  effectiveFrom?: string;
  publishedAt?: string;
}

/**
 * Só existe com ponderação publicada E OS DOIS EIXOS SUFICIENTES.
 *
 * Deixou de carregar `provisional` na Fase 10: as duas regras foram congeladas,
 * e o que viaja agora é a IDENTIDADE VERSIONADA de cada uma. Um índice sem as
 * duas versões seria um número sem procedência.
 */
export interface WeightedIndexResult {
  value: number;
  assistedComponent: number;
  auditComponent: number;
  weightingVersionId: string;
  performanceRule: string;
  processRule: string;
}

export interface MatrixEntry extends MatrixAxes {
  operationId: string;
  partnerName: string;
  regionId: string;
  quadrant: MatrixQuadrant | null;
  dataSufficiency: DataSufficiency;
  weighting: WeightingVersion;
  weightedIndex: WeightedIndexResult | null;
}

export interface MatrixDataset {
  contractVersion: string;
  generatedAt: string;
  filters: ResolvedFilters;
  ruleProvenance: RuleProvenance;
  quadrantLabels: Record<string, string>;
  entries: MatrixEntry[];
}

// ---------------------------------------------------------------------------
// Ponderação — administração
// ---------------------------------------------------------------------------

export interface RegionWeightingVersion {
  id: string;
  regionId: string;
  versionNumber: number;
  assistedWeight: number;
  auditWeight: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'draft' | 'published';
  createdBy: string | null;
  createdAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
}

export interface RegionWeightingStatus {
  regionId: string;
  regionName: string;
  current: WeightingVersion;
  versions: RegionWeightingVersion[];
}

export interface WeightingStatus {
  contractVersion: string;
  regions: RegionWeightingStatus[];
}

/** O que a interface pode enviar. Note o que NÃO está aqui: versão e status. */
export interface RegionWeightingInput {
  assistedWeight: number;
  auditWeight: number;
  effectiveFrom?: string;
}

/**
 * O escopo efetivo do ator, derivado da resposta do servidor. A tela não o
 * calcula: ela o LÊ.
 */
export interface DashboardScope {
  operationIds: string[];
  partnerCount: number;
}
