/**
 * Leitura de planilha em qualquer das duas orientações usadas pelo canal —
 * base comum dos importadores de Parceiros AACE e de Usuários.
 *
 *   - TRANSPOSTA: coluna A com os rótulos, um registro por coluna;
 *   - TABULAR:    linha 1 com os rótulos, um registro por linha.
 *
 * A orientação é decidida por quantos rótulos CONHECIDOS aparecem na coluna A
 * contra a linha 1; empate favorece a transposta (formato histórico do app).
 * Rótulo desconhecido, duplicado ou obrigatório ausente é erro GLOBAL e nenhum
 * registro é interpretado (emenda E9) — planilha estranha nunca é adivinhada.
 */
import { collapseSpaces, labelKey } from '../partners/normalize';

export type SheetLayout = 'transposed' | 'tabular';

export interface SheetFieldSpec<F extends string> {
  field: F;
  /** Prefixos de rótulo já normalizados com labelKey. */
  prefixes: string[];
  label: string;
  /** false ⇒ o rótulo pode faltar na planilha (derivado ou resolvido depois). */
  required: boolean;
}

export interface SheetIssue<F extends string = string> {
  /** Posição 1-based do registro na planilha; null quando o erro é global. */
  column: number | null;
  field?: F;
  message: string;
}

export interface SheetReader<F extends string> {
  layout: SheetLayout;
  /** Índices internos das faixas com dados, na ordem da planilha. */
  records: number[];
  /** true quando o rótulo do campo existe na planilha. */
  has(field: F): boolean;
  /** Valor bruto do campo naquele registro ('' se o rótulo não existe). */
  value(field: F, record: number): string;
  /** Referência 1-based na planilha: coluna C=3 (transposta) ou linha 3 (tabular). */
  sheetRef(record: number): number;
  /** 'coluna' | 'linha', para compor mensagens na orientação certa. */
  unit: string;
}

export interface ReadSheetResult<F extends string> {
  layout: SheetLayout;
  reader: SheetReader<F> | null;
  issues: SheetIssue<F>[];
}

/** Mínimo de rótulos reconhecidos para afirmar a orientação. */
const MIN_LABELS = 3;

function columnAt(grid: string[][], index: number): string[] {
  return grid.map((row) => row?.[index] ?? '');
}

function specForLabel<F extends string>(specs: SheetFieldSpec<F>[], label: string): SheetFieldSpec<F> | undefined {
  const key = labelKey(label);
  if (key === '') return undefined;
  return specs.find((spec) => spec.prefixes.some((prefix) => key.startsWith(prefix)));
}

/** Rótulo casa algum prefixo já normalizado com labelKey. */
function matchesPrefix(prefixes: string[] | undefined, label: string): boolean {
  if (!prefixes || prefixes.length === 0) return false;
  const key = labelKey(label);
  if (key === '') return false;
  return prefixes.some((prefix) => key.startsWith(prefix));
}

function countLabels<F extends string>(specs: SheetFieldSpec<F>[], cells: string[]): number {
  const seen = new Set<F>();
  for (const cell of cells) {
    const spec = specForLabel(specs, cell ?? '');
    if (spec) seen.add(spec.field);
  }
  return seen.size;
}

export function detectSheetLayout<F extends string>(grid: string[][], specs: SheetFieldSpec<F>[]): SheetLayout | null {
  const inColumnA = countLabels(specs, columnAt(grid, 0));
  const inRow1 = countLabels(specs, grid[0] ?? []);
  if (inColumnA < MIN_LABELS && inRow1 < MIN_LABELS) return null;
  return inColumnA >= inRow1 ? 'transposed' : 'tabular';
}

/**
 * Mapeia os rótulos e enumera os registros. `reader` vem null sempre que
 * houver qualquer issue global — o chamador não deve tentar ler nada.
 */
export function readSheet<F extends string>(
  grid: string[][],
  specs: SheetFieldSpec<F>[],
  options: { maxRecords: number; unknownLabelHint: string; ignoredPrefixes?: string[] },
): ReadSheetResult<F> {
  const layout = detectSheetLayout(grid, specs);
  if (layout === null) {
    return {
      layout: 'tabular',
      reader: null,
      issues: [{
        column: null,
        message:
          `${options.unknownLabelHint} Não foram encontrados rótulos conhecidos nem na coluna A `
          + '(formato transposto) nem na linha 1 (formato tabela).',
      }],
    };
  }

  const maxCols = Math.max(0, ...grid.map((row) => row.length));
  const labels = layout === 'transposed' ? columnAt(grid, 0) : (grid[0] ?? []);
  const recordCount = layout === 'transposed' ? maxCols : grid.length;
  const cellAt = layout === 'transposed'
    ? (labelIndex: number, record: number) => grid[labelIndex]?.[record] ?? ''
    : (labelIndex: number, record: number) => grid[record]?.[labelIndex] ?? '';
  const unit = layout === 'transposed' ? 'coluna' : 'linha';
  const crossUnit = layout === 'transposed' ? 'linha' : 'coluna';

  const issues: SheetIssue<F>[] = [];
  const indexOfField = new Map<F, number>();

  // 1) Rótulo de cada faixa. Faixa totalmente vazia é ignorada.
  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i] ?? '';
    let hasData = false;
    for (let r = 1; r < recordCount && !hasData; r += 1) {
      if (collapseSpaces(cellAt(i, r) ?? '') !== '') hasData = true;
    }
    if (collapseSpaces(label) === '' && !hasData) continue;

    // Coluna RECONHECIDA mas deliberadamente não lida. A recusa estrita (E9)
    // existe para não adivinhar planilha estranha, mas a planilha real do canal
    // traz colunas auxiliares — perfil em texto humano ao lado do código
    // canônico, marcações de controle — que não são desconhecidas: são
    // conhecidas e irrelevantes. Sem esta lista, ou a importação inteira é
    // recusada, ou duas colunas disputam o mesmo campo.
    if (matchesPrefix(options.ignoredPrefixes, label)) continue;

    const spec = specForLabel(specs, label);
    if (!spec) {
      issues.push({
        column: null,
        message: `Rótulo desconhecido na ${crossUnit} ${i + 1}: "${collapseSpaces(label) || '(vazio)'}" — a planilha não está no formato esperado`,
      });
      continue;
    }
    if (indexOfField.has(spec.field)) {
      issues.push({ column: null, message: `Rótulo duplicado na planilha: ${spec.label}` });
      continue;
    }
    indexOfField.set(spec.field, i);
  }

  for (const spec of specs) {
    if (spec.required && !indexOfField.has(spec.field)) {
      const where = layout === 'transposed' ? 'na coluna A' : 'na linha 1';
      issues.push({ column: null, message: `Rótulo obrigatório ausente ${where}: ${spec.label}` });
    }
  }

  if (issues.length > 0) return { layout, reader: null, issues };

  // 2) Registros (faixas 1..N): ignora os totalmente vazios.
  const records: number[] = [];
  for (let r = 1; r < recordCount; r += 1) {
    const hasValue = [...indexOfField.values()].some((i) => collapseSpaces(cellAt(i, r) ?? '') !== '');
    if (hasValue) records.push(r);
  }

  if (records.length === 0) {
    return {
      layout,
      reader: null,
      issues: [{ column: null, message: `Nenhum registro encontrado nas ${unit}s de dados` }],
    };
  }
  if (records.length > options.maxRecords) {
    return {
      layout,
      reader: null,
      issues: [{
        column: null,
        message: `A planilha tem ${records.length} registros — o limite por importação é ${options.maxRecords}`,
      }],
    };
  }

  return {
    layout,
    issues: [],
    reader: {
      layout,
      records,
      unit,
      has: (field) => indexOfField.has(field),
      value: (field, record) => {
        const i = indexOfField.get(field);
        return i === undefined ? '' : cellAt(i, record) ?? '';
      },
      sheetRef: (record) => record + 1,
    },
  };
}
