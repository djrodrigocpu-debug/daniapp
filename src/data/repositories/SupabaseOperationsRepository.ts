/**
 * Adapter Supabase do OperationsRepository (Masterplan §8, §5.1).
 *
 * CLASSIFICAÇÃO: REAL REMOTO — porém **não exercitado neste ambiente** (sem
 * Supabase provisionado). É funcional e pronto para conexão: a segurança de
 * escopo é imposta pela RLS no servidor; este cliente apenas projeta os dados.
 *
 * Depende de uma projeção de leitura server-side `ui_operations` (view/RPC) que
 * mapeia o modelo corporativo (operations + snapshots + ações) para a forma da UI
 * (`src/types.Operation`). Essa view deve ser criada no provisionamento — até lá,
 * este adapter permanece BLOQUEADO PARA AMBIENTE REMOTO. Nunca usa `service_role`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Operation } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { computeDashboardMetrics, DashboardMetrics } from '../../domain/dashboard/metrics';
import { OperationScope, OperationsRepository, isOperationVisible } from './OperationsRepository';

/** Nome da projeção de leitura alinhada à UI (migration 0005). */
const UI_OPERATIONS_VIEW = 'ui_operations';

/**
 * A view `ui_operations` já projeta em camelCase (colunas quotadas) exatamente a
 * forma de `Operation`. O único ajuste é normalizar `lastAudit` null → undefined
 * para casar com o tipo opcional do domínio.
 */
type UiOperationRow = Omit<Operation, 'lastAudit'> & { lastAudit: string | null };

function mapRow(row: UiOperationRow): Operation {
  return { ...row, lastAudit: row.lastAudit ?? undefined };
}

function toAppError(message: string, cause?: unknown): AppError {
  return new AppError('network/unavailable', message, { severity: 'high', cause });
}

export class SupabaseOperationsRepository implements OperationsRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** A RLS restringe as linhas ao escopo do usuário autenticado. */
  async listVisible(_scope: OperationScope): Promise<Result<Operation[]>> {
    const { data, error } = await this.client
      .from(UI_OPERATIONS_VIEW)
      .select('*')
      .order('nextAudit', { ascending: true });
    if (error) return err(toAppError('Falha ao carregar operações.', error));
    return ok((data as UiOperationRow[]).map(mapRow));
  }

  async getById(scope: OperationScope, id: string): Promise<Result<Operation | null>> {
    const { data, error } = await this.client
      .from(UI_OPERATIONS_VIEW)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return err(toAppError('Falha ao carregar a operação.', error));
    if (!data) return ok(null);
    const operation = mapRow(data as UiOperationRow);
    // Defesa em profundidade: a RLS já filtra, mas confirmamos no cliente.
    if (!isOperationVisible(scope, operation)) {
      return err('authz/out-of-scope', 'Operação fora do seu escopo de acesso.');
    }
    return ok(operation);
  }

  async getDashboard(scope: OperationScope, nowISO?: string): Promise<Result<DashboardMetrics>> {
    const operations = await this.listVisible(scope);
    if (!operations.ok) return operations;
    // Ações e avaliações do escopo para métricas (projeções análogas server-side).
    const [{ data: actionRows, error: actionErr }, { data: evalRows, error: evalErr }] = await Promise.all([
      this.client.from('ui_action_plans').select('*'),
      this.client.from('ui_evaluations').select('*'),
    ]);
    if (actionErr) return err(toAppError('Falha ao carregar planos de ação.', actionErr));
    if (evalErr) return err(toAppError('Falha ao carregar avaliações.', evalErr));
    return ok(
      computeDashboardMetrics(
        operations.value,
        (actionRows ?? []) as never[],
        (evalRows ?? []) as never[],
        nowISO,
      ),
    );
  }
}
