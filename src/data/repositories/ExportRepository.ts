/**
 * Adapters da EXPORTAÇÃO (migration 0049).
 *
 * `SupabaseExportRepository`    — REAL REMOTO. Uma RPC, nenhuma leitura direta.
 * `UnavailableExportRepository` — modo demonstração. Recusa, e diz por quê.
 *
 * POR QUE O SEGUNDO RECUSA. Um arquivo é a coisa que sai do aplicativo e passa a
 * circular por conta própria. Gerar localmente um `.xlsx` com números que
 * ninguém autorizou é pior do que não gerar arquivo nenhum: o arquivo sobrevive
 * ao contexto em que foi feito, e quem o abrir amanhã não saberá que era demo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { ExportRepository } from '../../domain/repositories/exporting';
import { normalizeFilters } from '../../domain/dashboard/policy135';
import { DashboardFilters } from '../../domain/dashboard/types135';
import { ExportDataset, ExportModule } from '../../domain/exporting/dataset';

const fail = (fallback: string, cause: { message?: string } | null): AppError =>
  new AppError('network/unavailable', cause?.message || fallback, { cause, severity: 'medium' });

/**
 * Numéricos de PostgreSQL podem chegar como string. A coerção acontece AQUI,
 * guiada pelo `type` declarado pelo servidor — e `null` sobrevive, porque é a
 * diferença entre "sem dado" e "zero".
 */
function coerce(raw: Record<string, unknown>, columns: ExportDataset['columns']) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const c of columns) {
    const v = raw[c.key];
    if (v === null || v === undefined) { out[c.key] = null; continue; }
    if (c.type === 'number') {
      const n = Number(v);
      out[c.key] = Number.isFinite(n) ? n : null;
    } else if (c.type === 'boolean') {
      out[c.key] = v === true || v === 'true' || v === 1 || v === '1';
    } else {
      out[c.key] = String(v);
    }
  }
  return out;
}

export class SupabaseExportRepository implements ExportRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getDataset(
    module: ExportModule, filters: DashboardFilters = {},
  ): Promise<Result<ExportDataset>> {
    const { data, error } = await this.client.rpc('export_dataset', {
      p_module: module,
      p_filters: normalizeFilters(filters),
    });
    if (error) return err(fail('Falha ao gerar a exportação.', error));

    const raw = data as Record<string, any>;
    const columns = (raw.columns ?? []) as ExportDataset['columns'];
    return ok({
      contractVersion: raw.contractVersion,
      module: raw.module,
      generatedAt: raw.generatedAt,
      today: raw.today,
      requestedBy: raw.requestedBy ?? '',
      scope: { operationCount: Number(raw.scope?.operationCount ?? 0) },
      filters: raw.filters ?? {},
      ruleProvenance: raw.ruleProvenance ?? {},
      columns,
      rowCount: Number(raw.rowCount ?? 0),
      rows: ((raw.rows ?? []) as Array<Record<string, unknown>>).map((r) => coerce(r, columns)),
      ...(raw.summary
        ? {
            summary: {
              label: raw.summary.label,
              a06: raw.summary.a06,
              partners: Number(raw.summary.partners ?? 0),
              partnersWithAssisted: Number(raw.summary.partnersWithAssisted ?? 0),
              partnersWithMonthlyAudit: Number(raw.summary.partnersWithMonthlyAudit ?? 0),
              plansByStatus: Object.fromEntries(
                Object.entries(raw.summary.plansByStatus ?? {}).map(([k, v]) => [k, Number(v)]),
              ),
              plansOverdue: Number(raw.summary.plansOverdue ?? 0),
            },
          }
        : {}),
    });
  }
}

export const EXPORT_UNAVAILABLE_MESSAGE =
  'A exportação existe apenas no ambiente corporativo. O escopo do arquivo, os filtros e a '
  + 'autorização são resolvidos pelo servidor — um arquivo gerado localmente sairia do aplicativo '
  + 'com números que ninguém autorizou, e sobreviveria ao contexto em que foi feito.';

export class UnavailableExportRepository implements ExportRepository {
  getDataset(_m: ExportModule, _f?: DashboardFilters): Promise<Result<ExportDataset>> {
    return Promise.resolve(err(new AppError('config/missing-env', EXPORT_UNAVAILABLE_MESSAGE, {
      severity: 'low',
    })));
  }
}
