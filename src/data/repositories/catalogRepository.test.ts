/**
 * Adapters do catálogo com escopo — por MOCK do SupabaseClient.
 *
 * Estes testes NÃO provam que o servidor obedece: isso está provado contra
 * Postgres real em `src/db/catalog_*.integration.test.ts`. Aqui se prova o
 * CONTRATO que o cliente emite (qual RPC, com quais argumentos) e a tradução da
 * resposta — mais o compromisso do adapter de demonstração de não fingir.
 *
 * Dados 100% sintéticos (§23).
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CATALOG_UNAVAILABLE_MESSAGE,
  SupabaseCatalogRepository,
  UnavailableCatalogRepository,
} from './CatalogRepository';
import { isErr, isOk } from '../../domain/errors/result';

interface RpcCall { name: string; params: Record<string, unknown> }

function queryResult(result: { data?: unknown; error?: unknown }) {
  const thenable = {
    order: () => thenable,
    eq: () => thenable,
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: result.data ?? null, error: result.error ?? null }),
  };
  return thenable;
}

function fakeClient(options: {
  tables?: Record<string, { data?: unknown; error?: unknown }>;
  rpc?: Record<string, (params: Record<string, unknown>) => { data?: unknown; error?: unknown }>;
}) {
  const rpcCalls: RpcCall[] = [];
  const client = {
    from: (table: string) => ({ select: () => queryResult(options.tables?.[table] ?? { data: [] }) }),
    rpc(name: string, params: Record<string, unknown>) {
      rpcCalls.push({ name, params });
      const handler = options.rpc?.[name];
      return queryResult(handler ? handler(params) : { error: { message: `RPC ${name} não mockada` } });
    },
  };
  return { client: client as unknown as SupabaseClient, rpcCalls };
}

describe('SupabaseCatalogRepository — contrato emitido', () => {
  it('tema global vai com região NULA, mesmo se a tela informar uma', async () => {
    const { client, rpcCalls } = fakeClient({
      rpc: { catalog_create_theme: () => ({ data: { id: 't1', code: 'TEMA-1', scopeKind: 'global', regionId: null, lifecycle: 'draft', versions: [] } }) },
    });
    const repo = new SupabaseCatalogRepository(client);

    await repo.createTheme('global', 'regiao-1', 'TEMA-1', { name: 'Atendimento' });

    expect(rpcCalls[0].name).toBe('catalog_create_theme');
    expect(rpcCalls[0].params.p_region_id).toBeNull();
    expect(rpcCalls[0].params.p_scope).toBe('global');
  });

  it('tema regional leva a região informada', async () => {
    const { client, rpcCalls } = fakeClient({
      rpc: { catalog_create_theme: () => ({ data: { id: 't1', code: 'T', scopeKind: 'regional', regionId: 'regiao-1', lifecycle: 'draft', versions: [] } }) },
    });
    await new SupabaseCatalogRepository(client).createTheme('regional', 'regiao-1', 'T', { name: 'x' });
    expect(rpcCalls[0].params.p_region_id).toBe('regiao-1');
  });

  it('a mensagem do servidor chega CRUA ao operador', async () => {
    const { client } = fakeClient({
      rpc: {
        catalog_publish_regional_config_version: () => ({
          error: { message: 'auditoria mensal exige ao menos um criterio publicado e ativo para este indicador na regiao' },
        }),
      },
    });
    const r = await new SupabaseCatalogRepository(client).publishRegionalConfigVersion('v1');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.message).toMatch(/exige ao menos um criterio/);
  });

  it('lê a tabela em snake_case e entrega o domínio em camelCase', async () => {
    const { client } = fakeClient({
      tables: {
        indicator_definitions: {
          data: [{
            id: 'i1', code: 'IND-001', name: 'Conversão',
            scope_kind: 'regional', region_id: 'regiao-1', lifecycle: 'active',
            indicator_versions: [{
              id: 'v2', version_number: 2, name: null, description: null, unit: '%',
              direction: 'higher_better', status: 'published',
              effective_from: '2026-01-01', effective_to: null,
            }, {
              id: 'v1', version_number: 1, name: 'Nome antigo', description: null, unit: '%',
              direction: 'higher_better', status: 'published',
              effective_from: '2025-01-01', effective_to: '2026-01-01',
            }],
          }],
        },
      },
    });
    const r = await new SupabaseCatalogRepository(client).listIndicators();
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const ind = r.value[0];
    expect(ind.scope).toEqual({ kind: 'regional', regionId: 'regiao-1' });
    // Versões chegam ordenadas, não na ordem que o servidor devolveu.
    expect(ind.versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    // Versão sem nome próprio herda o rótulo da definição (decisão D-C).
    expect(ind.versions[1].name).toBe('Conversão');
    expect(ind.versions[0].name).toBe('Nome antigo');
    expect(ind.versions[0].validity).toEqual({ from: '2025-01-01', to: '2026-01-01' });
    expect(ind.versions[1].validity.to).toBeNull();
  });

  it('converte números que o PostgREST devolve como texto', async () => {
    const { client } = fakeClient({
      rpc: {
        catalog_save_regional_config_draft: () => ({
          data: {
            id: 'c1', regionId: 'r1', indicatorDefinitionId: 'i1', indicatorCode: 'IND-001',
            versions: [{
              id: 'cv1', versionNumber: 1, indicatorVersionId: 'v1', themeVersionId: 'tv1',
              sortOrder: 3, target: '90.0000', tolerance: '5.0000', weight: '30.00',
              active: true, includeInAssistedManagement: true, includeInMonthlyAudit: false,
              status: 'draft', effectiveFrom: '2026-08-01', effectiveTo: null,
            }],
            criteria: [],
          },
        }),
      },
    });
    const r = await new SupabaseCatalogRepository(client)
      .saveRegionalConfigDraft('r1', 'i1', { indicatorVersionId: 'v1', themeVersionId: 'tv1', target: 90 });
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const v = r.value.versions[0];
    expect(v.target).toBe(90);
    expect(v.tolerance).toBe(5);
    expect(v.weight).toBe(30);
    expect(typeof v.target).toBe('number');
  });

  it('os defaults do servidor sobrevivem à tradução quando o payload é omisso', async () => {
    const { client } = fakeClient({
      rpc: {
        catalog_save_regional_config_draft: () => ({
          data: {
            id: 'c1', regionId: 'r1', indicatorDefinitionId: 'i1', indicatorCode: 'IND-001',
            versions: [{
              id: 'cv1', versionNumber: 1, indicatorVersionId: 'v1', themeVersionId: 'tv1',
              sortOrder: 0, target: 0, tolerance: 0, weight: 1, active: true,
              include_in_assisted_management: true, include_in_monthly_audit: false,
              status: 'draft', effective_from: '2026-08-01', effective_to: null,
            }],
          },
        }),
      },
    });
    const r = await new SupabaseCatalogRepository(client)
      .saveRegionalConfigDraft('r1', 'i1', { indicatorVersionId: 'v1', themeVersionId: 'tv1', target: 0 });
    if (!isOk(r)) throw new Error('esperava sucesso');
    expect(r.value.versions[0].includeInAssistedManagement).toBe(true);
    expect(r.value.versions[0].includeInMonthlyAudit).toBe(false);
    expect(r.value.criteria).toEqual([]);
  });
});

describe('UnavailableCatalogRepository não finge', () => {
  const repo = new UnavailableCatalogRepository();

  it('recusa TODA operação, leitura inclusive, com o mesmo motivo', async () => {
    const chamadas = [
      repo.listRegions(),
      repo.listThemes(),
      repo.listIndicators(),
      repo.listRegionalConfigs('r1'),
      repo.createTheme('regional', 'r1', 'T', { name: 'x' }),
      repo.addThemeVersion('t1', { name: 'x' }),
      repo.publishThemeVersion('v1'),
      repo.setThemeLifecycle('t1', 'inactive'),
      repo.createIndicator('regional', 'r1', 'I', { name: 'x' }),
      repo.addIndicatorVersion('i1', { name: 'x' }),
      repo.publishIndicatorVersion('v1'),
      repo.setIndicatorLifecycle('i1', 'inactive'),
      repo.saveRegionalConfigDraft('r1', 'i1', { indicatorVersionId: 'v1', themeVersionId: 'tv1', target: 1 }),
      repo.publishRegionalConfigVersion('cv1'),
      repo.createCriterion('c1', 'CRIT', { question: 'q' }),
      repo.addCriterionVersion('cr1', { question: 'q' }),
      repo.publishCriterionVersion('crv1'),
      repo.setCriterionLifecycle('cr1', 'inactive'),
    ];

    // `Result<unknown>` porque a lista mistura retornos de tipos diferentes; o
    // que se afirma aqui é o mesmo para todos: recusa, com o mesmo motivo.
    const resultados: Array<{ ok: boolean }> = await Promise.all(chamadas);
    expect(resultados).toHaveLength(18);
    for (const r of resultados) {
      expect(isErr(r as never)).toBe(true);
      const erro = (r as { ok: false; error: { code: string; message: string } }).error;
      expect(erro.code).toBe('config/missing-env');
      expect(erro.message).toBe(CATALOG_UNAVAILABLE_MESSAGE);
    }
  });

  it('a recusa de LEITURA é o ponto: lista vazia diria "ainda não há temas"', async () => {
    const r = await repo.listThemes();
    expect(isOk(r)).toBe(false);
    expect(CATALOG_UNAVAILABLE_MESSAGE).toMatch(/ambiente corporativo/i);
    expect(CATALOG_UNAVAILABLE_MESSAGE).toMatch(/servidor/i);
  });
});
