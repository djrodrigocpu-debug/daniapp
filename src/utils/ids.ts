/** Gerador de id local com prefixo (rascunhos/evidências/planos offline, §17). */
export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
