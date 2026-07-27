/**
 * Normalizações do importador de Parceiros AACE (espelho client-side da
 * função SQL app.normalize_text da migration 0009 — paridade coberta por
 * teste). Exibição preserva acentos; comparação remove.
 */
import { MAX_EMAIL_LENGTH } from './types';

/** Trim + colapso de espaços internos. PRESERVA acentos (nomes exibidos). */
export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** E-mails são comparados/gravados sempre em lowercase. */
export function normalizeEmail(value: string): string {
  return collapseSpaces(value).toLowerCase();
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(value);
}

/** Estado da federação: uppercase (PR/SC validados pelo chamador). */
export function normalizeState(value: string): string {
  return collapseSpaces(value).toUpperCase();
}

/** Marcas combinantes U+0300–U+036F (restos do NFD) — fonte 100% ASCII. */
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

/**
 * Chave de comparação: lowercase, sem acentos, espaços colapsados —
 * equivalente client-side de app.normalize_text (0009). Usada para casar
 * nomes organizacionais e detectar escritórios duplicados antes do envio.
 */
export function normalizeKey(value: string): string {
  return collapseSpaces(value).normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/**
 * Chave de RÓTULO de planilha: normalizeKey + remoção da pontuação que as
 * planilhas do canal usam livremente. Assim "E-mail do GC:", "Email do GC" e
 * "E‑mail / GC" casam o mesmo prefixo, sem afrouxar a comparação de DADOS
 * (nomes de escritório no formato "PS - NOME - CÓDIGO" seguem usando
 * normalizeKey, que preserva hífens e distingue registros parecidos).
 */
export function labelKey(value: string): string {
  // Remove a pontuação SEM criar separador ("e-mail" vira "email"), mas preserva
  // os espaços que já existiam ("parceira / razao" vira "parceira razao").
  return collapseSpaces(normalizeKey(value).replace(/[^a-z0-9\s]+/g, ''));
}
