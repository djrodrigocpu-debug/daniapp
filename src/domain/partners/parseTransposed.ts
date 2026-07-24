/**
 * Parser da planilha TRANSPOSTA de Parceiros AACE (AAPEx v2).
 *
 * Formato esperado (e SOMENTE ele — emenda E9):
 *   - coluna A: rótulos dos 10 campos (um por linha, ordem livre);
 *   - colunas B..: um Parceiro AACE/escritório por coluna.
 * Rótulos são casados por prefixo normalizado (tolera acentos/caixa e textos
 * de ajuda como "Estado: PR ou SC"). Rótulo obrigatório ausente, duplicado ou
 * linha com rótulo desconhecido => erro GLOBAL e nenhuma linha retornada.
 * Colunas totalmente vazias são ignoradas; colunas com problemas viram issues
 * e ficam fora de rows (a RPC re-valida tudo de novo no servidor).
 */
import {
  ImportRow,
  ParseResult,
  RowIssue,
  MAX_FIELD_LENGTH,
  MAX_IMPORT_ROWS,
} from './types';
import { collapseSpaces, isValidEmail, normalizeEmail, normalizeKey, normalizeState } from './normalize';

interface FieldSpec {
  field: keyof Omit<ImportRow, 'index' | 'state'> | 'state';
  /** Prefixo do rótulo já normalizado com normalizeKey. */
  prefix: string;
  label: string;
  kind: 'text' | 'email' | 'state';
}

const FIELDS: FieldSpec[] = [
  { field: 'organizationName', prefix: 'organizacao', label: 'Organização', kind: 'text' },
  { field: 'regionName', prefix: 'regiao', label: 'Região', kind: 'text' },
  { field: 'unitName', prefix: 'unidade', label: 'Unidade', kind: 'text' },
  { field: 'coordinationName', prefix: 'coordenacao', label: 'Coordenação', kind: 'text' },
  { field: 'partnerName', prefix: 'nome do parceiro', label: 'Empresa parceira', kind: 'text' },
  { field: 'officeName', prefix: 'nome do escritorio', label: 'Nome do escritório', kind: 'text' },
  { field: 'city', prefix: 'cidade', label: 'Cidade', kind: 'text' },
  { field: 'state', prefix: 'estado', label: 'Estado', kind: 'state' },
  { field: 'coordinatorEmail', prefix: 'e-mail do coordenador', label: 'E-mail do Coordenador', kind: 'email' },
  { field: 'managerEmail', prefix: 'e-mail do gc', label: 'E-mail do GC', kind: 'email' },
];

export function parsePartnersSheet(grid: string[][]): ParseResult {
  const issues: RowIssue[] = [];

  // 1) Mapeia cada linha da grade para um campo pelo rótulo da coluna A.
  const rowOfField = new Map<FieldSpec['field'], number>();
  for (let r = 0; r < grid.length; r += 1) {
    const label = grid[r]?.[0] ?? '';
    const rest = (grid[r] ?? []).slice(1);
    const isEmptyRow = collapseSpaces(label) === '' && rest.every((v) => collapseSpaces(v ?? '') === '');
    if (isEmptyRow) continue;

    const key = normalizeKey(label);
    const spec = FIELDS.find((f) => key.startsWith(f.prefix));
    if (!spec) {
      issues.push({
        column: null,
        message: `Rótulo desconhecido na linha ${r + 1}: "${collapseSpaces(label) || '(vazio)'}" — a planilha não está no formato esperado`,
      });
      continue;
    }
    if (rowOfField.has(spec.field)) {
      issues.push({ column: null, message: `Rótulo duplicado na planilha: ${spec.label}` });
      continue;
    }
    rowOfField.set(spec.field, r);
  }

  for (const spec of FIELDS) {
    if (!rowOfField.has(spec.field)) {
      issues.push({ column: null, message: `Rótulo obrigatório ausente na coluna A: ${spec.label}` });
    }
  }

  // E9: estrutura incompatível => erro claro e NENHUMA linha interpretada.
  if (issues.length > 0) {
    return { rows: [], issues };
  }

  // 2) Colunas de dados (B..): ignora colunas totalmente vazias.
  const maxCols = Math.max(...grid.map((row) => row.length));
  const dataColumns: number[] = [];
  for (let c = 1; c < maxCols; c += 1) {
    const hasValue = FIELDS.some((spec) => collapseSpaces(grid[rowOfField.get(spec.field)!]?.[c] ?? '') !== '');
    if (hasValue) dataColumns.push(c);
  }

  if (dataColumns.length === 0) {
    return { rows: [], issues: [{ column: null, message: 'Nenhum registro encontrado nas colunas B em diante' }] };
  }
  if (dataColumns.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      issues: [{ column: null, message: `A planilha tem ${dataColumns.length} registros — o limite por importação é ${MAX_IMPORT_ROWS}` }],
    };
  }

  // 3) Valida e monta cada registro; coluna com problema vira issue (fora de rows).
  const rows: ImportRow[] = [];
  dataColumns.forEach((c, position) => {
    const columnIssues: RowIssue[] = [];
    const value = (spec: FieldSpec) => grid[rowOfField.get(spec.field)!]?.[c] ?? '';
    const record: Partial<ImportRow> = { index: position + 1 };

    for (const spec of FIELDS) {
      const raw = value(spec);
      if (spec.kind === 'email') {
        const email = normalizeEmail(raw);
        if (email === '') {
          columnIssues.push({ column: c + 1, field: spec.field, message: `Campo obrigatório ausente: ${spec.label}` });
        } else if (!isValidEmail(email)) {
          columnIssues.push({ column: c + 1, field: spec.field, message: `${spec.label} inválido: ${email}` });
        } else {
          (record as Record<string, unknown>)[spec.field] = email;
        }
      } else if (spec.kind === 'state') {
        const state = normalizeState(raw);
        if (state !== 'PR' && state !== 'SC') {
          columnIssues.push({
            column: c + 1,
            field: spec.field,
            message: `Estado inválido: ${state === '' ? '(vazio)' : state} (esperado PR ou SC)`,
          });
        } else {
          record.state = state;
        }
      } else {
        const text = collapseSpaces(raw);
        if (text === '') {
          columnIssues.push({ column: c + 1, field: spec.field, message: `Campo obrigatório ausente: ${spec.label}` });
        } else if (text.length > MAX_FIELD_LENGTH) {
          columnIssues.push({
            column: c + 1,
            field: spec.field,
            message: `${spec.label} excede o limite de ${MAX_FIELD_LENGTH} caracteres`,
          });
        } else {
          (record as Record<string, unknown>)[spec.field] = text;
        }
      }
    }

    if (columnIssues.length > 0) {
      issues.push(...columnIssues);
    } else {
      rows.push(record as ImportRow);
    }
  });

  return { rows, issues };
}
