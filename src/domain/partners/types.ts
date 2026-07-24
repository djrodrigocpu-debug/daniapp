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

export interface ImportRow {
  /** Posição 1-based do registro na planilha (coluna de dados). */
  index: number;
  organizationName: string;
  regionName: string;
  unitName: string;
  coordinationName: string;
  partnerName: string;
  officeName: string;
  city: string;
  state: 'PR' | 'SC';
  coordinatorEmail: string;
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
  /** Somente colunas válidas — colunas com issues ficam de fora. */
  rows: ImportRow[];
  issues: RowIssue[];
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
