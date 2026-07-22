/**
 * Motor de sincronização do outbox (Masterplan §12.3; Anexo D — T09, T22).
 *
 * Processa operações pendentes por meio de um `transport` injetável (o
 * servidor real ou um mock de teste). Retry com backoff, deduplicação por
 * idempotência e classificação de conflito. O trabalho pendente é preservado
 * (nunca descartado silenciosamente).
 */
import { Outbox, OutboxEntry, pending, markProcessed, markConflict, markRetry, markFailed } from './outbox';
import { isExhausted } from './backoff';

export type TransportOutcome =
  | { outcome: 'ok' }
  | { outcome: 'conflict'; error: string }
  | { outcome: 'retry'; error: string }
  | { outcome: 'fatal'; error: string };

export type Transport = (entry: OutboxEntry) => Promise<TransportOutcome>;

export interface FlushSummary {
  outbox: Outbox;
  processed: number;
  conflicts: number;
  retried: number;
  failed: number;
}

/**
 * Tenta enviar todas as operações pendentes uma vez. Não bloqueia em erro
 * transitório: incrementa tentativas e mantém pendente até esgotar (`MAX_ATTEMPTS`),
 * quando marca como falha para intervenção.
 */
export async function flushOnce(outbox: Outbox, transport: Transport): Promise<FlushSummary> {
  let current = outbox;
  let processed = 0;
  let conflicts = 0;
  let retried = 0;
  let failed = 0;

  for (const entry of pending(outbox)) {
    const result = await transport(entry);
    switch (result.outcome) {
      case 'ok':
        current = markProcessed(current, entry.id);
        processed++;
        break;
      case 'conflict':
        current = markConflict(current, entry.id, result.error);
        conflicts++;
        break;
      case 'fatal':
        current = markFailed(current, entry.id, result.error);
        failed++;
        break;
      case 'retry':
        if (isExhausted(entry.attempts + 1)) {
          current = markFailed(current, entry.id, result.error);
          failed++;
        } else {
          current = markRetry(current, entry.id, result.error);
          retried++;
        }
        break;
    }
  }

  return { outbox: current, processed, conflicts, retried, failed };
}
