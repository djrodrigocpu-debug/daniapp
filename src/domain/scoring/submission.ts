/**
 * Regras de bloqueio de envio de avaliação (Masterplan §6.1, §7.4;
 * Anexo D — T13, T14; Correção B da microfase de governança).
 *
 * O envio só é permitido quando:
 *  - todos os itens OBRIGATÓRIOS foram avaliados (completude total);
 *  - itens com evidência obrigatória (e status ≠ not_applicable) têm ≥ 1 evidência;
 *  - todo item VERMELHO possui plano de ação vinculado;
 *  - todo item NÃO APLICÁVEL possui justificativa útil (≥ 10 caracteres).
 *
 * Função pura sobre uma visão mínima da avaliação — testável e reutilizável no
 * cliente (prévia) e no servidor (autoridade).
 */
import { TrafficLight } from '../model';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';
import { isValidNotApplicableReason } from './notApplicable';

export interface SubmissionItem {
  itemId: string;
  title: string;
  required: boolean;
  evidenceRequired: boolean;
  status: TrafficLight;
  evidenceCount: number;
  hasActionPlan: boolean;
  /** Justificativa quando status = not_applicable (Correção B). */
  notApplicableReason?: string;
}

export function canSubmit(items: SubmissionItem[]): Result<true> {
  if (items.length === 0) {
    return err(new AppError('validation/incomplete', 'Avaliação sem itens.'));
  }

  for (const item of items) {
    // Completude: item obrigatório não pode ficar sem avaliação.
    if (item.required && item.status === 'not_evaluated') {
      return err(
        new AppError('validation/incomplete', `Preencha o item obrigatório “${item.title}”.`, {
          details: { itemId: item.itemId },
        }),
      );
    }

    // Evidência obrigatória (exceto quando não aplicável).
    if (item.evidenceRequired && item.status !== 'not_applicable' && item.evidenceCount === 0) {
      return err(
        new AppError('validation/missing-evidence', `Inclua uma evidência em “${item.title}”.`, {
          details: { itemId: item.itemId },
        }),
      );
    }

    // Item vermelho exige plano de ação.
    if (item.status === 'red' && !item.hasActionPlan) {
      return err(
        new AppError('validation/missing-action-plan', `Crie um plano de ação para o item vermelho “${item.title}”.`, {
          details: { itemId: item.itemId },
        }),
      );
    }

    // Não aplicável exige justificativa útil (portão novo — os três acima
    // permanecem intactos; a matemática do não aplicável não muda).
    if (item.status === 'not_applicable' && !isValidNotApplicableReason(item.notApplicableReason)) {
      return err(
        new AppError('validation/incomplete', `Justifique o “Não aplicável” em “${item.title}” (mínimo 10 caracteres úteis).`, {
          details: { itemId: item.itemId },
        }),
      );
    }
  }

  return ok(true);
}
