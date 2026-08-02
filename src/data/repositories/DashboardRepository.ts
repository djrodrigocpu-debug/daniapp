/**
 * Adapters do DASHBOARD, da MATRIZ e da PONDERAÇÃO (migration 0048).
 *
 * Dois, e nenhum finge ser o outro:
 *
 *   `SupabaseDashboardRepository`    — REAL REMOTO. Cinco RPCs, nenhuma leitura
 *                                      direta de tabela e nenhuma agregação no
 *                                      cliente.
 *   `UnavailableDashboardRepository` — modo demonstração. Recusa TUDO, com uma
 *                                      frase que diz por quê.
 *
 * POR QUE O SEGUNDO RECUSA EM VEZ DE SIMULAR. Um dashboard local produziria
 * números — e números são exatamente a coisa que não se pode inventar aqui. Sem
 * o servidor não há escopo por papel, não há ponderação publicada, não há
 * quadrante e não há a distinção entre "zero" e "sem dado". Uma tela cheia de
 * zeros pareceria um retrato ruim da operação; a verdade é que não há retrato.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { DashboardRepository } from '../../domain/repositories/dashboard';
import { normalizeFilters } from '../../domain/dashboard/policy135';
import {
  DashboardAggregates,
  DashboardFilters,
  MatrixDataset,
  MatrixEntry,
  RegionWeightingInput,
  RegionWeightingVersion,
  WeightingStatus,
} from '../../domain/dashboard/types135';

/**
 * Numéricos de PostgreSQL chegam como string quando o driver não os coage.
 * Contagem inteira nunca pode virar `NaN` silencioso — daí o fallback explícito.
 */
const int = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const counts = (raw: Record<string, unknown> | null | undefined, keys: string[]) => {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = int(raw?.[k]);
  return out;
};

function toAggregates(raw: Record<string, any>): DashboardAggregates {
  return {
    contractVersion: raw.contractVersion,
    generatedAt: raw.generatedAt,
    today: raw.today,
    filters: {
      ...raw.filters,
      operationIds: raw.filters?.operationIds ?? [],
      resolvedOperationCount: int(raw.filters?.resolvedOperationCount),
    },
    ruleProvenance: raw.ruleProvenance,
    coverage: {
      partners: int(raw.coverage?.partners),
      partnersWithAssisted: int(raw.coverage?.partnersWithAssisted),
      partnersWithMonthlyAudit: int(raw.coverage?.partnersWithMonthlyAudit),
    },
    assisted: {
      cycles: {
        total: int(raw.assisted?.cycles?.total),
        closed: int(raw.assisted?.cycles?.closed),
        draft: int(raw.assisted?.cycles?.draft),
      },
      entryStatusCounts: counts(raw.assisted?.entryStatusCounts,
        ['conforme', 'atencao', 'nao_conforme', 'sem_dado']) as never,
      byIndicator: (raw.assisted?.byIndicator ?? []).map((r: Record<string, unknown>) => ({
        indicatorCode: String(r.indicatorCode ?? ''),
        indicatorName: String(r.indicatorName ?? ''),
        themeCode: String(r.themeCode ?? ''),
        conforme: int(r.conforme), atencao: int(r.atencao),
        naoConforme: int(r.naoConforme), semDado: int(r.semDado),
      })),
      evolution: (raw.assisted?.evolution ?? []).map((r: Record<string, unknown>) => ({
        weekStartDate: String(r.weekStartDate ?? ''),
        conforme: int(r.conforme), atencao: int(r.atencao),
        naoConforme: int(r.naoConforme), semDado: int(r.semDado),
      })),
    },
    monthlyAudit: {
      audits: counts(raw.monthlyAudit?.audits,
        ['total', 'draft', 'submitted', 'returned', 'approved']) as never,
      answerStatusCounts: counts(raw.monthlyAudit?.answerStatusCounts,
        ['conforme', 'nao_conforme', 'nao_aplicavel', 'nao_avaliado']) as never,
      byCompetence: (raw.monthlyAudit?.byCompetence ?? []).map((r: Record<string, unknown>) => ({
        competence: String(r.competence ?? ''),
        audits: int(r.audits), conforme: int(r.conforme), naoConforme: int(r.naoConforme),
        naoAplicavel: int(r.naoAplicavel), naoAvaliado: int(r.naoAvaliado),
      })),
    },
    actionPlans: {
      byStatus: counts(raw.actionPlans?.byStatus, [
        'open', 'in_progress', 'waiting_partner', 'blocked', 'done', 'validated',
        'cancelled_justified',
      ]),
      bySource: counts(raw.actionPlans?.bySource, ['legacy', 'assisted', 'monthly_audit']),
      overdue: int(raw.actionPlans?.overdue),
      total: int(raw.actionPlans?.total),
    },
    partners: (raw.partners ?? []).map((p: Record<string, any>) => ({
      operationId: p.operationId,
      partnerName: p.partnerName,
      assisted: {
        conforme: int(p.assisted?.conforme), atencao: int(p.assisted?.atencao),
        naoConforme: int(p.assisted?.naoConforme), semDado: int(p.assisted?.semDado),
      },
      monthlyAudit: {
        conforme: int(p.monthlyAudit?.conforme), naoConforme: int(p.monthlyAudit?.naoConforme),
        naoAplicavel: int(p.monthlyAudit?.naoAplicavel), naoAvaliado: int(p.monthlyAudit?.naoAvaliado),
      },
      openPlans: int(p.openPlans),
    })),
  };
}

function toMatrixEntry(raw: Record<string, any>): MatrixEntry {
  return {
    operationId: raw.operationId,
    partnerName: raw.partnerName,
    regionId: raw.regionId,
    performance: {
      axis: raw.performance?.axis,
      // `null` PRECISA sobreviver: é a diferença entre "sem dado" e "nota zero".
      score: numOrNull(raw.performance?.score),
      conforme: int(raw.performance?.conforme), atencao: int(raw.performance?.atencao),
      naoConforme: int(raw.performance?.naoConforme), semDado: int(raw.performance?.semDado),
    },
    process: {
      axis: raw.process?.axis,
      score: numOrNull(raw.process?.score),
      trafficLight: raw.process?.trafficLight,
      auditsConsidered: int(raw.process?.auditsConsidered),
    },
    quadrant: raw.quadrant ?? null,
    dataSufficiency: {
      sufficient: Boolean(raw.dataSufficiency?.sufficient),
      reasons: raw.dataSufficiency?.reasons ?? [],
    },
    weighting: {
      configured: Boolean(raw.weighting?.configured),
      regionId: raw.weighting?.regionId ?? raw.regionId,
      reason: raw.weighting?.reason,
      id: raw.weighting?.id,
      versionNumber: raw.weighting?.versionNumber,
      assistedWeight: numOrNull(raw.weighting?.assistedWeight) ?? undefined,
      auditWeight: numOrNull(raw.weighting?.auditWeight) ?? undefined,
      effectiveFrom: raw.weighting?.effectiveFrom,
      publishedAt: raw.weighting?.publishedAt,
    },
    weightedIndex: raw.weightedIndex
      ? {
          value: Number(raw.weightedIndex.value),
          assistedComponent: Number(raw.weightedIndex.assistedComponent),
          auditComponent: Number(raw.weightedIndex.auditComponent),
          weightingVersionId: raw.weightedIndex.weightingVersionId,
          provisional: Boolean(raw.weightedIndex.provisional),
          provisionalReason: raw.weightedIndex.provisionalReason,
        }
      : null,
  };
}

function toWeightingVersion(raw: Record<string, any>): RegionWeightingVersion {
  return {
    id: raw.id,
    regionId: raw.regionId,
    versionNumber: int(raw.versionNumber),
    assistedWeight: Number(raw.assistedWeight),
    auditWeight: Number(raw.auditWeight),
    effectiveFrom: raw.effectiveFrom,
    effectiveTo: raw.effectiveTo ?? null,
    status: raw.status,
    createdBy: raw.createdBy ?? null,
    createdAt: raw.createdAt,
    publishedBy: raw.publishedBy ?? null,
    publishedAt: raw.publishedAt ?? null,
  };
}

/**
 * A mensagem do servidor é repassada CRUA quando existe — as recusas desta
 * superfície são nominais ("os pesos devem somar 100: recebido 99") e é
 * exatamente isso que resolve o problema de quem as lê.
 */
const fail = (fallback: string, cause: { message?: string } | null): AppError =>
  new AppError('network/unavailable', cause?.message || fallback, { cause, severity: 'medium' });

export class SupabaseDashboardRepository implements DashboardRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAggregates(filters: DashboardFilters = {}): Promise<Result<DashboardAggregates>> {
    const { data, error } = await this.client.rpc('get_dashboard_aggregates', {
      p_filters: normalizeFilters(filters),
    });
    if (error) return err(fail('Falha ao carregar os indicadores do painel.', error));
    return ok(toAggregates(data as Record<string, unknown>));
  }

  async getMatrix(filters: DashboardFilters = {}): Promise<Result<MatrixDataset>> {
    const { data, error } = await this.client.rpc('get_matrix_dataset', {
      p_filters: normalizeFilters(filters),
    });
    if (error) return err(fail('Falha ao carregar a Matriz.', error));
    const raw = data as Record<string, any>;
    return ok({
      contractVersion: raw.contractVersion,
      generatedAt: raw.generatedAt,
      filters: {
        ...raw.filters,
        operationIds: raw.filters?.operationIds ?? [],
        resolvedOperationCount: int(raw.filters?.resolvedOperationCount),
      },
      ruleProvenance: raw.ruleProvenance,
      quadrantLabels: raw.quadrantLabels ?? {},
      entries: (raw.entries ?? []).map(toMatrixEntry),
    });
  }

  async getWeightingStatus(regionId?: string): Promise<Result<WeightingStatus>> {
    const { data, error } = await this.client.rpc('get_weighting_status', {
      p_region_id: regionId ?? null,
    });
    if (error) return err(fail('Falha ao carregar a ponderação regional.', error));
    const raw = data as Record<string, any>;
    return ok({
      contractVersion: raw.contractVersion,
      regions: (raw.regions ?? []).map((r: Record<string, any>) => ({
        regionId: r.regionId,
        regionName: r.regionName,
        current: {
          configured: Boolean(r.current?.configured),
          regionId: r.current?.regionId ?? r.regionId,
          reason: r.current?.reason,
          id: r.current?.id,
          versionNumber: r.current?.versionNumber,
          assistedWeight: numOrNull(r.current?.assistedWeight) ?? undefined,
          auditWeight: numOrNull(r.current?.auditWeight) ?? undefined,
          effectiveFrom: r.current?.effectiveFrom,
          publishedAt: r.current?.publishedAt,
        },
        versions: (r.versions ?? []).map(toWeightingVersion),
      })),
    });
  }

  async saveWeightingDraft(
    regionId: string, input: RegionWeightingInput,
  ): Promise<Result<RegionWeightingVersion>> {
    const { data, error } = await this.client.rpc('catalog_save_region_weighting_draft', {
      p_region_id: regionId,
      p_input: {
        assistedWeight: input.assistedWeight,
        auditWeight: input.auditWeight,
        ...(input.effectiveFrom ? { effectiveFrom: input.effectiveFrom } : {}),
      },
    });
    if (error) return err(fail('Falha ao salvar a ponderação.', error));
    return ok(toWeightingVersion(data as Record<string, unknown>));
  }

  async publishWeighting(weightingId: string): Promise<Result<RegionWeightingVersion>> {
    const { data, error } = await this.client.rpc('catalog_publish_region_weighting', {
      p_id: weightingId,
    });
    if (error) return err(fail('Falha ao publicar a ponderação.', error));
    return ok(toWeightingVersion(data as Record<string, unknown>));
  }
}

export const DASHBOARD_UNAVAILABLE_MESSAGE =
  'O painel gerencial e a Matriz existem apenas no ambiente corporativo. '
  + 'O escopo por papel, a ponderação regional publicada, a classificação em quadrantes e a '
  + 'distinção entre "zero" e "sem dado" são resolvidos pelo servidor, e não têm equivalente '
  + 'no modo demonstração.';

export class UnavailableDashboardRepository implements DashboardRepository {
  private refuse<T>(): Promise<Result<T>> {
    return Promise.resolve(err(new AppError('config/missing-env', DASHBOARD_UNAVAILABLE_MESSAGE, {
      severity: 'low',
    })));
  }

  getAggregates(_f?: DashboardFilters) { return this.refuse<DashboardAggregates>(); }
  getMatrix(_f?: DashboardFilters) { return this.refuse<MatrixDataset>(); }
  getWeightingStatus(_r?: string) { return this.refuse<WeightingStatus>(); }
  saveWeightingDraft(_r: string, _i: RegionWeightingInput) { return this.refuse<RegionWeightingVersion>(); }
  publishWeighting(_id: string) { return this.refuse<RegionWeightingVersion>(); }
}
