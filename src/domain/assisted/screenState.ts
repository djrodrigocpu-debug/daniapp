/**
 * Decisão de ESTADO DE TELA da Gestão Assistida, separada do componente.
 *
 * Mesma técnica de `src/domain/operations/operationDetailState.ts`: a tela tem
 * mais de um estado obrigatório (escopo desta fase §25) e cada um deles precisa
 * ser testável sem montar React, sem subir banco e sem esperar rede.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: autorizar. A recusa é sempre do servidor; aqui
 * apenas se CLASSIFICA a recusa recebida, para que a tela diga a coisa certa em
 * vez de um "erro inesperado" genérico.
 */
import { AssistedCycle } from './types';

export type AssistedScreenState =
  | { kind: 'loading' }
  /** Modo demonstração: não há Gestão Assistida, e dizer isso é melhor que fingir. */
  | { kind: 'unavailable'; message: string }
  /** O servidor recusou por papel ou escopo. */
  | { kind: 'unauthorized'; message: string }
  | { kind: 'error'; message: string }
  /** Semana ainda não aberta. Estado legítimo, não falha. */
  | { kind: 'not-opened' }
  /** Ciclo aberto, porém sem nenhum indicador aplicável à região. */
  | { kind: 'no-catalog'; cycle: AssistedCycle }
  | { kind: 'draft'; cycle: AssistedCycle }
  | { kind: 'closed'; cycle: AssistedCycle };

export interface AssistedScreenInput {
  loading: boolean;
  /** Mensagem crua do servidor, ou do adapter de demonstração. */
  errorMessage: string | null;
  /** `null` = semana ainda não aberta. */
  cycle: AssistedCycle | null;
}

/**
 * Recusas de autorização, reconhecidas pela frase literal do servidor.
 *
 * As três vêm das RPCs 0041 e da guarda de 0040. Casar por texto é frágil, e é
 * a alternativa menos ruim: PostgREST entrega `insufficient_privilege` como
 * `42501` tanto para "fora do escopo" quanto para "sem permissão", e a distinção
 * que interessa ao operador — *"não é seu parceiro"* contra *"não é seu papel"* —
 * só existe na mensagem. Se a frase do servidor mudar, o pior caso é a tela cair
 * no estado de erro genérico, que continua correto.
 */
const RECUSAS_DE_AUTORIZACAO = [
  'fora do escopo',
  'apenas o gerente de canal',
  'autenticacao obrigatoria',
];

export function isAuthorizationRefusal(message: string): boolean {
  const m = message.toLowerCase();
  return RECUSAS_DE_AUTORIZACAO.some((frase) => m.includes(frase));
}

/** Recusa do adapter de demonstração — não é falha, é ausência do módulo. */
export function isUnavailable(message: string): boolean {
  return message.toLowerCase().includes('apenas no ambiente corporativo');
}

export function decideAssistedScreenState(input: AssistedScreenInput): AssistedScreenState {
  if (input.loading) return { kind: 'loading' };

  if (input.errorMessage) {
    if (isUnavailable(input.errorMessage)) return { kind: 'unavailable', message: input.errorMessage };
    if (isAuthorizationRefusal(input.errorMessage)) {
      return { kind: 'unauthorized', message: input.errorMessage };
    }
    return { kind: 'error', message: input.errorMessage };
  }

  if (!input.cycle) return { kind: 'not-opened' };
  if (input.cycle.entries.length === 0) return { kind: 'no-catalog', cycle: input.cycle };
  return input.cycle.status === 'closed'
    ? { kind: 'closed', cycle: input.cycle }
    : { kind: 'draft', cycle: input.cycle };
}
