/**
 * Repositório da Gestão Assistida / Visita produtiva (Masterplan §7). Cuida dos
 * resultados de indicadores e relatórios de visita (retroalimentação). Planos de
 * ação reusam o EvaluationsRepository. Adapters Local/Supabase.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { IndicatorResult, VisitReport } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { makeId } from '../../utils/ids';
import { LocalStore, localStore } from '../store/localStore';

export type VisitReportInput = Omit<VisitReport, 'id' | 'createdAt' | 'createdBy'>;

export interface PerformanceRepository {
  updateIndicatorResult(resultId: string, patch: Partial<IndicatorResult>): Promise<Result<IndicatorResult>>;
  createVisitReport(input: VisitReportInput, createdBy: string): Promise<Result<VisitReport>>;
}

export class LocalPerformanceRepository implements PerformanceRepository {
  constructor(private readonly store: LocalStore = localStore) {}

  async updateIndicatorResult(resultId: string, patch: Partial<IndicatorResult>): Promise<Result<IndicatorResult>> {
    let saved: IndicatorResult | null = null;
    this.store.update((prev) => ({
      ...prev,
      indicatorResults: prev.indicatorResults.map((r) => {
        if (r.id !== resultId) return r;
        saved = { ...r, ...patch, updatedAt: new Date().toISOString() };
        return saved;
      }),
    }));
    return saved ? ok(saved) : err('validation/invalid-input', 'Indicador não encontrado.');
  }

  async createVisitReport(input: VisitReportInput, createdBy: string): Promise<Result<VisitReport>> {
    const report: VisitReport = { ...input, id: makeId('VIS'), createdAt: new Date().toISOString(), createdBy };
    this.store.update((prev) => ({ ...prev, visitReports: [report, ...prev.visitReports] }));
    return ok(report);
  }
}

export class SupabasePerformanceRepository implements PerformanceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async updateIndicatorResult(resultId: string, patch: Partial<IndicatorResult>): Promise<Result<IndicatorResult>> {
    const { data, error } = await this.client.rpc('update_indicator_result', { p_result_id: resultId, p_patch: patch });
    return error ? err(new AppError('network/unavailable', 'Falha ao salvar o indicador.', { cause: error })) : ok(data as IndicatorResult);
  }

  async createVisitReport(input: VisitReportInput, createdBy: string): Promise<Result<VisitReport>> {
    const { data, error } = await this.client.rpc('create_visit_report', { p_input: input, p_created_by: createdBy });
    return error ? err(new AppError('network/unavailable', 'Falha ao salvar o relatório.', { cause: error })) : ok(data as VisitReport);
  }
}
