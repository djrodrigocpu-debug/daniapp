/**
 * Fontes canônicas da GESTÃO ASSISTIDA por modo — última ocorrência conhecida
 * da classe "entidade corporativa real resolvida no store de demonstração".
 *
 * Antes: `usePerformance` lia `indicatorDefinitions`, `indicatorResults`,
 * `actionPlans` e `visitReports` do `localStore` — o seed de demonstração,
 * nunca populado em modo corporativo. Resultado, plano e visita reais gravados
 * no servidor simplesmente não existiam para a tela.
 *
 * Aqui provamos que cada modo consulta a própria fonte, por chave canônica,
 * com UMA consulta por coleção — e que o catálogo vazio não produz dado falso.
 *
 * Dados 100% SINTÉTICOS (§23).
 */
import { describe, it, expect } from 'vitest';
import {
  LocalPerformanceRepository,
  SupabasePerformanceRepository,
  toIndicatorDefinition,
  toIndicatorResult,
  toVisitReport,
} from './PerformanceRepository';
import { LocalStore } from '../store/localStore';
import { AdminIndicator, AppData, IndicatorDefinition, IndicatorResult, VisitReport } from '../../types';

const OP_UUID = '00000000-0000-0000-0000-0000000097a1';
const IND_UUID = '00000000-0000-0000-0000-0000000097b1';

const DEF_SINT: IndicatorDefinition = {
  id: IND_UUID,
  title: 'Indicador sintetico',
  category: 'Processo',
  unit: '%',
  direction: 'higher_better',
  defaultTarget: 50,
  yellowTolerance: 10,
  weight: 3,
  diagnosticOptions: ['Opcao sintetica'],
};

const RES_SINT: IndicatorResult = {
  id: '00000000-0000-0000-0000-0000000097c1',
  operationId: OP_UUID,
  indicatorId: IND_UUID,
  period: '2026-07',
  target: 50,
  actual: 40,
  previousActual: 35,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const VIS_SINT: VisitReport = {
  id: '00000000-0000-0000-0000-0000000097d1',
  operationId: OP_UUID,
  createdAt: '2026-07-01T00:00:00.000Z',
  createdBy: '00000000-0000-0000-0000-0000000097e1',
  objective: 'Objetivo sintetico',
  summary: 'Resumo sintetico',
  criticalIndicators: [],
  actionPlanIds: [],
  nextReviewDate: '2026-07-15',
};

function storeCom(over: Partial<AppData>): LocalStore {
  const vazio = {
    users: [], operations: [], evaluations: [], actionPlans: [], evidences: [],
    indicatorDefinitions: [], indicatorResults: [], visitReports: [],
  } as unknown as AppData;
  return new LocalStore({ ...vazio, ...over }, `@teste:${Math.random()}`);
}

/** Cliente Supabase mínimo: registra tabela/colunas consultadas. */
function fakeClient(porTabela: Record<string, unknown[]>, erroEm?: string) {
  const calls: Array<{ table: string; columns: string }> = [];
  const builder = (table: string) => {
    const resultado = () =>
      erroEm === table
        ? { data: null, error: { message: 'falha de rede sintetica' } }
        : { data: porTabela[table] ?? [], error: null };
    const chain: Record<string, unknown> = {
      select: (columns: string) => { calls[calls.length - 1].columns = columns; return chain; },
      order: () => chain,
      eq: () => chain,
      then: (resolve: (v: unknown) => unknown) => resolve(resultado()),
    };
    calls.push({ table, columns: '' });
    return chain;
  };
  return { client: { from: builder } as never, calls };
}

describe('4 — modo demonstração continua lendo o store local', () => {
  it('as três coleções vêm do store, sem rede', async () => {
    const repo = new LocalPerformanceRepository(
      storeCom({ indicatorDefinitions: [DEF_SINT], indicatorResults: [RES_SINT], visitReports: [VIS_SINT] }),
    );
    const [defs, res, vis] = await Promise.all([
      repo.listIndicatorDefinitions(), repo.listIndicatorResults(), repo.listVisitReports(),
    ]);
    expect(defs.ok && defs.value[0].id).toBe(IND_UUID);
    expect(res.ok && res.value[0].id).toBe(RES_SINT.id);
    expect(vis.ok && vis.value[0].id).toBe(VIS_SINT.id);
    // O catálogo de demonstração conserva categoria e opções de diagnóstico.
    expect(defs.ok && defs.value[0].category).toBe('Processo');
    expect(defs.ok && defs.value[0].diagnosticOptions).toHaveLength(1);
  });

  it('createVisitReport e updateIndicatorResult continuam persistindo no store', async () => {
    const store = storeCom({ indicatorResults: [RES_SINT] });
    const repo = new LocalPerformanceRepository(store);
    const salvo = await repo.updateIndicatorResult(RES_SINT.id, { actual: 48 });
    expect(salvo.ok && salvo.value.actual).toBe(48);
    const criado = await repo.createVisitReport(
      { operationId: OP_UUID, objective: 'o', summary: 's', criticalIndicators: [], actionPlanIds: [], nextReviewDate: '2026-08-01' },
      'U-SINT',
    );
    expect(criado.ok).toBe(true);
    expect(store.getSnapshot().visitReports).toHaveLength(1);
  });
});

describe('1/3/6/8/14 — modo corporativo consulta o servidor, uma vez por coleção', () => {
  it('resultados vêm de indicator_results e são associados por UUID canônico', async () => {
    const { client, calls } = fakeClient({
      indicator_results: [{
        id: RES_SINT.id, operation_id: OP_UUID, indicator_id: IND_UUID, period: '2026-07',
        target: 50, actual: 40, previous_actual: 35, diagnosis: null, observation: null,
        updated_at: RES_SINT.updatedAt,
      }],
    });
    const res = await new SupabasePerformanceRepository(client).listIndicatorResults();
    expect(calls.map((c) => c.table)).toEqual(['indicator_results']);
    expect(res.ok && res.value[0].operationId).toBe(OP_UUID);
    expect(res.ok && res.value[0].indicatorId).toBe(IND_UUID);
    // Nenhuma busca por nome/texto: as colunas pedidas são as chaves canônicas.
    expect(calls[0].columns).toContain('operation_id');
    expect(calls[0].columns).toContain('indicator_id');
    expect(calls[0].columns).not.toContain('name');
  });

  it('visitas vêm de visit_reports com vínculo canônico por operação', async () => {
    const { client, calls } = fakeClient({
      visit_reports: [{
        id: VIS_SINT.id, operation_id: OP_UUID, objective: 'o', summary: 's',
        critical_indicators: null, action_plan_ids: null, next_review_date: '2026-07-15',
        created_at: VIS_SINT.createdAt, created_by: VIS_SINT.createdBy,
      }],
    });
    const res = await new SupabasePerformanceRepository(client).listVisitReports();
    expect(calls.map((c) => c.table)).toEqual(['visit_reports']);
    expect(res.ok && res.value[0].operationId).toBe(OP_UUID);
    // Arrays nulos no servidor viram vazios — nunca `undefined` na tela.
    expect(res.ok && res.value[0].criticalIndicators).toEqual([]);
  });

  it('o catálogo vem de ui_indicators na versão vigente, sem inventar categoria', async () => {
    const { client, calls } = fakeClient({
      ui_indicators: [{
        id: IND_UUID, code: 'IND-SINT', name: 'Indicador sintetico', lifecycle: 'active',
        createdAt: '2026-01-01T00:00:00.000Z', usageCount: 0,
        versions: [
          { id: 'v1', versionNumber: 1, unit: '%', direction: 'higher_better', target: 10, yellowTolerance: 1, weight: 1, effectiveFrom: '2026-01-01' },
          { id: 'v2', versionNumber: 2, unit: 'R$', direction: 'lower_better', target: 50, yellowTolerance: 10, weight: 3, effectiveFrom: '2026-02-01' },
        ],
      }],
    });
    const res = await new SupabasePerformanceRepository(client).listIndicatorDefinitions();
    expect(calls.map((c) => c.table)).toEqual(['ui_indicators']);
    expect(res.ok && res.value).toHaveLength(1);
    if (!res.ok) return;
    // Versão VIGENTE (maior versionNumber), não a primeira.
    expect(res.value[0]).toMatchObject({ id: IND_UUID, unit: 'R$', direction: 'lower_better', defaultTarget: 50, yellowTolerance: 10, weight: 3 });
    // Sem coluna no servidor: ausente/vazio em vez de valor inventado.
    expect(res.value[0].category).toBeUndefined();
    expect(res.value[0].diagnosticOptions).toEqual([]);
  });

  it('9 — catálogo vazio devolve lista vazia, nunca definição sintetizada', async () => {
    const { client } = fakeClient({ ui_indicators: [] });
    const res = await new SupabasePerformanceRepository(client).listIndicatorDefinitions();
    expect(res.ok && res.value).toEqual([]);
  });

  it('11 — erro de rede/RLS vira falha explícita, não coleção vazia', async () => {
    const { client } = fakeClient({ indicator_results: [] }, 'indicator_results');
    const res = await new SupabasePerformanceRepository(client).listIndicatorResults();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('network/unavailable');
  });
});

describe('saveIndicatorResult — criação/atualização de resultado (Fatia 6C)', () => {
  it('modo demonstração: cria o PRIMEIRO resultado no store e depois atualiza sem duplicar', async () => {
    const store = storeCom({ indicatorDefinitions: [DEF_SINT] });
    const repo = new LocalPerformanceRepository(store);

    const criado = await repo.saveIndicatorResult({ operationId: OP_UUID, indicatorId: IND_UUID, period: '2026-07', actual: 42.5 });
    expect(criado.ok && criado.value.actual).toBe(42.5);
    expect(criado.ok && criado.value.target).toBe(DEF_SINT.defaultTarget); // meta ausente = meta da definição
    expect(store.getSnapshot().indicatorResults).toHaveLength(1);

    const atualizado = await repo.saveIndicatorResult({ operationId: OP_UUID, indicatorId: IND_UUID, period: '2026-07', actual: 55, target: 60 });
    expect(atualizado.ok && atualizado.value.actual).toBe(55);
    expect(atualizado.ok && atualizado.value.previousActual).toBe(42.5);
    expect(store.getSnapshot().indicatorResults).toHaveLength(1); // atualizou, não duplicou
  });

  it('ausência de resultado não vira zero: valor NaN/não finito é recusado nos DOIS modos', async () => {
    const local = new LocalPerformanceRepository(storeCom({ indicatorDefinitions: [DEF_SINT] }));
    const localNaN = await local.saveIndicatorResult({ operationId: OP_UUID, indicatorId: IND_UUID, actual: Number.NaN });
    expect(localNaN.ok).toBe(false);

    let chamouRpc = false;
    const client = { rpc: () => { chamouRpc = true; return Promise.resolve({ data: null, error: null }); } } as never;
    const remoto = new SupabasePerformanceRepository(client);
    const remotoNaN = await remoto.saveIndicatorResult({ operationId: OP_UUID, indicatorId: IND_UUID, actual: Number.NaN });
    expect(remotoNaN.ok).toBe(false);
    const metaNaN = await remoto.saveIndicatorResult({ operationId: OP_UUID, indicatorId: IND_UUID, actual: 1, target: Number.POSITIVE_INFINITY });
    expect(metaNaN.ok).toBe(false);
    expect(chamouRpc).toBe(false); // valor inválido nunca chega ao servidor
  });

  it('modo corporativo: chama a RPC save_indicator_result com UUIDs canônicos', async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const dto = { id: RES_SINT.id, operationId: OP_UUID, indicatorId: IND_UUID, period: '2026-07', target: 50, actual: 40, previousActual: 0, updatedAt: RES_SINT.updatedAt };
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return Promise.resolve({ data: dto, error: null }); },
    } as never;
    const res = await new SupabasePerformanceRepository(client).saveIndicatorResult({ operationId: OP_UUID, indicatorId: IND_UUID, period: '2026-07', actual: 40, target: 50 });
    expect(res.ok && res.value.id).toBe(RES_SINT.id);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('save_indicator_result');
    const input = rpcCalls[0].args.p_input as Record<string, unknown>;
    expect(input.operationId).toBe(OP_UUID);
    expect(input.indicatorId).toBe(IND_UUID);
    expect(input.actual).toBe(40);
  });

  it('erro do servidor vira falha explícita, nunca sucesso silencioso', async () => {
    const client = { rpc: () => Promise.resolve({ data: null, error: { message: 'falha sintetica' } }) } as never;
    const res = await new SupabasePerformanceRepository(client).saveIndicatorResult({ operationId: OP_UUID, indicatorId: IND_UUID, actual: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('network/unavailable');
  });
});

describe('mapeamentos — contrato servidor → tela', () => {
  it('indicador sem versão é descartado em vez de virar meta zero', () => {
    const semVersao = { id: IND_UUID, code: 'IND-SINT', name: 'x', lifecycle: 'active', createdAt: '', usageCount: 0, versions: [] } as AdminIndicator;
    expect(toIndicatorDefinition(semVersao)).toBeNull();
  });

  it('numérico textual do PostgREST vira número', () => {
    const mapeado = toIndicatorResult({
      id: RES_SINT.id, operation_id: OP_UUID, indicator_id: IND_UUID, period: '2026-07',
      target: '50.0000', actual: '40.5000', previous_actual: '35.0000',
      diagnosis: null, observation: null, updated_at: RES_SINT.updatedAt,
    } as never);
    expect(mapeado.target).toBe(50);
    expect(mapeado.actual).toBe(40.5);
    expect(mapeado.diagnosis).toBeUndefined();
  });

  it('data de revisão ausente não vira "null" impresso na tela', () => {
    const mapeado = toVisitReport({
      id: VIS_SINT.id, operation_id: OP_UUID, objective: '', summary: '',
      critical_indicators: [], action_plan_ids: [], next_review_date: null,
      created_at: VIS_SINT.createdAt, created_by: VIS_SINT.createdBy,
    } as never);
    expect(mapeado.nextReviewDate).toBe('');
  });
});
