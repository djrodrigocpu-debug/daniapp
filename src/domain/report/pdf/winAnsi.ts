/**
 * WinAnsiEncoding e métricas das fontes-padrão do PDF (AAPEx 1.3.3).
 *
 * POR QUE WINANSI. O relatório precisa de TEXTO PESQUISÁVEL com acentuação
 * portuguesa correta, sem embutir arquivo de fonte. As catorze fontes-padrão
 * do PDF (Helvetica entre elas) estão em todo leitor e, sob `WinAnsiEncoding`,
 * cobrem integralmente o português: á à â ã é ê í ó ô õ ú ü ç e as maiúsculas,
 * mais travessão, reticências e aspas tipográficas. Nada é convertido em
 * imagem, e o leitor consegue buscar e copiar o texto.
 *
 * As larguras vêm das métricas AFM publicadas para Helvetica e Helvetica-Bold,
 * em milésimos de em. São elas que fazem a quebra de linha ser exata — sem
 * medir, um comentário longo estouraria a margem ou seria cortado, que é
 * justamente o que o relatório não pode fazer.
 */

/**
 * Pontos de código Unicode que o WinAnsi coloca na faixa 0x80–0x9F. Fora
 * dessa faixa, WinAnsi coincide com Latin-1, então o próprio ponto de código
 * já é o byte.
 */
const HIGH_RANGE: Record<number, number> = {
  0x20ac: 0x80, // €
  0x201a: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02c6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8a, // Š
  0x2039: 0x8b, // ‹
  0x0152: 0x8c, // Œ
  0x017d: 0x8e, // Ž
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02dc: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9a, // š
  0x203a: 0x9b, // ›
  0x0153: 0x9c, // œ
  0x017e: 0x9e, // ž
  0x0178: 0x9f, // Ÿ
};

/** Substituto para o que WinAnsi não representa. Nunca falha silenciosamente. */
const FALLBACK = 0x3f; // '?'

/**
 * Texto Unicode → bytes WinAnsi. Decompõe o que puder ser decomposto antes de
 * desistir: um caractere acentuado que só exista em forma combinante é
 * recomposto por NFC e cabe no WinAnsi; o que sobrar vira '?'.
 */
export function toWinAnsi(text: string): number[] {
  const normalizado = typeof text.normalize === 'function' ? text.normalize('NFC') : text;
  const out: number[] = [];
  for (const ch of normalizado) {
    const cp = ch.codePointAt(0) ?? FALLBACK;
    if (cp === 0x0a || cp === 0x0d) { out.push(0x20); continue; }
    if (cp < 0x20) { out.push(0x20); continue; }
    if (cp <= 0x7e) { out.push(cp); continue; }
    const alto = HIGH_RANGE[cp];
    if (alto !== undefined) { out.push(alto); continue; }
    if (cp >= 0xa0 && cp <= 0xff) { out.push(cp); continue; }
    out.push(FALLBACK);
  }
  return out;
}

/** Larguras AFM (milésimos de em) indexadas pelo byte WinAnsi. */
function buildWidths(
  ascii: readonly number[],
  high: Readonly<Record<number, number>>,
  latin1: readonly number[],
): Uint16Array {
  const w = new Uint16Array(256);
  for (let i = 0; i < ascii.length; i += 1) w[32 + i] = ascii[i];
  for (const [code, width] of Object.entries(high)) w[Number(code)] = width;
  for (let i = 0; i < latin1.length; i += 1) w[0xa0 + i] = latin1[i];
  return w;
}

// Helvetica — códigos 32..126
const HELV_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELV_HIGH: Record<number, number> = {
  0x80: 556, 0x82: 222, 0x83: 556, 0x84: 333, 0x85: 1000, 0x86: 556, 0x87: 556,
  0x88: 333, 0x89: 1000, 0x8a: 667, 0x8b: 333, 0x8c: 1000, 0x8e: 611, 0x91: 222,
  0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x98: 333,
  0x99: 1000, 0x9a: 500, 0x9b: 333, 0x9c: 944, 0x9e: 500, 0x9f: 667,
};
// Helvetica — códigos 160..255
const HELV_LATIN1 = [
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
];

// Helvetica-Bold — códigos 32..126
const BOLD_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const BOLD_HIGH: Record<number, number> = {
  0x80: 556, 0x82: 278, 0x83: 556, 0x84: 500, 0x85: 1000, 0x86: 556, 0x87: 556,
  0x88: 333, 0x89: 1000, 0x8a: 667, 0x8b: 333, 0x8c: 1000, 0x8e: 611, 0x91: 278,
  0x92: 278, 0x93: 500, 0x94: 500, 0x95: 350, 0x96: 556, 0x97: 1000, 0x98: 333,
  0x99: 1000, 0x9a: 556, 0x9b: 333, 0x9c: 889, 0x9e: 500, 0x9f: 667,
};
// Helvetica-Bold — códigos 160..255
const BOLD_LATIN1 = [
  278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
  611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
];

export const HELVETICA_WIDTHS = buildWidths(HELV_ASCII, HELV_HIGH, HELV_LATIN1);
export const HELVETICA_BOLD_WIDTHS = buildWidths(BOLD_ASCII, BOLD_HIGH, BOLD_LATIN1);

export type PdfFont = 'regular' | 'bold';

/** Largura do texto em pontos, para a fonte e o corpo informados. */
export function measureText(text: string, font: PdfFont, size: number): number {
  const widths = font === 'bold' ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  let total = 0;
  for (const byte of toWinAnsi(text)) {
    // Byte sem métrica conhecida cai na largura do espaço — conservador, e
    // nunca zero, que faria a linha estourar a margem sem aviso.
    total += widths[byte] || widths[0x20];
  }
  return (total * size) / 1000;
}
