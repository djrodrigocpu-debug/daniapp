/**
 * A faixa de simulação só pode existir no laboratório. Estes testes cobrem as
 * três exigências do contrato: aparece em modo simulação, NÃO aparece em
 * produção, e não altera o funcionamento do aplicativo.
 */
import { describe, expect, it } from 'vitest';
import {
  abbreviateProjectRef,
  parseSimulationFlag,
  SIMULATION_BANNER_TEXT,
  SIMULATION_PAGE_TITLE,
} from './simulationMode';

describe('modo simulação — a bandeira', () => {
  it('liga SOMENTE com o literal "true"', () => {
    expect(parseSimulationFlag('true')).toBe(true);
    expect(parseSimulationFlag('TRUE')).toBe(true);
    expect(parseSimulationFlag(' true ')).toBe(true);
  });

  it('fica DESLIGADA para qualquer outro valor, inclusive os que parecem verdadeiros', () => {
    // O default precisa ser restritivo: um build de produção que herde uma
    // variável estranha não pode acabar anunciando "dados fictícios", e um
    // valor como "1" ou "yes" não é o contrato declarado.
    for (const v of [undefined, null, '', 'false', '1', 'yes', 'sim', 'True!', 'production']) {
      expect(parseSimulationFlag(v as string | undefined | null)).toBe(false);
    }
  });

  it('desliga quando a variável simplesmente não existe (caso do build de produção)', () => {
    expect(parseSimulationFlag(undefined)).toBe(false);
  });
});

describe('modo simulação — identificação do alvo', () => {
  it('abrevia o Project Ref para não despejar o identificador inteiro na tela', () => {
    expect(abbreviateProjectRef('https://qjvpkaurihjvzktlinhp.supabase.co')).toBe('qjvpkaur…linhp');
  });

  it('devolve null quando não há URL reconhecível', () => {
    expect(abbreviateProjectRef(undefined)).toBeNull();
    expect(abbreviateProjectRef('')).toBeNull();
    expect(abbreviateProjectRef('nao-e-uma-url')).toBeNull();
  });

  it('preserva refs curtos sem elipse', () => {
    expect(abbreviateProjectRef('https://curto.supabase.co')).toBe('curto');
  });
});

describe('modo simulação — o texto exigido pelo contrato', () => {
  it('anuncia simulação, dado fictício e não-produção, literalmente', () => {
    expect(SIMULATION_BANNER_TEXT).toContain('AMBIENTE DE SIMULAÇÃO');
    expect(SIMULATION_BANNER_TEXT).toContain('DADOS FICTÍCIOS');
    expect(SIMULATION_BANNER_TEXT).toContain('NÃO É PRODUÇÃO');
  });

  it('marca o título da página', () => {
    expect(SIMULATION_PAGE_TITLE).toBe('AAPEx 1.3.5 — SIMULAÇÃO');
  });
});
