/**
 * Contrato + escopo do repositório de Operações (Masterplan §8, §15).
 *
 * As telas consomem esta interface via `OperationsProvider` — nunca o `AppContext`
 * como banco. Duas implementações plugáveis com o mesmo contrato:
 *   - `LocalOperationsRepository`   → REAL LOCAL (store persistente);
 *   - `SupabaseOperationsRepository`→ REAL REMOTO quando provisionado (RLS no servidor).
 */
import { Operation, User, UserRole } from '../../types';
import { Result } from '../../domain/errors/result';
import { DashboardMetrics } from '../../domain/dashboard/metrics';

/** Escopo de leitura derivado do usuário autenticado. */
export interface OperationScope {
  userId: string;
  role: UserRole;
}

export function scopeFromUser(user: User): OperationScope {
  return { userId: user.id, role: user.role };
}

/**
 * Visibilidade de uma operação por perfil (espelha a RLS do servidor — §5.1):
 * admin/regional veem tudo; coordenador vê sua coordenadoria; GC vê as suas.
 * A segurança real permanece na RLS; isto é usabilidade/consistência de cliente.
 */
export function isOperationVisible(scope: OperationScope, operation: Operation): boolean {
  switch (scope.role) {
    case 'admin':
    case 'regional':
      return true;
    case 'coordinator':
      return operation.coordinatorId === scope.userId;
    case 'channel_manager':
      return operation.managerId === scope.userId;
    default:
      return false;
  }
}

export function filterVisibleOperations(scope: OperationScope, operations: Operation[]): Operation[] {
  return operations.filter((operation) => isOperationVisible(scope, operation));
}

/**
 * Nomes funcionais da operação (Ficha do Parceiro). `null` num campo significa
 * vínculo realmente ausente no banco (ex.: coordenadoria sem coordenador
 * definido) — a tela mostra "Não atribuído", nunca "—" (que fica reservado
 * para "a operação em si não veio", fora de escopo).
 */
export interface OperationPeople {
  managerName: string | null;
  coordinatorName: string | null;
  coordinationName: string | null;
}

export interface OperationsRepository {
  /** Operações visíveis ao escopo (já filtradas). */
  listVisible(scope: OperationScope): Promise<Result<Operation[]>>;
  /** Uma operação por id, respeitando escopo (fora do escopo ⇒ erro). */
  getById(scope: OperationScope, id: string): Promise<Result<Operation | null>>;
  /** Métricas do dashboard calculadas sobre os registros reais do escopo. */
  getDashboard(scope: OperationScope, nowISO?: string): Promise<Result<DashboardMetrics>>;
  /** Nomes funcionais (GC, coordenador, coordenadoria) da operação, no escopo do chamador. */
  getOperationPeople(scope: OperationScope, operationId: string): Promise<Result<OperationPeople | null>>;
}
