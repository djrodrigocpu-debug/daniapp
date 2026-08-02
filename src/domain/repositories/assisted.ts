/**
 * Contrato do repositório da GESTÃO ASSISTIDA semanal (AAPEx 1.3.5, D1).
 *
 * Fica no domínio, separado das implementações (`src/data/repositories/
 * AssistedRepository.ts`), pelo mesmo motivo do catálogo: modelo puro ·
 * interface · adapter Supabase · adapter honesto de demonstração.
 *
 * Toda operação devolve `Result` — recusa de regra e recusa de autorização são
 * VALORES, não exceções. "Fora do escopo" e "fechamento bloqueado" chegam aqui
 * como `Err` com a frase do servidor, nunca como throw.
 */
import { Result } from '../errors/result';
import {
  AssistedCycle,
  AssistedCycleSummary,
  AssistedEntry,
  AssistedEntryPatch,
  AssistedPlanInput,
} from '../assisted/types';

export interface AssistedRepository {
  /**
   * Abre ou recupera o ciclo da semana. IDEMPOTENTE no servidor: a mesma semana
   * devolve o mesmo ciclo, nunca um segundo.
   *
   * `referenceDate` é qualquer dia da semana desejada; o servidor deriva a
   * segunda-feira. Omitir usa a data do SERVIDOR — o relógio do cliente nunca
   * decide de que semana é o ciclo.
   */
  openCycle(operationId: string, referenceDate?: string): Promise<Result<AssistedCycle>>;

  /**
   * O ciclo da semana, ou `null` quando ela ainda não foi aberta. `null` é um
   * estado legítimo da tela, não uma falha.
   */
  getCycle(operationId: string, weekStartDate?: string): Promise<Result<AssistedCycle | null>>;

  /** Semanas do parceiro, da mais recente para a mais antiga. */
  listCycles(operationId: string, limit?: number): Promise<Result<AssistedCycleSummary[]>>;

  /**
   * Grava o que o Gerente de Canal informou. O status NÃO entra no patch: quem
   * o calcula é o servidor, sobre a regra materializada do item.
   */
  saveEntry(entryId: string, patch: AssistedEntryPatch): Promise<Result<AssistedEntry>>;

  /**
   * Cria ou edita o plano do desvio NO MOTOR ÚNICO, vinculado ao item por
   * chave estrangeira. Não existe plano textual paralelo.
   */
  savePlan(operationId: string, entryId: string, input: AssistedPlanInput): Promise<Result<void>>;

  /**
   * Fecha o ciclo. O servidor recusa se houver item sem dado, desvio sem
   * diagnóstico, desvio sem plano, ou plano sem responsável e prazo.
   * Idempotente: fechar de novo devolve o mesmo estado final.
   */
  closeCycle(cycleId: string): Promise<Result<AssistedCycle>>;
}
