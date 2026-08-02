/**
 * Contratos de domínio da EXPORTAÇÃO (AAPEx 1.3.5, decisão D9).
 *
 * Espelham a migration 0049. A coisa mais importante aqui é o **tipo da
 * coluna**, e ele não é estética:
 *
 *   * o XLSX escreve número como número, data como data e booleano como
 *     booleano (D9) porque sabe o tipo;
 *   * a neutralização de CSV injection se aplica **somente** a `text`. Sem o
 *     tipo, prefixar todo campo iniciado por `-` corromperia todo número
 *     negativo real — que é justamente o que D9 proíbe.
 *
 * O arquivo NUNCA amplia o que o servidor devolveu. Quem recorta é a RPC; o
 * escritor só transcreve.
 */

/** Os quatro módulos de D9. Nenhum a mais é aceito pelo servidor. */
export type ExportModule = 'assisted' | 'monthly_audit' | 'plans' | 'summary';

export const EXPORT_MODULES: ExportModule[] = ['assisted', 'monthly_audit', 'plans', 'summary'];

export const EXPORT_MODULE_LABEL: Record<ExportModule, string> = {
  assisted: 'Gestão Assistida',
  monthly_audit: 'Auditoria Mensal',
  plans: 'Planos',
  summary: 'Resumo',
};

/** As abas do XLSX, EXATAS e NESTA ORDEM (D9). */
export const XLSX_SHEETS = [
  'Gestao_Assistida', 'Auditoria_Mensal', 'Planos', 'Resumo', 'Filtros_Aplicados',
] as const;

export type ColumnType = 'text' | 'number' | 'date' | 'boolean';

export interface ExportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export type ExportValue = string | number | boolean | null;
export type ExportRow = Record<string, ExportValue>;

/**
 * O bloco agregado da aba Resumo — **contrato DEFINITIVO da decisão A-06**,
 * congelada em 02/08/2026 (ADR-135-004 §5).
 *
 * Doze itens, e nada além. O que ficou de FORA é tão contratual quanto o que
 * ficou dentro: ranking, meta empresarial inventada, semáforo executivo novo,
 * projeção financeira, KPI não aprovado, fórmula adicional e comparação fora do
 * escopo do ator.
 *
 * A proibição de RANKING não é estética. O Resumo é recortado no servidor por
 * `app.dashboard_operations`; posição relativa dentro de um conjunto que o ator
 * não enxerga inteiro **revela o tamanho** do conjunto oculto.
 */
export interface ExportSummaryBlock {
  label: string;
  /** 1 · o recorte temporal. `null` em qualquer das pontas significa "sem limite". */
  period: { from: string | null; to: string | null };
  /** 2 · os filtros como o SERVIDOR os resolveu, não como foram pedidos. */
  appliedFilters: Record<string, unknown>;
  /** 3 · parceiros abrangidos. */
  partners: number;
  /** 4 · cobertura da Gestão Assistida. */
  assistedCoverage: { partnersWithData: number; partners: number };
  /** 5 · cobertura da Auditoria Mensal. */
  monthlyAuditCoverage: { partnersWithData: number; partnersApproved: number; partners: number };
  /** 6 · eixo de desempenho, pela MESMA função que alimenta a Matriz. */
  performanceAxis: Record<string, unknown>;
  /** 7 · eixo de processo, por CONTAGEM de respostas — nunca por média de médias. */
  processAxis: Record<string, unknown>;
  /** 8 · planos por estado. */
  plansByStatus: Record<string, number>;
  /** 9 · suficiência dos dados. */
  dataSufficiency: {
    partnersSufficient: number;
    partnersInsufficient: number;
    performanceSufficient: boolean;
  };
  /** 10 · a ponderação utilizada, uma entrada por região alcançada. */
  weighting: Array<{ regionId: string; weighting: Record<string, unknown> }>;
  /** 11 · índice consolidado — quantos parceiros o têm, e quantos não. */
  consolidatedIndex: { partnersWithIndex: number; partnersWithout: number; note: string };
  /** 12 · as versões das regras que produziram cada número acima. */
  ruleVersions: Record<string, unknown>;
}

export interface ExportDataset {
  contractVersion: string;
  module: ExportModule;
  generatedAt: string;
  today: string;
  /** Nome de EXIBIÇÃO do solicitante — nunca identificador nem e-mail. */
  requestedBy: string;
  scope: { operationCount: number };
  filters: Record<string, unknown>;
  ruleProvenance: Record<string, unknown>;
  columns: ExportColumn[];
  rowCount: number;
  rows: ExportRow[];
  summary?: ExportSummaryBlock;
}

export type ExportFormat = 'csv' | 'xlsx';
