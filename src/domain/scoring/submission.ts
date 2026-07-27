/**
 * Regras de bloqueio de envio de avaliação (Masterplan §6.1, §7.4;
 * Anexo D — T13, T14).
 *
 * O envio só é permitido quando:
 *  - todos os itens OBRIGATÓRIOS foram avaliados (completude total);
 *  - itens com evidência obrigatória (e status ≠ not_applicable) têm ≥ 1 evidência;
 *  - todo item VERMELHO possui plano de ação vinculado.
 *
 * Função pura sobre uma visão mínima da avaliação — testável e reutilizável no
 * cliente (prévia) e no servidor (autoridade).
 */
import { TrafficLight } from '../model';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';

export interface SubmissionItem {
  itemId: string;
  title: string;
  required: boolean;
  evidenceRequired: boolean;
  status: TrafficLight;
  evidenceCount: number;
  hasActionPlan: boolean;
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
  }

  return ok(true);
}
