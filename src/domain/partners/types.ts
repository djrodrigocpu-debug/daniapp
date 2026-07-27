/**
 * Parceiros AACE — tipos do importador de planilha (AAPEx v2).
 *
 * ImportRow é o contrato entre o parser client-side e a RPC
 * public.admin_import_partners (que re-normaliza e re-valida tudo por defesa).
 * ImportReport espelha o jsonb retornado pela RPC (migration 0009).
 */

/** Limite de linhas por lote — o RPC rejeita acima disto (emenda E8). */
export const MAX_IMPORT_ROWS = 200;
/** Limite de tamanho de campos textuais (emenda E8). */
export const MAX_FIELD_LENGTH = 300;
/** Limite de tamanho de e-mails (RFC 5321). */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Estruturas que a planilha do canal não nomeia, preenchidas pelo cliente antes
 * de chamar a RPC (que exige os 10 campos). Ficam visíveis na simulação.
 */
export const DEFAULT_ORGANIZATION_NAME = 'AACE';
export const DEFAULT_REGION_NAME = 'PR/SC';

export interface ImportRow {
  /** Posição 1-based do registro na planilha (coluna/linha de dados). */
  index: number;
  /** Ausente na planilha do canal ⇒ DEFAULT_ORGANIZATION_NAME no envio. */
  organizationName?: string;
  /** Ausente na planilha do canal ⇒ DEFAULT_REGION_NAME no envio. */
  regionName?: string;
  unitName: string;
  coordinationName: string;
  partnerName: string;
  officeName: string;
  city: string;
  state: 'PR' | 'SC';
  /** Ausente ⇒ o repositório resolve o coordenador pela coordenação. */
  coordinatorEmail?: string;
  managerEmail: string;
}

/** Problema encontrado no parse; column=null indica erro global da planilha. */
export interface RowIssue {
  /** Número 1-based da coluna da planilha (B=2...), ou null se global. */
  column: number | null;
  field?: keyof ImportRow;
  message: string;
}

export interface ParseResult {
  /** Somente registros válidos — registros com issues ficam de fora. */
  rows: ImportRow[];
  issues: RowIssue[];
  /** Deduções aplicadas (ex.: Estado inferido da coordenação). Não bloqueiam. */
  warnings: RowIssue[];
  /** Orientação reconhecida na planilha — exibida para o operador conferir. */
  layout: 'transposed' | 'tabular';
}

export type ImportRowStatus = 'ok' | 'duplicate' | 'error';
export type ImportRowAction = 'insert' | 'update' | 'none';

export interface ImportReportRow {
  index: number;
  officeName: string;
  partnerName: string;
  status: ImportRowStatus;
  action: ImportRowAction;
  operationId: string | null;
  messages: string[];
  warnings: string[];
}

export interface ImportReport {
  mode: 'simulate' | 'commit';
  counters: {
    total: number;
    inserted: number;
    updated: number;
    errors: number;
    createdEntities: number;
  };
  toCreate: {
    organizations: string[];
    regions: string[];
    units: string[];
    coordinations: string[];
  };
  rows: ImportReportRow[];
}
