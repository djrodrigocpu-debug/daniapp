import { describe, it, expect } from 'vitest';
import { scoreAnswers, completionRate, assertScoreConsistency } from './score';

describe('scoreAnswers (§8.3)', () => {
  it('nota ponderada determinística', () => {
    const s = scoreAnswers([
      { weight: 5, status: 'green' },   // 5
      { weight: 5, status: 'yellow' },  // 2.5
      { weight: 5, status: 'red' },     // 0
    ]);
    // earned 7.5 / possible 15 = 50
    expect(s).toBe(50);
  });

  it('not_applicable é excluído do denominador', () => {
    const s = scoreAnswers([
      { weight: 5, status: 'green' },
      { weight: 5, status: 'not_applicable' },
    ]);
    expect(s).toBe(100);
  });

  it('not_evaluated conta no denominador (penaliza incompleto)', () => {
    const s = scoreAnswers([
      { weight: 5, status: 'green' },
      { weight: 5, status: 'not_evaluated' },
    ]);
    expect(s).toBe(50);
  });

  it('tudo não aplicável ⇒ 0', () => {
    expect(scoreAnswers([{ weight: 5, status: 'not_applicable' }])).toBe(0);
  });

  it('é determinística: mesma entrada, mesma saída', () => {
    const items = [{ weight: 3, status: 'green' as const }, { weight: 2, status: 'yellow' as const }];
    expect(scoreAnswers(items)).toBe(scoreAnswers(items));
  });
});

describe('completionRate', () => {
  it('percentual de avaliados', () => {
    expect(completionRate(['green', 'red', 'not_evaluated', 'not_evaluated'])).toBe(50);
  });
});

describe('assertScoreConsistency (T15)', () => {
  const items = [{ weight: 5, status: 'green' as const }, { weight: 5, status: 'red' as const }]; // 50
  it('aprova quando cliente = servidor', () => {
    const r = assertScoreConsistency(50, items);
    expect(r.ok).toBe(true);
  });
  it('bloqueia quando cliente diverge do servidor', () => {
    const r = assertScoreConsistency(99, items);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation/score-divergence');
      expect(r.error.severity).toBe('critical');
    }
  });
});
