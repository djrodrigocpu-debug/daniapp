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
 *   3. `RuleProvenance` viaja em toda resposta, e diz em voz alta que as duas
 *      notas são PROVISÓRIAS (A-10 e A-11).
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
 * lido como homologado sem que a própria resposta diga o contrário.
 */
export interface RuleProvenance {
  assistedStatusRule: string;
  performanceScoreRule: string;
  performanceProvisional: boolean;
  monthlyScoreRule: string;
  monthlyProvisional: boolean;
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
export type ProcessAxis = 'green' | 'yellow' | 'red' | 'not_evaluated' | 'no_audit';

/** Os quatro quadrantes cruzáveis. O quinto estado é `quadrant = null`. */
export type MatrixQuadrant =
  | 'healthy'
  | 'ineffective_routine'
  | 'result_without_process'
  | 'critical';

export type SufficiencyReason = 'missing_audit' | 'missing_measurement';

export interface DataSufficiency {
  sufficient: boolean;
  reasons: SufficiencyReason[];
}

export interface MatrixAxes {
  performance: {
    axis: PerformanceAxis;
    /** PROVISÓRIA — pendência A-11. `null` quando não há item avaliado. */
    score: number | null;
    conforme: number;
    atencao: number;
    naoConforme: number;
    semDado: number;
  };
  process: {
    axis: ProcessAxis;
    /** PROVISÓRIA — pendência A-10. `null` quando não há auditoria aprovada. */
    score: number | null;
    trafficLight: string;
    auditsConsidered: number;
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

/** Só existe com ponderação publicada E os dois módulos presentes. */
export interface WeightedIndexResult {
  value: number;
  assistedComponent: number;
  auditComponent: number;
  weightingVersionId: string;
  provisional: boolean;
  provisionalReason: string;
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
