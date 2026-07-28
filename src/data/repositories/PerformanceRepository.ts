/**
 * Repositório da Gestão Assistida / Visita produtiva (Masterplan §7). Cuida do
 * catálogo de indicadores, dos resultados por operação e dos relatórios de
 * visita (retroalimentação). Planos de ação reusam o EvaluationsRepository.
 * Adapters Local/Supabase.
 *
 * POR QUE AS LEITURAS EXISTEM AQUI: até a fatia 6B o `usePerformance` lia
 * indicadores, resultados e relatórios direto do `localStore` — o store de
 * demonstração, NUNCA populado em modo corporativo. É a mesma classe de defeito
 * já corrigida em operações, usuários, avaliações, planos e evidências: a lista
 * real vinha do Supabase e a agregação seguinte consultava o seed. Agora cada
 * coleção tem UMA consulta pelo repositório do modo vigente.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AdminIndicator, AdminIndicatorVersion, IndicatorDefinition, IndicatorResult, VisitReport } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { makeId } from '../../utils/ids';
import { LocalStore, localStore } from '../store/localStore';

export type VisitReportInput = Omit<VisitReport, 'id' | 'createdAt' | 'createdBy'>;

export interface PerformanceRepository {
  /** Catálogo de indicadores do modo vigente — UMA consulta, nada por card. */
  listIndicatorDefinitions(): Promise<Result<IndicatorDefinition[]>>;
  /** Resultados das operações visíveis ao escopo (a RLS filtra no servidor). */
  listIndicatorResults(): Promise<Result<IndicatorResult[]>>;
  /** Relatórios de visita das operações visíveis, mais recentes primeiro. */
  listVisitReports(): Promise<Result<VisitReport[]>>;
  updateIndicatorResult(resultId: string, patch: Partial<IndicatorResult>): Promise<Result<IndicatorResult>>;
  createVisitReport(input: VisitReportInput, createdBy: string): Promise<Result<VisitReport>>;
}

export class LocalPerformanceRepository implements PerformanceRepository {
  constructor(private readonly store: LocalStore = localStore) {}

  async listIndicatorDefinitions(): Promise<Result<IndicatorDefinition[]>> {
    return ok(this.store.getSnapshot().indicatorDefinitions);
  }

  async listIndicatorResults(): Promise<Result<IndicatorResult[]>> {
    return ok(this.store.getSnapshot().indicatorResults);
  }

  async listVisitReports(): Promise<Result<VisitReport[]>> {
    return ok(this.store.getSnapshot().visitReports);
  }

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

/** Linhas cruas de `public.indicator_results` e `public.visit_reports`. */
interface IndicatorResultRow {
  id: string;
  operation_id: string;
  indicator_id: string;
  period: string;
  target: number | string;
  actual: number | string;
  previous_actual: number | string;
  diagnosis: string | null;
  observation: string | null;
  updated_at: string;
}

interface VisitReportRow {
  id: string;
  operation_id: string;
  objective: string;
  summary: string;
  critical_indicators: string[] | null;
  action_plan_ids: string[] | null;
  next_review_date: string | null;
  created_at: string;
  created_by: string;
}

const INDICATOR_RESULT_COLUMNS =
  'id, operation_id, indicator_id, period, target, actual, previous_actual, diagnosis, observation, updated_at';
const VISIT_REPORT_COLUMNS =
  'id, operation_id, objective, summary, critical_indicators, action_plan_ids, next_review_date, created_at, created_by';

/**
 * `ui_indicators` (0005) entrega o indicador com as versões aninhadas; a Gestão
 * Assistida usa a versão VIGENTE — a de maior `versionNumber`.
 *
 * `category` e `diagnosticOptions` não existem no servidor: o catálogo
 * corporativo mora em `indicator_definitions` (código, nome, ciclo de vida) e
 * `indicator_versions` (unidade, direção, meta, tolerância, peso). Ficam
 * ausente/vazio em vez de receber valor inventado.
 */
export function toIndicatorDefinition(row: AdminIndicator): IndicatorDefinition | null {
  const current = (row.versions ?? []).reduce<AdminIndicatorVersion | null>(
    (best, version) => (!best || version.versionNumber > best.versionNumber ? version : best),
    null,
  );
  if (!current) return null;
  return {
    id: row.id,
    title: row.name,
    unit: current.unit,
    direction: current.direction,
    defaultTarget: Number(current.target),
    yellowTolerance: Number(current.yellowTolerance),
    weight: Number(current.weight),
    diagnosticOptions: [],
  };
}

export function toIndicatorResult(row: IndicatorResultRow): IndicatorResult {
  return {
    id: row.id,
    operationId: row.operation_id,
    indicatorId: row.indicator_id,
    period: row.period,
    target: Number(row.target),
    actual: Number(row.actual),
    previousActual: Number(row.previous_actual),
    diagnosis: row.diagnosis ?? undefined,
    observation: row.observation ?? undefined,
    updatedAt: row.updated_at,
  };
}

export function toVisitReport(row: VisitReportRow): VisitReport {
  return {
    id: row.id,
    operationId: row.operation_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    objective: row.objective,
    summary: row.summary,
    criticalIndicators: row.critical_indicators ?? [],
    actionPlanIds: row.action_plan_ids ?? [],
    nextReviewDate: row.next_review_date ?? '',
  };
}

export class SupabasePerformanceRepository implements PerformanceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listIndicatorDefinitions(): Promise<Result<IndicatorDefinition[]>> {
    const { data, error } = await this.client.from('ui_indicators').select('*').order('code');
    if (error) return err(new AppError('network/unavailable', 'Falha ao carregar os indicadores.', { cause: error }));
    const definitions = ((data ?? []) as AdminIndicator[])
      .map(toIndicatorDefinition)
      .filter((definition): definition is IndicatorDefinition => definition !== null);
    return ok(definitions);
  }

  async listIndicatorResults(): Promise<Result<IndicatorResult[]>> {
    // Tabela com RLS por `app.has_operation_access(operation_id)` e grant de
    // select para `authenticated` (0004) — o escopo é decidido pelo servidor.
    const { data, error } = await this.client.from('indicator_results').select(INDICATOR_RESULT_COLUMNS);
    if (error) {
      return err(new AppError('network/unavailable', 'Falha ao carregar os resultados dos indicadores.', { cause: error }));
    }
    return ok(((data ?? []) as unknown as IndicatorResultRow[]).map(toIndicatorResult));
  }

  async listVisitReports(): Promise<Result<VisitReport[]>> {
    const { data, error } = await this.client
      .from('visit_reports')
      .select(VISIT_REPORT_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) {
      return err(new AppError('network/unavailable', 'Falha ao carregar os relatórios de visita.', { cause: error }));
    }
    return ok(((data ?? []) as unknown as VisitReportRow[]).map(toVisitReport));
  }

  async updateIndicatorResult(resultId: string, patch: Partial<IndicatorResult>): Promise<Result<IndicatorResult>> {
    const { data, error } = await this.client.rpc('update_indicator_result', { p_result_id: resultId, p_patch: patch });
    return error ? err(new AppError('network/unavailable', 'Falha ao salvar o indicador.', { cause: error })) : ok(data as IndicatorResult);
  }

  async createVisitReport(input: VisitReportInput, createdBy: string): Promise<Result<VisitReport>> {
    const { data, error } = await this.client.rpc('create_visit_report', { p_input: input, p_created_by: createdBy });
    return error ? err(new AppError('network/unavailable', 'Falha ao salvar o relatório.', { cause: error })) : ok(data as VisitReport);
  }
}
