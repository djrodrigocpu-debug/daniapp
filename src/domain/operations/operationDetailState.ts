/**
 * Decide o que a tela de detalhe do Parceiro AACE mostra. Módulo PURO: sem
 * React, sem SDK, sem I/O.
 *
 * POR QUE EXISTE: "não encontrado" e "ainda não sei" são estados diferentes.
 * A tela lia a operação de um cache local nunca populado pelos dados reais em
 * modo corporativo — todo Parceiro AACE carregado pelo servidor "não
 * existia". A regra abaixo é a mesma que corrigiu isso, isolada para ser
 * provada em todas as combinações sem precisar de um renderizador.
 */
export type OperationDetailState = 'loading' | 'error' | 'not_found' | 'found';

export interface OperationDetailInput {
  loading: boolean;
  error: string | null;
  /** Operação encontrada na lista JÁ CARREGADA pelo escopo do usuário. */
  found: boolean;
}

/**
 * Ordem deliberada: carregando e erro de rede/RLS SEMPRE precedem "não
 * encontrado" — só a ausência confirmada numa lista já carregada com sucesso
 * é, de fato, inexistência.
 */
export function decideOperationDetailState(input: OperationDetailInput): OperationDetailState {
  if (input.loading) return 'loading';
  if (input.error) return 'error';
  if (!input.found) return 'not_found';
  return 'found';
}
