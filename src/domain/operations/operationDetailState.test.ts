/**
 * decideOperationDetailState — prova de que "carregando" e "erro de rede"
 * nunca viram "não encontrado" (o bug: um Parceiro AACE recém-carregado pelo
 * servidor aparecia como inexistente na tela de detalhe).
 */
import { describe, it, expect } from 'vitest';
import { decideOperationDetailState } from './operationDetailState';

describe('decideOperationDetailState', () => {
  it('6 — carregando nunca aparece como não encontrado, mesmo com found=false', () => {
    expect(decideOperationDetailState({ loading: true, error: null, found: false })).toBe('loading');
    expect(decideOperationDetailState({ loading: true, error: null, found: true })).toBe('loading');
  });

  it('6 — erro de rede/RLS nunca aparece como não encontrado, mesmo com found=false', () => {
    expect(decideOperationDetailState({ loading: false, error: 'Falha ao carregar operações.', found: false }))
      .toBe('error');
    expect(decideOperationDetailState({ loading: false, error: 'Falha ao carregar operações.', found: true }))
      .toBe('error');
  });

  it('7 — só ausência confirmada numa lista já carregada com sucesso é "não encontrado"', () => {
    expect(decideOperationDetailState({ loading: false, error: null, found: false })).toBe('not_found');
  });

  it('encontrado com lista carregada e sem erro libera o detalhe', () => {
    expect(decideOperationDetailState({ loading: false, error: null, found: true })).toBe('found');
  });

  it('carregando tem precedência sobre erro (estado transitório da requisição anterior)', () => {
    expect(decideOperationDetailState({ loading: true, error: 'erro antigo', found: false })).toBe('loading');
  });
});
