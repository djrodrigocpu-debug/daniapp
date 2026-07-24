/**
 * Leitor OOXML mínimo e ESTRITO para o importador de Parceiros AACE.
 *
 * Lê apenas o necessário de um .xlsx (zip + XML): primeira aba do workbook,
 * sharedStrings e células de texto/número. Sem dependência de SheetJS —
 * apenas fflate (unzip) + varredura de tags. Emenda E9: qualquer estrutura
 * fora do esperado (zip inválido, workbook sem aba, aba vazia) gera
 * XlsxParseError com mensagem clara — nunca interpretação silenciosa.
 *
 * Limitações documentadas (suficientes para a planilha DADOS APP):
 * células de fórmula usam o valor cacheado (<v>); datas numéricas não são
 * convertidas (a planilha alvo é 100% texto).
 */
import { unzipSync } from 'fflate';

export class XlsxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XlsxParseError';
  }
}

const decoder = new TextDecoder('utf-8');

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Concatena todos os <t>…</t> de um trecho (cobre rich runs <r><t>). */
function extractText(xml: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out += m[1] !== undefined ? decodeXmlEntities(m[1]) : '';
  }
  return out;
}

/** "A"→0, "B"→1, …, "AA"→26. */
function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(extractText(m[1]));
  return out;
}

function firstSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = files['xl/workbook.xml'];
  if (!workbook) throw new XlsxParseError('Arquivo não é um .xlsx válido: workbook ausente');
  const wbXml = decoder.decode(workbook);
  const sheet = /<sheet\b[^>]*>/.exec(wbXml)?.[0];
  if (!sheet) throw new XlsxParseError('Workbook não contém nenhuma aba');

  const rid = /r:id="([^"]+)"/.exec(sheet)?.[1];
  const relsFile = files['xl/_rels/workbook.xml.rels'];
  if (rid && relsFile) {
    const relsXml = decoder.decode(relsFile);
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`).exec(relsXml)?.[0];
    const target = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : undefined;
    if (target) {
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      if (files[path]) return path;
    }
  }
  if (files['xl/worksheets/sheet1.xml']) return 'xl/worksheets/sheet1.xml';
  throw new XlsxParseError('Planilha da primeira aba não encontrada no arquivo');
}

/**
 * Extrai a primeira aba como grade de strings (grid[linha][coluna], 0-based).
 * Células vazias/ausentes viram ''. Lança XlsxParseError para qualquer
 * estrutura incompatível com um .xlsx real.
 */
export function parseWorkbookGrid(bytes: Uint8Array): string[][] {
  if (!bytes || bytes.length === 0) {
    throw new XlsxParseError('Arquivo vazio');
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new XlsxParseError('Arquivo não é um .xlsx válido (zip corrompido ou formato desconhecido)');
  }

  const sheetXml = decoder.decode(files[firstSheetPath(files)]);
  const shared = parseSharedStrings(
    files['xl/sharedStrings.xml'] ? decoder.decode(files['xl/sharedStrings.xml']) : undefined,
  );

  const grid: string[][] = [];
  let maxCols = 0;
  const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(sheetXml)) !== null) {
    const attrs = m[1] ?? m[2] ?? '';
    const inner = m[3] ?? '';
    const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref) continue; // célula sem referência explícita: fora do formato esperado
    const col = columnIndex(ref[1]);
    const row = parseInt(ref[2], 10) - 1;
    const type = /t="(\w+)"/.exec(attrs)?.[1] ?? 'n';

    let value = '';
    if (type === 'inlineStr') {
      value = extractText(inner);
    } else {
      const raw = /<v[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if (raw !== undefined) {
        value = type === 's'
          ? shared[parseInt(decodeXmlEntities(raw), 10)] ?? ''
          : decodeXmlEntities(raw);
      }
    }

    while (grid.length <= row) grid.push([]);
    grid[row][col] = value;
    if (col + 1 > maxCols) maxCols = col + 1;
  }

  if (grid.length === 0 || maxCols === 0) {
    throw new XlsxParseError('A primeira aba da planilha está vazia');
  }

  // Grade retangular: preenche buracos com ''.
  for (const row of grid) {
    for (let c = 0; c < maxCols; c += 1) if (row[c] === undefined) row[c] = '';
  }
  return grid;
}
