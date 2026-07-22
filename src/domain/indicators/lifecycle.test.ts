import { describe, it, expect } from 'vitest';
import { assertCanPhysicallyDelete, deactivate, canMeasure, requiresNewVersion, nextVersionNumber } from './lifecycle';
import { IndicatorDefinition, IndicatorVersion } from '../model';

const def: IndicatorDefinition = { id: 'i1', code: 'IND-001', name: 'Churn', lifecycle: 'active', createdAt: 'now' };

describe('assertCanPhysicallyDelete (T05)', () => {
  it('bloqueia delete físico de indicador já usado', () => {
    const r = assertCanPhysicallyDelete(def, 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('integrity/indicator-in-use');
  });
  it('permite delete apenas se nunca medido', () => {
    expect(assertCanPhysicallyDelete(def, 0).ok).toBe(true);
  });
});

describe('deactivate / canMeasure', () => {
  it('inativar preserva o registro, muda lifecycle', () => {
    const d = deactivate(def);
    expect(d.lifecycle).toBe('inactive');
    expect(d.id).toBe(def.id);
  });
  it('indicador inativo não pode ser medido em novas avaliações', () => {
    expect(canMeasure(def)).toBe(true);
    expect(canMeasure(deactivate(def))).toBe(false);
  });
});

describe('requiresNewVersion (§8.1)', () => {
  const base = { unit: '%', direction: 'higher_better' as const, target: 30, yellowTolerance: 10, weight: 5 };
  it('mudança de meta exige nova versão', () => {
    expect(requiresNewVersion(base, { ...base, target: 40 })).toBe(true);
  });
  it('mudança de direção/unidade/peso exige nova versão', () => {
    expect(requiresNewVersion(base, { ...base, direction: 'lower_better' })).toBe(true);
    expect(requiresNewVersion(base, { ...base, unit: 'R$' })).toBe(true);
    expect(requiresNewVersion(base, { ...base, weight: 3 })).toBe(true);
  });
  it('sem mudança substantiva não exige nova versão', () => {
    expect(requiresNewVersion(base, { ...base })).toBe(false);
  });
});

describe('nextVersionNumber', () => {
  it('incrementa a partir do maior existente', () => {
    const versions: IndicatorVersion[] = [
      { id: 'v1', definitionId: 'i1', versionNumber: 1, unit: '%', direction: 'higher_better', target: 30, yellowTolerance: 10, weight: 5, effectiveFrom: 'now' },
      { id: 'v2', definitionId: 'i1', versionNumber: 2, unit: '%', direction: 'higher_better', target: 35, yellowTolerance: 10, weight: 5, effectiveFrom: 'now' },
    ];
    expect(nextVersionNumber(versions)).toBe(3);
    expect(nextVersionNumber([])).toBe(1);
  });
});
