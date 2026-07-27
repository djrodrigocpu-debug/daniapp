import { describe, it, expect } from 'vitest';
import { indicatorStatus, achievement } from './indicatorStatus';

describe('indicatorStatus', () => {
  it('higher_better: atinge meta = verde', () => {
    expect(indicatorStatus({ direction: 'higher_better', target: 100, yellowTolerance: 15, actual: 100 })).toBe('green');
  });
  it('higher_better: dentro da tolerância = amarelo', () => {
    expect(indicatorStatus({ direction: 'higher_better', target: 100, yellowTolerance: 15, actual: 90 })).toBe('yellow');
  });
  it('higher_better: abaixo da tolerância = vermelho', () => {
    expect(indicatorStatus({ direction: 'higher_better', target: 100, yellowTolerance: 15, actual: 80 })).toBe('red');
  });
  it('lower_better: churn abaixo da meta = verde', () => {
    expect(indicatorStatus({ direction: 'lower_better', target: 1, yellowTolerance: 20, actual: 0.8 })).toBe('green');
  });
  it('lower_better: acima da tolerância = vermelho', () => {
    expect(indicatorStatus({ direction: 'lower_better', target: 1, yellowTolerance: 20, actual: 1.5 })).toBe('red');
  });
});

describe('achievement', () => {
  it('higher_better proporcional, limitado a 150', () => {
    expect(achievement({ direction: 'higher_better', target: 100, yellowTolerance: 10, actual: 50 })).toBe(50);
    expect(achievement({ direction: 'higher_better', target: 100, yellowTolerance: 10, actual: 300 })).toBe(150);
  });
  it('lower_better inverte a razão', () => {
    expect(achievement({ direction: 'lower_better', target: 1, yellowTolerance: 10, actual: 2 })).toBe(50);
  });
});
