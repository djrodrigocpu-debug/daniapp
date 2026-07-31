/**
 * Escritor de PDF mínimo e real (AAPEx 1.3.3).
 *
 * POR QUE ESCREVER, EM VEZ DE INSTALAR. As duas saídas usuais não servem:
 * `expo-print` renderiza HTML e, no web, cai em `window.print()` — que é
 * impressão do navegador, expressamente descartada; e uma biblioteca completa
 * de PDF entra com centenas de kilobytes no bundle para desenhar um documento
 * de texto corrido. O que este relatório precisa é pequeno e bem definido:
 * páginas A4, dois pesos de Helvetica, linhas, retângulos e texto — tudo o que
 * cabe em um gerador próprio, síncrono, idêntico nas três plataformas e sem
 * dependência nenhuma.
 *
 * O resultado é PDF de verdade: assinatura `%PDF-1.4`, tabela de referência
 * cruzada válida, texto como operadores `Tj` (portanto pesquisável, copiável e
 * indexável) e nada rasterizado.
 *
 * Este módulo é PURO: só produz bytes. Não sabe o que é uma auditoria, não fala
 * com o banco e não entrega arquivo a lugar nenhum.
 */
import { measureText, toWinAnsi, type PdfFont } from './winAnsi';

/** A4 em pontos tipográficos (72 dpi): 210 × 297 mm. */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

export interface RGB { r: number; g: number; b: number }

interface TextOp {
  kind: 'text';
  x: number; y: number; text: string; font: PdfFont; size: number; color: RGB;
}
interface LineOp {
  kind: 'line';
  x1: number; y1: number; x2: number; y2: number; width: number; color: RGB;
}
interface RectOp {
  kind: 'rect';
  x: number; y: number; w: number; h: number; color: RGB;
}
type DrawOp = TextOp | LineOp | RectOp;

const BLACK: RGB = { r: 0, g: 0, b: 0 };

/** Número no formato do PDF: ponto decimal, sem notação científica. */
function num(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(2);
  return fixed.replace(/\.?0+$/, '') || '0';
}

/**
 * Literal de string do PDF. Parênteses e barra invertida são delimitadores e
 * têm que ser escapados; todo byte acima de 126 sai em octal, o que mantém o
 * arquivo em ASCII puro e imune a qualquer reinterpretação de codificação no
 * caminho até o disco.
 */
function pdfString(text: string): string {
  let out = '(';
  for (const byte of toWinAnsi(text)) {
    if (byte === 0x28) out += '\\(';
    else if (byte === 0x29) out += '\\)';
    else if (byte === 0x5c) out += '\\\\';
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(byte);
  }
  return `${out})`;
}

/**
 * String de TEXTO do PDF, para o dicionário `Info`.
 *
 * Não pode usar `pdfString`: dentro de um fluxo de conteúdo os bytes são lidos
 * pela codificação da FONTE (WinAnsi, declarada no objeto de fonte), mas em
 * `Info` não há fonte nenhuma — o leitor interpreta como PDFDocEncoding, e o
 * travessão 0x97 do WinAnsi vira "Š" na aba do visualizador e nas propriedades
 * do arquivo. UTF-16BE com marca de ordem de bytes é a forma prevista pela
 * especificação para texto fora de fluxo, e cobre qualquer caractere.
 */
function pdfTextString(text: string): string {
  let out = '\\376\\377'; // BOM UTF-16BE (FE FF)
  const emitir = (byte: number) => {
    out += `\\${byte.toString(8).padStart(3, '0')}`;
  };
  for (const ch of String(text ?? '')) {
    let cp = ch.codePointAt(0) ?? 0x3f;
    if (cp > 0xffff) {
      cp -= 0x10000;
      const alto = 0xd800 + (cp >> 10);
      const baixo = 0xdc00 + (cp & 0x3ff);
      emitir(alto >> 8); emitir(alto & 0xff);
      emitir(baixo >> 8); emitir(baixo & 0xff);
      continue;
    }
    emitir(cp >> 8); emitir(cp & 0xff);
  }
  return `(${out})`;
}

class PdfPage {
  readonly ops: DrawOp[] = [];
}

export class PdfDocument {
  private readonly pages: PdfPage[] = [];
  private current: PdfPage | null = null;

  /** Título e autor do documento — vão ao dicionário Info. */
  constructor(private readonly meta: { title: string; author: string; subject: string; creator: string }) {}

  get pageCount(): number { return this.pages.length; }

  addPage(): void {
    this.current = new PdfPage();
    this.pages.push(this.current);
  }

  private page(): PdfPage {
    if (!this.current) this.addPage();
    return this.current as PdfPage;
  }

  /**
   * Aponta o cursor de desenho para uma página já criada. Existe por causa do
   * rodapé: "página X de Y" só pode ser escrito quando Y é conhecido, ou seja,
   * depois que todo o conteúdo já foi paginado.
   */
  selectPage(index: number): void {
    const page = this.pages[index];
    if (!page) throw new Error(`página ${index} inexistente`);
    this.current = page;
  }

  /**
   * Desenha uma linha de texto com a origem no canto superior esquerdo — que é
   * como se pensa uma página, e não como o PDF a numera (origem embaixo). A
   * conversão fica aqui, uma vez, em vez de espalhada por quem desenha.
   */
  text(x: number, yFromTop: number, value: string, opts: { font?: PdfFont; size?: number; color?: RGB } = {}): void {
    const { font = 'regular', size = 10, color = BLACK } = opts;
    if (!value) return;
    this.page().ops.push({ kind: 'text', x, y: A4_HEIGHT - yFromTop, text: value, font, size, color });
  }

  line(x1: number, yFromTop1: number, x2: number, yFromTop2: number, opts: { width?: number; color?: RGB } = {}): void {
    const { width = 0.5, color = { r: 0.82, g: 0.83, b: 0.85 } } = opts;
    this.page().ops.push({
      kind: 'line', x1, y1: A4_HEIGHT - yFromTop1, x2, y2: A4_HEIGHT - yFromTop2, width, color,
    });
  }

  /** Retângulo preenchido, medido a partir do topo. */
  rect(x: number, yFromTop: number, w: number, h: number, color: RGB): void {
    this.page().ops.push({ kind: 'rect', x, y: A4_HEIGHT - yFromTop - h, w, h, color });
  }

  private contentStream(page: PdfPage): string {
    const parts: string[] = [];
    let lastFill: string | null = null;

    for (const op of page.ops) {
      const fill = `${num(op.color.r)} ${num(op.color.g)} ${num(op.color.b)}`;
      if (op.kind === 'rect') {
        parts.push(`${fill} rg`, `${num(op.x)} ${num(op.y)} ${num(op.w)} ${num(op.h)} re f`);
        lastFill = null;
        continue;
      }
      if (op.kind === 'line') {
        parts.push(
          `${fill} RG`, `${num(op.width)} w`,
          `${num(op.x1)} ${num(op.y1)} m ${num(op.x2)} ${num(op.y2)} l S`,
        );
        continue;
      }
      if (fill !== lastFill) { parts.push(`${fill} rg`); lastFill = fill; }
      parts.push(
        'BT',
        `/${op.font === 'bold' ? 'F2' : 'F1'} ${num(op.size)} Tf`,
        `${num(op.x)} ${num(op.y)} Td`,
        `${pdfString(op.text)} Tj`,
        'ET',
      );
    }
    return parts.join('\n');
  }

  /**
   * Serializa o arquivo. Objetos numerados em sequência, `xref` construída a
   * partir dos deslocamentos reais de cada objeto — é isso que faz o arquivo
   * abrir em leitor comum, e não só em visualizador tolerante.
   */
  build(): Uint8Array {
    if (this.pages.length === 0) this.addPage();

    const bytes: number[] = [];
    const push = (text: string) => { for (let i = 0; i < text.length; i += 1) bytes.push(text.charCodeAt(i) & 0xff); };

    // Cabeçalho + comentário binário: sinaliza a leitores e a servidores que o
    // arquivo não é texto e não deve sofrer conversão de fim de linha.
    push('%PDF-1.4\n');
    bytes.push(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a);

    const n = this.pages.length;
    // 1 catálogo · 2 páginas · 3..(2+n) páginas · (3+n)..(2+2n) conteúdos
    // (3+2n) fonte regular · (4+2n) fonte negrito · (5+2n) info
    const idCatalog = 1;
    const idPages = 2;
    const idPage = (i: number) => 3 + i;
    const idContent = (i: number) => 3 + n + i;
    const idFontRegular = 3 + 2 * n;
    const idFontBold = 4 + 2 * n;
    const idInfo = 5 + 2 * n;
    const total = idInfo;

    const offsets: number[] = new Array(total + 1).fill(0);
    const obj = (id: number, body: string) => {
      offsets[id] = bytes.length;
      push(`${id} 0 obj\n${body}\nendobj\n`);
    };

    obj(idCatalog, `<< /Type /Catalog /Pages ${idPages} 0 R >>`);

    const kids = this.pages.map((_, i) => `${idPage(i)} 0 R`).join(' ');
    obj(idPages, `<< /Type /Pages /Count ${n} /Kids [${kids}] >>`);

    this.pages.forEach((_, i) => {
      obj(idPage(i),
        `<< /Type /Page /Parent ${idPages} 0 R ` +
        `/MediaBox [0 0 ${num(A4_WIDTH)} ${num(A4_HEIGHT)}] ` +
        `/Resources << /Font << /F1 ${idFontRegular} 0 R /F2 ${idFontBold} 0 R >> >> ` +
        `/Contents ${idContent(i)} 0 R >>`);
    });

    this.pages.forEach((page, i) => {
      const stream = this.contentStream(page);
      // O comprimento é o de BYTES; o fluxo é ASCII por construção (o literal
      // de string escapa tudo acima de 126), então tamanho e comprimento
      // coincidem.
      offsets[idContent(i)] = bytes.length;
      push(`${idContent(i)} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
    });

    obj(idFontRegular,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(idFontBold,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(idInfo,
      `<< /Title ${pdfTextString(this.meta.title)} /Author ${pdfTextString(this.meta.author)} ` +
      `/Subject ${pdfTextString(this.meta.subject)} /Creator ${pdfTextString(this.meta.creator)} ` +
      `/Producer ${pdfTextString(this.meta.creator)} >>`);

    const xrefStart = bytes.length;
    push(`xref\n0 ${total + 1}\n`);
    push('0000000000 65535 f \n');
    for (let id = 1; id <= total; id += 1) {
      push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    }
    push(`trailer\n<< /Size ${total + 1} /Root ${idCatalog} 0 R /Info ${idInfo} 0 R >>\n`);
    push(`startxref\n${xrefStart}\n%%EOF\n`);

    return Uint8Array.from(bytes);
  }
}

/**
 * Quebra o texto em linhas que CABEM na largura, medindo de verdade. Palavra
 * mais longa que a linha inteira (uma URL, um código) é partida por caractere
 * em vez de estourar a margem — nada é cortado nem some.
 */
export function wrapText(text: string, font: PdfFont, size: number, maxWidth: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of String(text ?? '').split('\n')) {
    if (paragrafo.trim() === '') { linhas.push(''); continue; }
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (measureText(tentativa, font, size) <= maxWidth) { atual = tentativa; continue; }
      if (atual) { linhas.push(atual); atual = ''; }
      if (measureText(palavra, font, size) <= maxWidth) { atual = palavra; continue; }
      // Palavra sozinha maior que a linha: parte por caractere.
      let pedaco = '';
      for (const ch of palavra) {
        if (measureText(pedaco + ch, font, size) > maxWidth && pedaco) {
          linhas.push(pedaco);
          pedaco = ch;
        } else {
          pedaco += ch;
        }
      }
      atual = pedaco;
    }
    if (atual) linhas.push(atual);
  }
  // Um texto que só tinha espaços não gera linha nenhuma.
  return linhas.length === 1 && linhas[0] === '' ? [] : linhas;
}

/** Trunca com reticências — só para rótulos curtos de tabela, nunca para conteúdo. */
export function ellipsize(text: string, font: PdfFont, size: number, maxWidth: number): string {
  if (measureText(text, font, size) <= maxWidth) return text;
  let out = '';
  for (const ch of text) {
    if (measureText(`${out}${ch}…`, font, size) > maxWidth) break;
    out += ch;
  }
  return `${out}…`;
}
