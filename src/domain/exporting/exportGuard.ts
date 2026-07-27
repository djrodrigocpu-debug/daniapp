/**
 * Exportação controlada (Masterplan §5.3, §7.10; Anexo D — T16).
 *
 * Toda exportação respeita o escopo do perfil e carrega uma "marca d'água
 * lógica": usuário, data, escopo e finalidade. Dados brutos completos exigem
 * permissão específica (admin).
 */
import { AuthzSubject, exportScope, isAdmin } from '../authz/policy';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';

export interface ExportRequest {
  purpose: string;
  /** Operações-alvo da exportação. */
  operationIds: string[];
  /** true para dados brutos completos (exige admin). */
  raw: boolean;
}

export interface ExportWatermark {
  userId: string;
  issuedAt: string;
  scopeKind: string;
  purpose: string;
  operationIds: string[];
}

export interface OperationScopeLookup {
  regionId: string;
  coordinationId: string;
}

/**
 * Valida a exportação e produz a marca d'água. `resolveOperation` informa
 * região/coordenadoria de cada operação para checagem de escopo.
 */
export function authorizeExport(
  subject: AuthzSubject,
  req: ExportRequest,
  now: string,
  resolveOperation: (operationId: string) => OperationScopeLookup | null,
): Result<ExportWatermark> {
  if (req.purpose.trim().length < 3) {
    return err(new AppError('validation/invalid-input', 'Exportação exige finalidade declarada.'));
  }
  if (req.raw && !isAdmin(subject)) {
    return err(new AppError('authz/forbidden', 'Dados brutos completos exigem permissão de Administrador.', { severity: 'high' }));
  }

  const scope = exportScope(subject);
  if (scope.kind === 'none') {
    return err(new AppError('authz/forbidden', 'Perfil sem escopo de exportação.', { severity: 'high' }));
  }

  // Cada operação precisa estar dentro do escopo do sujeito (T16).
  for (const opId of req.operationIds) {
    const op = resolveOperation(opId);
    if (!op) {
      return err(new AppError('authz/out-of-scope', `Operação ${opId} não encontrada no escopo.`, { severity: 'high' }));
    }
    const inScope =
      scope.kind === 'all' ||
      (scope.kind === 'regions' && scope.ids.includes(op.regionId)) ||
      (scope.kind === 'coordinations' && scope.ids.includes(op.coordinationId)) ||
      (scope.kind === 'operations' && scope.ids.includes(opId));
    if (!inScope) {
      return err(new AppError('authz/out-of-scope', `Exportação fora do escopo para a operação ${opId}.`, { severity: 'high' }));
    }
  }

  return ok({
    userId: subject.userId,
    issuedAt: now,
    scopeKind: scope.kind,
    purpose: req.purpose.trim(),
    operationIds: req.operationIds,
  });
}
