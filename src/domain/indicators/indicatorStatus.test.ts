import { describe, it, expect } from 'vitest';
import { indicatorStatus, achievement } from './indicatorStatus';
import { calculateIndicatorStatus } from '../../data/performance';
import { IndicatorDefinition, IndicatorResult } from '../../types';

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
  it('lower_better: dentro da tolerância = amarelo', () => {
    expect(indicatorStatus({ direction: 'lower_better', target: 10, yellowTolerance: 15, actual: 11 })).toBe('yellow');
  });

  it('limites EXATOS: higher_better', () => {
    // meta exata é verde; o limite exato da tolerância ainda é amarelo; um
    // centésimo abaixo dele é vermelho.
    expect(indicatorStatus({ direction: 'higher_better', target: 100, yellowTolerance: 15, actual: 85 })).toBe('yellow');
    expect(indicatorStatus({ direction: 'higher_better', target: 100, yellowTolerance: 15, actual: 84.99 })).toBe('red');
    expect(indicatorStatus({ direction: 'higher_better', target: 100, yellowTolerance: 15, actual: 99.99 })).toBe('yellow');
  });

  it('limites EXATOS: lower_better', () => {
    expect(indicatorStatus({ direction: 'lower_better', target: 10, yellowTolerance: 15, actual: 10 })).toBe('green');
    expect(indicatorStatus({ direction: 'lower_better', target: 10, yellowTolerance: 15, actual: 11.5 })).toBe('yellow');
    expect(indicatorStatus({ direction: 'lower_better', target: 10, yellowTolerance: 15, actual: 11.51 })).toBe('red');
  });

  it('decimais: churn 0,95 contra meta 1,0 com tolerância 20 é verde; 1,15 amarelo; 1,25 vermelho', () => {
    expect(indicatorStatus({ direction: 'lower_better', target: 1, yellowTolerance: 20, actual: 0.95 })).toBe('green');
    expect(indicatorStatus({ direction: 'lower_better', target: 1, yellowTolerance: 20, actual: 1.15 })).toBe('yellow');
    expect(indicatorStatus({ direction: 'lower_better', target: 1, yellowTolerance: 20, actual: 1.25 })).toBe('red');
  });
});

/**
 * A Gestão Assistida usa `calculateIndicatorStatus` (src/data/performance) —
 * a MESMA regra canônica duplicada para o formato definição+resultado. Este
 * bloco trava a concordância entre as duas implementações, inclusive nos
 * limites exatos e em decimais.
 */
describe('calculateIndicatorStatus concorda com a regra canônica', () => {
  const def = (direction: IndicatorDefinition['direction'], yellowTolerance: number): IndicatorDefinition => ({
    id: '00000000-0000-0000-0000-0000000097d1', title: 'Indicador sintetico', unit: 'R$',
    direction, defaultTarget: 0, yellowTolerance, weight: 1, diagnosticOptions: [],
  });
  const res = (target: number, actual: number): IndicatorResult => ({
    id: '00000000-0000-0000-0000-0000000097d2', operationId: '00000000-0000-0000-0000-0000000097d3',
    indicatorId: '00000000-0000-0000-0000-0000000097d1', period: '2099-01',
    target, actual, previousActual: 0, updatedAt: '2099-01-01T00:00:00.000Z',
  });

  const cases: Array<{ direction: IndicatorDefinition['direction']; tolerance: number; target: number; actual: number }> = [
    { direction: 'higher_better', tolerance: 15, target: 100, actual: 100 },
    { direction: 'higher_better', tolerance: 15, target: 100, actual: 85 },
    { direction: 'higher_better', tolerance: 15, target: 100, actual: 84.99 },
    { direction: 'lower_better', tolerance: 15, target: 10, actual: 10 },
    { direction: 'lower_better', tolerance: 15, target: 10, actual: 11.5 },
    { direction: 'lower_better', tolerance: 15, target: 10, actual: 11.51 },
    { direction: 'lower_better', tolerance: 20, target: 1, actual: 1.15 },
  ];

  it.each(cases)('%j', ({ direction, tolerance, target, actual }) => {
    expect(calculateIndicatorStatus(def(direction, tolerance), res(target, actual)))
      .toBe(indicatorStatus({ direction, target, yellowTolerance: tolerance, actual }));
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
