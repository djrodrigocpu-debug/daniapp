/**
 * Imutabilidade e adendo (Masterplan §5.3, §11.4; Anexo D — T07).
 *
 * Registros aprovados não são reescritos. Correção posterior é um ADENDO: o
 * snapshot original permanece; a avaliação aprovada é marcada como supersedida
 * e uma nova avaliação (adendo) referencia a anterior, com autoria, motivo e data.
 */
import { Evaluation } from '../model';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';

/** Bloqueia qualquer edição direta de avaliação aprovada (T07). */
export function assertMutable(evaluation: Pick<Evaluation, 'status'>): Result<true> {
  if (evaluation.status === 'approved') {
    return err(
      new AppError('integrity/immutable-record', 'Avaliação aprovada é imutável. Registre um adendo.', {
        severity: 'critical',
      }),
    );
  }
  if (evaluation.status === 'superseded') {
    return err(new AppError('integrity/immutable-record', 'Avaliação supersedida é somente leitura.', { severity: 'high' }));
  }
  return ok(true);
}

export interface AddendumInput {
  original: Evaluation;
  authorUserId: string;
  reason: string;
  now: string;
  newEvaluationId: string;
}

export interface AddendumResult {
  /** A avaliação original passa a 'superseded' (não é apagada). */
  supersededOriginal: Evaluation;
  /** Nova avaliação (adendo) em rascunho, referenciando a original. */
  addendum: Evaluation;
}

/**
 * Cria um adendo a partir de uma avaliação aprovada. Não altera o snapshot
 * original; produz a transição controlada approved → superseded e uma nova
 * avaliação rascunho que herda respostas e template.
 */
export function createAddendum(input: AddendumInput): Result<AddendumResult> {
  if (input.original.status !== 'approved') {
    return err(new AppError('integrity/immutable-record', 'Adendo só se aplica a avaliação aprovada.'));
  }
  if (input.reason.trim().length < 10) {
    return err(new AppError('validation/invalid-input', 'Adendo exige motivo.'));
  }

  const supersededOriginal: Evaluation = {
    ...input.original,
    status: 'superseded',
    updatedAt: input.now,
  };

  const addendum: Evaluation = {
    ...input.original,
    id: input.newEvaluationId,
    status: 'draft',
    authorUserId: input.authorUserId,
    submittedAt: null,
    approvedAt: null,
    rowVersion: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };

  return ok({ supersededOriginal, addendum });
}
