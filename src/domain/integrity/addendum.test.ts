import { describe, it, expect } from 'vitest';
import { assertMutable, createAddendum } from './addendum';
import { Evaluation } from '../model';

function evaluation(status: Evaluation['status']): Evaluation {
  return {
    id: 'e1', operationId: 'op-A', visitId: 'v1', templateVersionId: 'tv1', authorUserId: 'u1',
    status, score: 82, answers: [], rowVersion: 3,
    submittedAt: '2026-07-05T00:00:00Z', approvedAt: '2026-07-06T00:00:00Z',
    createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-06T00:00:00Z',
  };
}

describe('assertMutable (T07)', () => {
  it('avaliação aprovada é imutável', () => {
    const r = assertMutable(evaluation('approved'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('integrity/immutable-record');
      expect(r.error.severity).toBe('critical');
    }
  });
  it('rascunho é editável', () => {
    expect(assertMutable(evaluation('draft')).ok).toBe(true);
  });
  it('devolvida é editável', () => {
    expect(assertMutable(evaluation('returned')).ok).toBe(true);
  });
});

describe('createAddendum (§11.4)', () => {
  it('supersede o original (não apaga) e cria adendo rascunho', () => {
    const r = createAddendum({
      original: evaluation('approved'),
      authorUserId: 'u2',
      reason: 'Correção do valor medido do churn.',
      now: '2026-07-10T00:00:00Z',
      newEvaluationId: 'e2',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.supersededOriginal.status).toBe('superseded');
      expect(r.value.supersededOriginal.id).toBe('e1'); // original preservado
      expect(r.value.addendum.id).toBe('e2');
      expect(r.value.addendum.status).toBe('draft');
      expect(r.value.addendum.authorUserId).toBe('u2');
      expect(r.value.addendum.rowVersion).toBe(1);
    }
  });

  it('exige motivo', () => {
    const r = createAddendum({
      original: evaluation('approved'), authorUserId: 'u2', reason: '', now: 'now', newEvaluationId: 'e2',
    });
    expect(r.ok).toBe(false);
  });

  it('não se aplica a avaliação não aprovada', () => {
    const r = createAddendum({
      original: evaluation('draft'), authorUserId: 'u2', reason: 'algum motivo grande', now: 'now', newEvaluationId: 'e2',
    });
    expect(r.ok).toBe(false);
  });
});
