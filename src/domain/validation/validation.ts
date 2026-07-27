/**
 * Validação de avaliações (Masterplan §7.8; Anexo D — T02).
 *
 * Aprovar produz snapshot oficial. Devolver exige motivo estruturado. Ninguém
 * aprova a própria submissão. Aprovação em lote de avaliações complexas fica
 * PROIBIDA no piloto (§7.8, R24).
 */
import { ValidationDecision } from '../model';
import { AuthzSubject, ScopedOperation, canValidate } from '../authz/policy';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';

export interface ValidationRequest {
  evaluation: { id: string; authorUserId: string; operation: ScopedOperation };
  decision: ValidationDecision;
  reason: string;
}

const MIN_RETURN_REASON = 10;

/** Decide se uma validação é permitida e bem-formada. */
export function assertCanValidate(subject: AuthzSubject, req: ValidationRequest): Result<true> {
  if (!canValidate(subject, req.evaluation)) {
    if (req.evaluation.authorUserId === subject.userId) {
      return err(new AppError('authz/self-approval', 'Você não pode validar a própria submissão.', { severity: 'critical' }));
    }
    return err(new AppError('authz/forbidden', 'Sem permissão para validar esta avaliação neste escopo.', { severity: 'high' }));
  }
  // Devolução exige motivo estruturado (§7.8).
  if (req.decision === 'returned' && req.reason.trim().length < MIN_RETURN_REASON) {
    return err(new AppError('validation/invalid-input', 'Devolução exige um motivo estruturado (mínimo de detalhe).'));
  }
  return ok(true);
}

/**
 * Aprovação em lote proibida no piloto (§7.8; Anexo D contexto R24). Rejeita
 * qualquer tentativa de aprovar mais de uma avaliação de uma vez.
 */
export function assertNoBatchApproval(decisions: ValidationDecision[]): Result<true> {
  const approvals = decisions.filter((d) => d === 'approved').length;
  if (approvals > 1) {
    return err(new AppError('validation/invalid-input', 'Aprovação em lote está desabilitada no piloto.', { severity: 'high' }));
  }
  return ok(true);
}
