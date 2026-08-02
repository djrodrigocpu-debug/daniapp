/**
 * Adapters da GESTÃO ASSISTIDA semanal (migrations 0039–0041).
 *
 * Dois, e nenhum deles finge ser o outro:
 *
 *   `SupabaseAssistedRepository`    — REAL REMOTO. Tudo pelas RPCs; nenhuma
 *                                     escrita direta em tabela.
 *   `UnavailableAssistedRepository` — modo demonstração. Recusa TUDO, com uma
 *                                     frase que diz por quê.
 *
 * POR QUE O SEGUNDO RECUSA EM VEZ DE SIMULAR. O ciclo semanal é idempotência
 * garantida por constraint, status calculado por gatilho, imutabilidade de
 * fechamento e vínculo de plano com integridade referencial. Uma versão local em
 * AsyncStorage aceitaria dois ciclos na mesma semana, deixaria o cliente gravar
 * o status que quisesse e chamaria de "plano" um texto sem motor — e o operador
 * só descobriria em produção. Lista vazia seria pior: pareceria "ainda não há
 * indicadores configurados", quando a verdade é "não há Gestão Assistida aqui".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { AssistedRepository } from '../../domain/repositories/assisted';
import {
  AssistedCycle,
  AssistedCycleSummary,
  AssistedEntry,
  AssistedEntryPatch,
  AssistedIndicatorStatus,
  AssistedPlanInput,
  ActionPlanSource,
} from '../../domain/assisted/types';
import { IndicatorDirection } from '../../domain/model';

// ---------------------------------------------------------------------------
// Formas cruas devolvidas pelas RPCs
// ---------------------------------------------------------------------------
// As RPCs devolvem jsonb em camelCase. Numéricos de PostgreSQL chegam como
// string quando o driver não os coage — `num` cobre os dois casos.

interface RawPlan {
  id: string;
  action: string | null;
  problem: string | null;
  owner: string | null;
  dueDate: string | null;
  priority: string | null;
  status: string;
  source: ActionPlanSource;
}

interface RawEntry {
  id: string;
  cycleId: string;
  indicatorDefinitionId: string;
  indicatorVersionId: string;
  regionalConfigId: string;
  regionalConfigVersionId: string;
  themeId: string;
  themeVersionId: string;
  indicatorCode: string;
  indicatorName: string;
  themeCode: string;
  themeName: string;
  unit: string;
  direction: IndicatorDirection;
  orientation: string | null;
  target: number | string;
  tolerance: number | string;
  weight: number | string;
  sortOrder: number;
  actual: number | string | null;
  sourcePeriod: string | null;
  sourceConsultedAt: string | null;
  sourceReference: string | null;
  observation: string | null;
  diagnosis: string | null;
  status: AssistedIndicatorStatus;
  ruleVersion: string;
  recordedBy: string | null;
  recordedAt: string | null;
  plan: RawPlan | null;
}

interface RawCycle {
  id: string;
  operationId: string;
  partnerName: string;
  weekStartDate: string;
  weekEndDate: string;
  status: 'draft' | 'closed';
  authorUserId: string;
  closedAt: string | null;
  closedBy: string | null;
  ruleVersion: string | null;
  entries: RawEntry[];
}

interface RawSummary {
  id: string;
  operationId: string;
  weekStartDate: string;
  weekEndDate: string;
  status: 'draft' | 'closed';
  closedAt: string | null;
  entryCount: number;
  deviationCount: number;
  missingCount: number;
}

const num = (v: number | string | null | undefined, fallback = 0): number =>
  v === null || v === undefined ? fallback : Number(v);

const numOrNull = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

function toEntry(raw: RawEntry): AssistedEntry {
  return {
    id: raw.id,
    cycleId: raw.cycleId,
    provenance: {
      indicatorDefinitionId: raw.indicatorDefinitionId,
      indicatorVersionId: raw.indicatorVersionId,
      regionalConfigId: raw.regionalConfigId,
      regionalConfigVersionId: raw.regionalConfigVersionId,
      themeId: raw.themeId,
      themeVersionId: raw.themeVersionId,
    },
    indicatorCode: raw.indicatorCode,
    indicatorName: raw.indicatorName,
    themeCode: raw.themeCode,
    themeName: raw.themeName,
    rule: {
      target: num(raw.target),
      tolerance: num(raw.tolerance),
      weight: num(raw.weight, 1),
      unit: raw.unit,
      direction: raw.direction,
      orientation: raw.orientation ?? '',
      sortOrder: raw.sortOrder ?? 0,
    },
    actual: numOrNull(raw.actual),
    source: {
      period: raw.sourcePeriod ?? '',
      consultedAt: raw.sourceConsultedAt ?? null,
      reference: raw.sourceReference ?? '',
    },
    observation: raw.observation ?? '',
    diagnosis: raw.diagnosis ?? '',
    status: raw.status,
    ruleVersion: raw.ruleVersion,
    recordedBy: raw.recordedBy ?? null,
    recordedAt: raw.recordedAt ?? null,
    plan: raw.plan
      ? {
          id: raw.plan.id,
          action: raw.plan.action ?? '',
          problem: raw.plan.problem ?? '',
          owner: raw.plan.owner ?? '',
          dueDate: raw.plan.dueDate ?? '',
          priority: raw.plan.priority ?? 'medium',
          status: raw.plan.status,
          source: raw.plan.source,
        }
      : null,
  };
}

function toCycle(raw: RawCycle): AssistedCycle {
  return {
    id: raw.id,
    operationId: raw.operationId,
    partnerName: raw.partnerName,
    weekStartDate: raw.weekStartDate,
    weekEndDate: raw.weekEndDate,
    status: raw.status,
    authorUserId: raw.authorUserId,
    closedAt: raw.closedAt,
    closedBy: raw.closedBy,
    ruleVersion: raw.ruleVersion,
    entries: (raw.entries ?? []).map(toEntry),
  };
}

/**
 * A mensagem do servidor é repassada CRUA quando existe.
 *
 * As recusas desta superfície são todas nominais e escritas para o operador
 * ("fechamento bloqueado: IND-003 apresenta desvio sem plano de acao").
 * Substituí-las por "Falha ao fechar" esconderia exatamente o que resolve o
 * problema.
 */
const fail = (fallback: string, cause: { message?: string } | null): AppError =>
  new AppError('network/unavailable', cause?.message || fallback, { cause, severity: 'medium' });

// ---------------------------------------------------------------------------
// Adapter corporativo
// ---------------------------------------------------------------------------

export class SupabaseAssistedRepository implements AssistedRepository {
  constructor(private readonly client: SupabaseClient) {}

  async openCycle(operationId: string, referenceDate?: string): Promise<Result<AssistedCycle>> {
    const { data, error } = await this.client.rpc('open_assisted_cycle', {
      p_operation_id: operationId,
      p_reference_date: referenceDate ?? null,
    });
    if (error) return err(fail('Falha ao abrir o ciclo da semana.', error));
    return ok(toCycle(data as RawCycle));
  }

  async getCycle(operationId: string, weekStartDate?: string): Promise<Result<AssistedCycle | null>> {
    const { data, error } = await this.client.rpc('get_assisted_cycle', {
      p_operation_id: operationId,
      p_week_start_date: weekStartDate ?? null,
    });
    if (error) return err(fail('Falha ao carregar o ciclo da semana.', error));
    // Semana ainda não aberta devolve nulo — é estado, não erro.
    return ok(data ? toCycle(data as RawCycle) : null);
  }

  async listCycles(operationId: string, limit = 26): Promise<Result<AssistedCycleSummary[]>> {
    const { data, error } = await this.client.rpc('list_assisted_cycles', {
      p_operation_id: operationId,
      p_limit: limit,
    });
    if (error) return err(fail('Falha ao carregar o histórico de ciclos.', error));
    return ok(((data ?? []) as RawSummary[]).map((s) => ({ ...s })));
  }

  async saveEntry(entryId: string, patch: AssistedEntryPatch): Promise<Result<AssistedEntry>> {
    const { data, error } = await this.client.rpc('save_assisted_entry', {
      p_entry_id: entryId,
      p_patch: patch,
    });
    if (error) return err(fail('Falha ao salvar o registro do indicador.', error));
    return ok(toEntry(data as RawEntry));
  }

  async savePlan(operationId: string, entryId: string, input: AssistedPlanInput): Promise<Result<void>> {
    // `save_action_plan` é o MOTOR ÚNICO. Não existe RPC própria de plano da
    // Gestão Assistida — o que a diferencia é `assistedEntryId`, e nada mais.
    const { error } = await this.client.rpc('save_action_plan', {
      p_input: {
        ...(input.id ? { id: input.id } : {}),
        operationId,
        assistedEntryId: entryId,
        action: input.action,
        problem: input.problem ?? '',
        owner: input.owner,
        dueDate: input.dueDate,
        priority: input.priority ?? 'medium',
      },
    });
    if (error) return err(fail('Falha ao salvar o plano de ação.', error));
    return ok(undefined);
  }

  async closeCycle(cycleId: string): Promise<Result<AssistedCycle>> {
    const { data, error } = await this.client.rpc('close_assisted_cycle', { p_cycle_id: cycleId });
    if (error) return err(fail('Falha ao concluir o ciclo.', error));
    return ok(toCycle(data as RawCycle));
  }
}

// ---------------------------------------------------------------------------
// Adapter honesto do modo demonstração
// ---------------------------------------------------------------------------

export const ASSISTED_UNAVAILABLE_MESSAGE =
  'A Gestão Assistida existe apenas no ambiente corporativo. '
  + 'A unicidade da semana, o cálculo do status, a imutabilidade do fechamento e o vínculo '
  + 'do plano de ação são impostos pelo servidor, e não têm equivalente no modo demonstração.';

export class UnavailableAssistedRepository implements AssistedRepository {
  private refuse<T>(): Promise<Result<T>> {
    return Promise.resolve(err(new AppError('config/missing-env', ASSISTED_UNAVAILABLE_MESSAGE, {
      severity: 'low',
    })));
  }

  openCycle(_operationId: string, _referenceDate?: string) { return this.refuse<AssistedCycle>(); }
  getCycle(_operationId: string, _weekStartDate?: string) { return this.refuse<AssistedCycle | null>(); }
  listCycles(_operationId: string, _limit?: number) { return this.refuse<AssistedCycleSummary[]>(); }
  saveEntry(_entryId: string, _patch: AssistedEntryPatch) { return this.refuse<AssistedEntry>(); }
  savePlan(_operationId: string, _entryId: string, _input: AssistedPlanInput) { return this.refuse<void>(); }
  closeCycle(_cycleId: string) { return this.refuse<AssistedCycle>(); }
}
