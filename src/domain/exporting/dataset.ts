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

/** O bloco agregado da aba Resumo. **Técnico e provisório — A-06 aberta.** */
export interface ExportSummaryBlock {
  label: string;
  a06: string;
  partners: number;
  partnersWithAssisted: number;
  partnersWithMonthlyAudit: number;
  plansByStatus: Record<string, number>;
  plansOverdue: number;
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
