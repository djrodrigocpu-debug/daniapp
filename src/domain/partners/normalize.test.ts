/**
 * Paridade das normalizações client-side com app.normalize_text (0009).
 * Os casos com acento/caixa/espaços espelham os asserts do teste de banco
 * (schema.integration.test.ts) — as duas pontas DEVEM concordar.
 */
import { describe, it, expect } from 'vitest';
import { collapseSpaces, isValidEmail, normalizeEmail, normalizeKey, normalizeState } from './normalize';

describe('normalizeKey (paridade com app.normalize_text)', () => {
  it('remove acentos, baixa caixa e colapsa espaços como o SQL', () => {
    expect(normalizeKey('  Ação  Térreo ')).toBe('acao terreo'); // mesmo caso do teste de banco
    expect(normalizeKey('PS - ALIANÇA CURITIBA - 8WT2')).toBe('ps - alianca curitiba - 8wt2');
    expect(normalizeKey('Coordenação')).toBe(normalizeKey('COORDENACAO'));
    expect(normalizeKey('VST AGENCIAMENTO LTDA ')).toBe(normalizeKey('vst  agenciamento ltda'));
  });

  it('detecta escritórios iguais com variação de caixa/acento/espaços', () => {
    const stored = 'PS - ALIANÇA SINTÉTICA - 0007';
    for (const variant of ['ps - alianca sintetica - 0007', ' PS -  Aliança   Sintética - 0007 ']) {
      expect(normalizeKey(variant)).toBe(normalizeKey(stored));
    }
  });
});

describe('normalizações de exibição', () => {
  it('collapseSpaces remove espaço final e colapsa internos PRESERVANDO acentos', () => {
    expect(collapseSpaces('BETA SINTETICA LTDA ')).toBe('BETA SINTETICA LTDA');
    expect(collapseSpaces('  Aliança   Sul  ')).toBe('Aliança Sul');
  });

  it('normalizeEmail baixa caixa e apara', () => {
    expect(normalizeEmail(' Cristiana.Sintetica@Exemplo.Test ')).toBe('cristiana.sintetica@exemplo.test');
  });

  it('normalizeState apara e sobe caixa', () => {
    expect(normalizeState('  pr ')).toBe('PR');
    expect(normalizeState('sc')).toBe('SC');
  });

  it('isValidEmail aceita formato básico e rejeita inválidos/longos', () => {
    expect(isValidEmail('gc@exemplo.test')).toBe(true);
    expect(isValidEmail('sem-arroba.test')).toBe(false);
    expect(isValidEmail('a b@exemplo.test')).toBe(false);
    expect(isValidEmail(`${'x'.repeat(250)}@exemplo.test`)).toBe(false);
  });
});
