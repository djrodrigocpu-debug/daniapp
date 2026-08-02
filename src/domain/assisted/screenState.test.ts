/**
 * Estados obrigatórios da tela da Gestão Assistida (escopo desta fase §25).
 *
 * O motivo de existirem: cada um deles pede uma frase diferente para o
 * operador. "Sem permissão para este parceiro", "a região ainda não configurou
 * indicador nenhum" e "a rede caiu" são três coisas distintas, e colapsá-las num
 * "erro inesperado" transforma um problema resolvível em chamado de suporte.
 *
 * Dados 100% sintéticos (§23).
 */
import { describe, it, expect } from 'vitest';
import { decideAssistedScreenState, isAuthorizationRefusal, isUnavailable } from './screenState';
import { AssistedCycle } from './types';
import { ASSISTED_UNAVAILABLE_MESSAGE } from '../../data/repositories/AssistedRepository';

const cycle = (over: Partial<AssistedCycle> = {}): AssistedCycle => ({
  id: 'c-1',
  operationId: 'op-1',
  partnerName: 'Parceiro Fictício',
  weekStartDate: '2026-07-27',
  weekEndDate: '2026-08-02',
  status: 'draft',
  authorUserId: 'u-gc',
  closedAt: null,
  closedBy: null,
  ruleVersion: null,
  entries: [],
  ...over,
});

const item = { id: 'e-1' } as unknown as AssistedCycle['entries'][number];

describe('decideAssistedScreenState', () => {
  it('carregando vence tudo', () => {
    expect(decideAssistedScreenState({ loading: true, errorMessage: 'x', cycle: null }).kind).toBe('loading');
  });

  it('semana não aberta é ESTADO, não erro', () => {
    expect(decideAssistedScreenState({ loading: false, errorMessage: null, cycle: null }).kind)
      .toBe('not-opened');
  });

  it('ciclo aberto sem indicador aplicável é distinguido de ciclo em preenchimento', () => {
    expect(decideAssistedScreenState({ loading: false, errorMessage: null, cycle: cycle() }).kind)
      .toBe('no-catalog');
    expect(decideAssistedScreenState({
      loading: false, errorMessage: null, cycle: cycle({ entries: [item] }),
    }).kind).toBe('draft');
  });

  it('ciclo fechado é somente leitura', () => {
    expect(decideAssistedScreenState({
      loading: false, errorMessage: null, cycle: cycle({ status: 'closed', entries: [item] }),
    }).kind).toBe('closed');
  });

  it('recusa de escopo vira "sem permissão", não "erro"', () => {
    const s = decideAssistedScreenState({
      loading: false, errorMessage: 'operacao fora do escopo', cycle: null,
    });
    expect(s.kind).toBe('unauthorized');
  });

  it('recusa de papel também — inclusive quando o ator é administrador', () => {
    const s = decideAssistedScreenState({
      loading: false,
      errorMessage: 'apenas o gerente de canal responsavel executa a Gestao Assistida',
      cycle: null,
    });
    expect(s.kind).toBe('unauthorized');
  });

  it('modo demonstração é indisponibilidade declarada, não falha', () => {
    const s = decideAssistedScreenState({
      loading: false, errorMessage: ASSISTED_UNAVAILABLE_MESSAGE, cycle: null,
    });
    expect(s.kind).toBe('unavailable');
  });

  it('qualquer outra falha cai no estado de erro, que oferece nova tentativa', () => {
    const s = decideAssistedScreenState({
      loading: false, errorMessage: 'TypeError: Failed to fetch', cycle: null,
    });
    expect(s.kind).toBe('error');
  });

  it('a mensagem do servidor é PRESERVADA, nunca substituída por texto genérico', () => {
    const literal = 'fechamento bloqueado: IND-003 apresenta desvio sem plano de acao';
    const s = decideAssistedScreenState({ loading: false, errorMessage: literal, cycle: null });
    expect(s.kind === 'error' && s.message).toBe(literal);
  });
});

describe('classificação das recusas', () => {
  it('reconhece as três frases de autorização das RPCs 0041', () => {
    expect(isAuthorizationRefusal('operacao fora do escopo')).toBe(true);
    expect(isAuthorizationRefusal('ciclo inexistente ou fora do escopo')).toBe(true);
    expect(isAuthorizationRefusal('item inexistente ou fora do escopo')).toBe(true);
    expect(isAuthorizationRefusal('apenas o gerente de canal responsavel executa a Gestao Assistida')).toBe(true);
    expect(isAuthorizationRefusal('autenticacao obrigatoria')).toBe(true);
  });

  it('NÃO confunde recusa de regra empresarial com falta de permissão', () => {
    // Esta é a distinção que importa: quem vê "sem permissão" para de tentar;
    // quem vê "falta o plano" resolve.
    expect(isAuthorizationRefusal('fechamento bloqueado: IND-A apresenta desvio sem plano de acao')).toBe(false);
    expect(isAuthorizationRefusal('ciclo fechado e imutavel')).toBe(false);
    expect(isAuthorizationRefusal('informe o periodo da fonte e a data da consulta junto com o resultado')).toBe(false);
  });

  it('a frase do adapter de demonstração é reconhecida pelo que ela realmente diz', () => {
    expect(isUnavailable(ASSISTED_UNAVAILABLE_MESSAGE)).toBe(true);
    expect(isAuthorizationRefusal(ASSISTED_UNAVAILABLE_MESSAGE)).toBe(false);
  });
});
