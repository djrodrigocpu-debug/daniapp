/**
 * Fila outbox de operações offline (Masterplan §12.3; Anexo D — T08, T22, T24).
 *
 * Modelada como estado imutável (funções puras) para ser testável e persistível.
 * A deduplicação por `idempotencyKey` garante que dois toques (double submit)
 * gerem UMA única operação pendente.
 */
export type OutboxStatus = 'pending' | 'processed' | 'failed' | 'conflict';

export interface OutboxEntry {
  id: string;
  idempotencyKey: string;
  kind: string;
  payload: unknown;
  expectedRowVersion: number | null;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  lastError?: string;
}

export type Outbox = OutboxEntry[];

export interface EnqueueInput {
  id: string;
  idempotencyKey: string;
  kind: string;
  payload: unknown;
  expectedRowVersion?: number | null;
  createdAt: string;
}

export interface EnqueueResult {
  outbox: Outbox;
  entry: OutboxEntry;
  deduped: boolean;
}

/**
 * Enfileira uma operação. Se já existir uma entrada NÃO finalizada com a mesma
 * `idempotencyKey`, retorna a existente (deduped=true) sem criar duplicata (T08).
 */
export function enqueue(outbox: Outbox, input: EnqueueInput): EnqueueResult {
  const existing = outbox.find(
    (e) => e.idempotencyKey === input.idempotencyKey && (e.status === 'pending' || e.status === 'processed'),
  );
  if (existing) {
    return { outbox, entry: existing, deduped: true };
  }
  const entry: OutboxEntry = {
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    payload: input.payload,
    expectedRowVersion: input.expectedRowVersion ?? null,
    status: 'pending',
    attempts: 0,
    createdAt: input.createdAt,
  };
  return { outbox: [...outbox, entry], entry, deduped: false };
}

export function pending(outbox: Outbox): OutboxEntry[] {
  return outbox.filter((e) => e.status === 'pending');
}

function update(outbox: Outbox, id: string, patch: Partial<OutboxEntry>): Outbox {
  return outbox.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

export function markProcessed(outbox: Outbox, id: string): Outbox {
  return update(outbox, id, { status: 'processed' });
}

export function markFailed(outbox: Outbox, id: string, error: string): Outbox {
  return outbox.map((e) => (e.id === id ? { ...e, status: 'failed', attempts: e.attempts + 1, lastError: error } : e));
}

export function markConflict(outbox: Outbox, id: string, error: string): Outbox {
  return update(outbox, id, { status: 'conflict', lastError: error });
}

export function markRetry(outbox: Outbox, id: string, error: string): Outbox {
  return outbox.map((e) => (e.id === id ? { ...e, attempts: e.attempts + 1, lastError: error } : e));
}
