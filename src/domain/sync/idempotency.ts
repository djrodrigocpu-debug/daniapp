/**
 * Chaves de idempotência para mutações offline (Masterplan §12.3; Anexo D — T08, T24).
 *
 * A chave é determinística a partir do tipo de operação, do objeto e do conteúdo:
 * dois toques idênticos produzem a MESMA chave e, portanto, são deduplicados
 * (uma única submissão). Não usa aleatoriedade — reprodutível no cliente.
 */

/** Hash estável FNV-1a (32-bit) em hexadecimal. Suficiente para deduplicação. */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Serialização canônica (chaves ordenadas) para hash determinístico. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

/**
 * Gera a chave de idempotência de uma operação. `entityId` fixa o objeto; o hash
 * do payload garante que reenvios do mesmo conteúdo não dupliquem, mas conteúdos
 * diferentes gerem chaves diferentes.
 */
export function makeIdempotencyKey(kind: string, entityId: string, payload: unknown): string {
  return `${kind}:${entityId}:${stableHash(canonicalize(payload))}`;
}
