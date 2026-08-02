/**
 * Decisão de ESTADO DE TELA da Auditoria Mensal, separada do componente.
 *
 * Mesma técnica de `src/domain/assisted/screenState.ts`: cada estado pede uma
 * frase diferente para o operador, e colapsá-los num "erro inesperado"
 * transforma um problema resolvível em chamado de suporte.
 */
import { MonthlyAudit } from './types';

export type MonthlyScreenState =
  | { kind: 'loading' }
  /** Modo demonstração: não há Auditoria Mensal, e dizer isso é melhor que fingir. */
  | { kind: 'unavailable'; message: string }
  /** O servidor recusou por papel ou escopo. */
  | { kind: 'unauthorized'; message: string }
  | { kind: 'error'; message: string }
  /** Competência ainda não iniciada. Estado legítimo, não falha. */
  | { kind: 'not-started' }
  /** Auditoria criada, porém sem nenhum critério aplicável à região. */
  | { kind: 'no-criteria'; audit: MonthlyAudit }
  /** Em preenchimento — inclui `returned`, que reabre para correção. */
  | { kind: 'editable'; audit: MonthlyAudit }
  /** Enviada, aguardando validação: somente leitura para o autor. */
  | { kind: 'submitted'; audit: MonthlyAudit }
  /** Aprovada: somente leitura, com snapshot oficial. */
  | { kind: 'approved'; audit: MonthlyAudit };

export interface MonthlyScreenInput {
  loading: boolean;
  errorMessage: string | null;
  audit: MonthlyAudit | null;
}

/**
 * Recusas de autorização, reconhecidas pela frase literal do servidor.
 *
 * Casar por texto é frágil, e é a alternativa menos ruim: PostgREST entrega
 * `insufficient_privilege` como `42501` para todas elas, e a distinção que
 * interessa ao operador — *"não é seu parceiro"*, *"não é seu papel"*, *"você
 * não é o autor"* — só existe na mensagem. Se a frase mudar, o pior caso é cair
 * no estado de erro genérico, que continua correto.
 */
const RECUSAS_DE_AUTORIZACAO = [
  'fora do escopo',
  'apenas o gerente de canal',
  'apenas o autor',
  'autenticacao obrigatoria',
  'sem permissao de validacao',
];

export function isAuthorizationRefusal(message: string): boolean {
  const m = message.toLowerCase();
  return RECUSAS_DE_AUTORIZACAO.some((frase) => m.includes(frase));
}

export function isUnavailable(message: string): boolean {
  return message.toLowerCase().includes('apenas no ambiente corporativo');
}

export function decideMonthlyScreenState(input: MonthlyScreenInput): MonthlyScreenState {
  if (input.loading) return { kind: 'loading' };

  if (input.errorMessage) {
    if (isUnavailable(input.errorMessage)) return { kind: 'unavailable', message: input.errorMessage };
    if (isAuthorizationRefusal(input.errorMessage)) {
      return { kind: 'unauthorized', message: input.errorMessage };
    }
    return { kind: 'error', message: input.errorMessage };
  }

  const audit = input.audit;
  if (!audit) return { kind: 'not-started' };
  if (audit.criteria.length === 0) return { kind: 'no-criteria', audit };

  switch (audit.status) {
    case 'approved':
    case 'superseded':
      return { kind: 'approved', audit };
    case 'submitted':
      return { kind: 'submitted', audit };
    default:
      // `draft` e `returned` — devolvida reabre, é o que devolver significa.
      return { kind: 'editable', audit };
  }
}
