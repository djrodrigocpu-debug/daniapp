import { describe, it, expect } from 'vitest';
import { makeIdempotencyKey, stableHash, canonicalize } from './idempotency';
import { nextDelayMs, isExhausted, MAX_ATTEMPTS } from './backoff';
import { enqueue, pending, Outbox, OutboxEntry } from './outbox';
import { optimisticCheck, isDuplicateEvidence, rejectStaleDraft, resolveLostScope, templateVersionForDraft } from './conflict';
import { flushOnce, Transport } from './syncEngine';

describe('idempotência (T08, T24)', () => {
  it('mesma operação lógica gera a mesma chave', () => {
    const a = makeIdempotencyKey('submit_evaluation', 'e1', { score: 82 });
    const b = makeIdempotencyKey('submit_evaluation', 'e1', { score: 82 });
    expect(a).toBe(b);
  });
  it('conteúdo diferente gera chave diferente', () => {
    const a = makeIdempotencyKey('submit_evaluation', 'e1', { score: 82 });
    const b = makeIdempotencyKey('submit_evaluation', 'e1', { score: 83 });
    expect(a).not.toBe(b);
  });
  it('canonicalize é estável independentemente da ordem das chaves', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
  it('stableHash é determinístico', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
  });
});

describe('outbox — dedup de double submit (T08)', () => {
  it('dois toques idênticos geram UMA pendência', () => {
    const key = makeIdempotencyKey('submit_evaluation', 'e1', { score: 82 });
    let ob: Outbox = [];
    const r1 = enqueue(ob, { id: 'op1', idempotencyKey: key, kind: 'submit_evaluation', payload: { score: 82 }, createdAt: 't1' });
    ob = r1.outbox;
    const r2 = enqueue(ob, { id: 'op2', idempotencyKey: key, kind: 'submit_evaluation', payload: { score: 82 }, createdAt: 't2' });
    ob = r2.outbox;
    expect(r1.deduped).toBe(false);
    expect(r2.deduped).toBe(true);
    expect(pending(ob).length).toBe(1);
  });
});

describe('backoff (T09)', () => {
  it('cresce exponencialmente até o teto', () => {
    expect(nextDelayMs(0, { baseMs: 1000, capMs: 60000 })).toBe(1000);
    expect(nextDelayMs(1, { baseMs: 1000, capMs: 60000 })).toBe(2000);
    expect(nextDelayMs(3, { baseMs: 1000, capMs: 60000 })).toBe(8000);
    expect(nextDelayMs(20, { baseMs: 1000, capMs: 60000 })).toBe(60000);
  });
  it('esgota após MAX_ATTEMPTS', () => {
    expect(isExhausted(MAX_ATTEMPTS)).toBe(true);
    expect(isExhausted(MAX_ATTEMPTS - 1)).toBe(false);
  });
});

describe('conflitos (§12.4)', () => {
  it('optimisticCheck detecta versão obsoleta (T23)', () => {
    expect(optimisticCheck(3, 3).ok).toBe(true);
    const r = optimisticCheck(3, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('sync/conflict');
  });
  it('evidência duplicada por hash é detectada (T24)', () => {
    expect(isDuplicateEvidence(['aaa', 'bbb'], 'aaa')).toBe(true);
    expect(isDuplicateEvidence(['aaa'], 'ccc')).toBe(false);
  });
  it('rejeita rascunho antigo sobre registro submetido', () => {
    expect(rejectStaleDraft('draft').ok).toBe(true);
    expect(rejectStaleDraft('approved').ok).toBe(false);
  });
  it('escopo revogado antes do sync vai para revisão (T11)', () => {
    const r = resolveLostScope(false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('authz/out-of-scope');
  });
  it('rascunho mantém a versão de template de abertura', () => {
    expect(templateVersionForDraft('tv1', 'tv2')).toBe('tv1');
  });
});

describe('syncEngine.flushOnce', () => {
  function entry(id: string, attempts = 0): OutboxEntry {
    return { id, idempotencyKey: `k-${id}`, kind: 'save_draft', payload: {}, expectedRowVersion: null, status: 'pending', attempts, createdAt: 't' };
  }

  it('marca processado no sucesso', async () => {
    const ob: Outbox = [entry('a')];
    const transport: Transport = async () => ({ outcome: 'ok' });
    const r = await flushOnce(ob, transport);
    expect(r.processed).toBe(1);
    expect(pending(r.outbox).length).toBe(0);
  });

  it('mantém pendente em erro transitório (retry) preservando o trabalho', async () => {
    const ob: Outbox = [entry('a')];
    const transport: Transport = async () => ({ outcome: 'retry', error: 'network' });
    const r = await flushOnce(ob, transport);
    expect(r.retried).toBe(1);
    expect(pending(r.outbox).length).toBe(1);
    expect(r.outbox[0].attempts).toBe(1);
  });

  it('marca conflito para revisão explícita', async () => {
    const ob: Outbox = [entry('a')];
    const transport: Transport = async () => ({ outcome: 'conflict', error: 'row_version' });
    const r = await flushOnce(ob, transport);
    expect(r.conflicts).toBe(1);
    expect(r.outbox[0].status).toBe('conflict');
  });

  it('esgota tentativas e marca falha', async () => {
    const ob: Outbox = [entry('a', MAX_ATTEMPTS - 1)];
    const transport: Transport = async () => ({ outcome: 'retry', error: 'network' });
    const r = await flushOnce(ob, transport);
    expect(r.failed).toBe(1);
    expect(r.outbox[0].status).toBe('failed');
  });
});
