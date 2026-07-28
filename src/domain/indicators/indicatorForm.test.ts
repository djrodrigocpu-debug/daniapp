/**
 * Validação pura do cadastro de indicador (Fatia 6C — Bloqueio 2).
 *
 * O cadastro Admin fixava unit='%', direction='higher_better' e
 * yellowTolerance=0, e `Number(x) || default` apagava zeros e engolia NaN.
 * Aqui provamos que o contrato completo é preservado exatamente como digitado.
 */
import { describe, it, expect } from 'vitest';
import {
  INDICATOR_DIRECTIONS,
  INDICATOR_UNITS,
  parseDecimalInput,
  validateIndicatorVersionForm,
} from './indicatorForm';

describe('parseDecimalInput', () => {
  it('aceita decimais com ponto e vírgula', () => {
    expect(parseDecimalInput('12.5')).toBe(12.5);
    expect(parseDecimalInput('12,5')).toBe(12.5);
    expect(parseDecimalInput('-3,25')).toBe(-3.25);
  });

  it('preserva zero — zero é valor, não ausência', () => {
    expect(parseDecimalInput('0')).toBe(0);
    expect(parseDecimalInput('0,0')).toBe(0);
  });

  it('recusa vazio, NaN e lixo — nunca coage para número', () => {
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('   ')).toBeNull();
    expect(parseDecimalInput('NaN')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('1.2.3')).toBeNull();
    expect(parseDecimalInput('10%')).toBeNull();
  });
});

describe('validateIndicatorVersionForm', () => {
  it('unidade NÃO é fixada em % — todas as unidades do contrato passam', () => {
    expect(INDICATOR_UNITS).toContain('R$');
    expect(INDICATOR_UNITS).toContain('x');
    for (const unit of INDICATOR_UNITS) {
      const res = validateIndicatorVersionForm({ unit, direction: 'higher_better', target: '10', yellowTolerance: '5', weight: '1' });
      expect(res.ok && res.value.unit).toBe(unit);
    }
  });

  it('lower_better e higher_better são preservados', () => {
    expect(INDICATOR_DIRECTIONS.map((d) => d.value)).toEqual(['higher_better', 'lower_better']);
    const lower = validateIndicatorVersionForm({ unit: '%', direction: 'lower_better', target: '1', yellowTolerance: '20', weight: '5' });
    expect(lower.ok && lower.value.direction).toBe('lower_better');
    const higher = validateIndicatorVersionForm({ unit: '%', direction: 'higher_better', target: '1', yellowTolerance: '20', weight: '5' });
    expect(higher.ok && higher.value.direction).toBe('higher_better');
  });

  it('meta, tolerância e peso chegam exatamente como digitados (decimais incluídos)', () => {
    const res = validateIndicatorVersionForm({ unit: 'R$', direction: 'higher_better', target: '0,5', yellowTolerance: '12,5', weight: '4' });
    expect(res).toEqual({ ok: true, value: { unit: 'R$', direction: 'higher_better', target: 0.5, yellowTolerance: 12.5, weight: 4 } });
  });

  it('zero válido não é apagado por default oculto', () => {
    const res = validateIndicatorVersionForm({ unit: 'R$', direction: 'higher_better', target: '0', yellowTolerance: '0', weight: '0' });
    expect(res).toEqual({ ok: true, value: { unit: 'R$', direction: 'higher_better', target: 0, yellowTolerance: 0, weight: 0 } });
  });

  it('NaN e campos ausentes são recusados com mensagem clara', () => {
    const semMeta = validateIndicatorVersionForm({ unit: '%', direction: 'higher_better', target: '', yellowTolerance: '0', weight: '1' });
    expect(semMeta.ok).toBe(false);
    const tolInvalida = validateIndicatorVersionForm({ unit: '%', direction: 'higher_better', target: '10', yellowTolerance: 'x', weight: '1' });
    expect(tolInvalida.ok).toBe(false);
    const pesoInvalido = validateIndicatorVersionForm({ unit: '%', direction: 'higher_better', target: '10', yellowTolerance: '0', weight: 'NaN' });
    expect(pesoInvalido.ok).toBe(false);
  });

  it('tolerância e peso negativos são recusados', () => {
    expect(validateIndicatorVersionForm({ unit: '%', direction: 'higher_better', target: '10', yellowTolerance: '-1', weight: '1' }).ok).toBe(false);
    expect(validateIndicatorVersionForm({ unit: '%', direction: 'higher_better', target: '10', yellowTolerance: '0', weight: '-2' }).ok).toBe(false);
  });
});
