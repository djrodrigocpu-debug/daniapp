/**
 * Adapters do painel gerencial — o que o cliente faz, e o que ele NÃO faz.
 *
 * Duas propriedades são medidas com um cliente Supabase falso:
 *
 *   1. **nenhuma leitura direta de tabela e nenhuma agregação no cliente.** Só
 *      RPC. Se um dia alguém trocar uma chamada por `from('evaluations')`, o
 *      teste cai;
 *   2. **`null` sobrevive à travessia.** É a diferença entre "sem dado" e "nota
 *      zero", e o adapter é exatamente o lugar onde ela costuma morrer, porque
 *      `Number(null)` é `0`.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DASHBOARD_UNAVAILABLE_MESSAGE, SupabaseDashboardRepository, UnavailableDashboardRepository,
} from './DashboardRepository';

const AGREGADOS = {
  contractVersion: '1.3.5-dashboard-1',
  generatedAt: '2026-08-02T00:00:00Z',
  today: '2026-08-02',
  filters: { operationIds: ['op-1'], resolvedOperationCount: '1', themeIds: [], statuses: [] },
  ruleProvenance: { monthlyProvisional: true },
  coverage: { partners: '2', partnersWithAssisted: '1', partnersWithMonthlyAudit: '0' },
  assisted: {
    cycles: { total: '3', closed: '1', draft: '2' },
    entryStatusCounts: { conforme: '5', atencao: '1', nao_conforme: '1', sem_dado: '0' },
    byIndicator: [{ indicatorCode: 'IND-1', indicatorName: 'Um', themeCode: 'T', conforme: '2', atencao: '0', naoConforme: '1', semDado: '0' }],
    evolution: [{ weekStartDate: '2026-07-06', conforme: '2', atencao: '0', naoConforme: '1', semDado: '0' }],
  },
  monthlyAudit: {
    audits: { total: '1', draft: '0', submitted: '0', returned: '0', approved: '1' },
    answerStatusCounts: { conforme: '2', nao_conforme: '1', nao_aplicavel: '0', nao_avaliado: '0' },
    byCompetence: [{ competence: '2026-07', audits: '1', conforme: '2', naoConforme: '1', naoAplicavel: '0', naoAvaliado: '0' }],
  },
  actionPlans: {
    byStatus: { open: '2', in_progress: '0', waiting_partner: '0', blocked: '0', done: '0', validated: '0', cancelled_justified: '0' },
    bySource: { legacy: '0', assisted: '1', monthly_audit: '1' },
    overdue: '1', total: '2',
  },
  partners: [{
    operationId: 'op-1', partnerName: 'Parceiro A',
    assisted: { conforme: '2', atencao: '0', naoConforme: '1', semDado: '0' },
    monthlyAudit: { conforme: '2', naoConforme: '1', naoAplicavel: '0', naoAvaliado: '0' },
    openPlans: '2',
  }],
};

const MATRIZ = {
  contractVersion: '1.3.5-matrix-1',
  generatedAt: '2026-08-02T00:00:00Z',
  filters: { operationIds: ['op-1'], resolvedOperationCount: 1 },
  ruleProvenance: { monthlyProvisional: true },
  quadrantLabels: { healthy: 'Saudavel' },
  entries: [
    {
      operationId: 'op-1', partnerName: 'Parceiro A', regionId: 'reg-1',
      performance: { axis: 'critical', score: '33.33', conforme: '1', atencao: '1', naoConforme: '1', semDado: '0' },
      process: { axis: 'green', score: '100', trafficLight: 'green', auditsConsidered: '1' },
      quadrant: 'ineffective_routine',
      dataSufficiency: { sufficient: true, reasons: [] },
      weighting: { configured: true, regionId: 'reg-1', assistedWeight: '60', auditWeight: '40', versionNumber: 1, id: 'w-1' },
      weightedIndex: { value: '60', assistedComponent: '33.33', auditComponent: '100', weightingVersionId: 'w-1', provisional: true, provisionalReason: 'x' },
    },
    {
      // Parceiro SEM os dois eixos: `score` nulo, quadrante nulo, índice nulo.
      operationId: 'op-2', partnerName: 'Parceiro B', regionId: 'reg-1',
      performance: { axis: 'no_measurement', score: null, conforme: '0', atencao: '0', naoConforme: '0', semDado: '0' },
      process: { axis: 'no_audit', score: null, trafficLight: 'not_evaluated', auditsConsidered: '0' },
      quadrant: null,
      dataSufficiency: { sufficient: false, reasons: ['missing_audit', 'missing_measurement'] },
      weighting: { configured: false, regionId: 'reg-1', reason: 'Ponderacao nao configurada' },
      weightedIndex: null,
    },
  ],
};

function clienteFalso(resposta: Record<string, unknown>) {
  const chamadas: Array<{ fn: string; args: unknown }> = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: unknown) => {
      chamadas.push({ fn, args });
      if (resposta[fn] === undefined) return { data: null, error: { message: `sem stub para ${fn}` } };
      return { data: resposta[fn], error: null };
    }),
    from: vi.fn(() => { throw new Error('o adapter NAO pode ler tabela direto'); }),
  };
  return { client, chamadas };
}

describe('SupabaseDashboardRepository — só RPC, nunca tabela', () => {
  it('as cinco operações chamam exatamente as cinco RPCs de 0047/0048', async () => {
    const { client, chamadas } = clienteFalso({
      get_dashboard_aggregates: AGREGADOS,
      get_matrix_dataset: MATRIZ,
      get_weighting_status: { contractVersion: 'w', regions: [] },
      catalog_save_region_weighting_draft: { id: 'w-1', regionId: 'r', versionNumber: 1, assistedWeight: '60', auditWeight: '40', effectiveFrom: '2026-01-01', effectiveTo: null, status: 'draft', createdBy: null, createdAt: 'x', publishedBy: null, publishedAt: null },
      catalog_publish_region_weighting: { id: 'w-1', regionId: 'r', versionNumber: 1, assistedWeight: '60', auditWeight: '40', effectiveFrom: '2026-01-01', effectiveTo: null, status: 'published', createdBy: null, createdAt: 'x', publishedBy: 'u', publishedAt: 'y' },
    });
    const repo = new SupabaseDashboardRepository(client as never);

    await repo.getAggregates();
    await repo.getMatrix();
    await repo.getWeightingStatus();
    await repo.saveWeightingDraft('reg-1', { assistedWeight: 60, auditWeight: 40 });
    await repo.publishWeighting('w-1');

    expect(chamadas.map((c) => c.fn)).toEqual([
      'get_dashboard_aggregates', 'get_matrix_dataset', 'get_weighting_status',
      'catalog_save_region_weighting_draft', 'catalog_publish_region_weighting',
    ]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('os filtros vão NORMALIZADOS: lista vazia não vira "nenhum resultado"', async () => {
    const { client, chamadas } = clienteFalso({ get_dashboard_aggregates: AGREGADOS });
    const repo = new SupabaseDashboardRepository(client as never);
    await repo.getAggregates({ periodFrom: '', operationIds: [], statuses: ['conforme'] });
    expect((chamadas[0].args as { p_filters: unknown }).p_filters).toEqual({ statuses: ['conforme'] });
  });

  it('contagens em string viram número — e nenhuma vira NaN', async () => {
    const { client } = clienteFalso({ get_dashboard_aggregates: AGREGADOS });
    const repo = new SupabaseDashboardRepository(client as never);
    const r = await repo.getAggregates();
    if (!r.ok) throw new Error('esperava sucesso');

    expect(r.value.coverage).toEqual({ partners: 2, partnersWithAssisted: 1, partnersWithMonthlyAudit: 0 });
    expect(r.value.assisted.entryStatusCounts.conforme).toBe(5);
    expect(r.value.actionPlans.overdue).toBe(1);
    expect(r.value.partners[0].openPlans).toBe(2);
    expect(r.value.filters.resolvedOperationCount).toBe(1);
    for (const v of Object.values(r.value.assisted.entryStatusCounts)) {
      expect(Number.isNaN(v)).toBe(false);
    }
  });

  it('`null` SOBREVIVE: sem dado não vira nota zero', async () => {
    const { client } = clienteFalso({ get_matrix_dataset: MATRIZ });
    const repo = new SupabaseDashboardRepository(client as never);
    const r = await repo.getMatrix();
    if (!r.ok) throw new Error('esperava sucesso');

    const b = r.value.entries[1];
    expect(b.performance.score).toBeNull();
    expect(b.process.score).toBeNull();
    expect(b.quadrant).toBeNull();
    expect(b.weightedIndex).toBeNull();
    expect(b.weighting.configured).toBe(false);
    expect(b.dataSufficiency.reasons).toEqual(['missing_audit', 'missing_measurement']);
  });

  it('o índice e os pesos chegam numéricos, com a versão da ponderação', async () => {
    const { client } = clienteFalso({ get_matrix_dataset: MATRIZ });
    const repo = new SupabaseDashboardRepository(client as never);
    const r = await repo.getMatrix();
    if (!r.ok) throw new Error('esperava sucesso');

    const a = r.value.entries[0];
    expect(a.weightedIndex).toEqual({
      value: 60, assistedComponent: 33.33, auditComponent: 100,
      weightingVersionId: 'w-1', provisional: true, provisionalReason: 'x',
    });
    expect(a.weighting.assistedWeight).toBe(60);
    expect(a.weighting.auditWeight).toBe(40);
  });

  it('a mensagem do servidor é repassada CRUA — ela é o que resolve o problema', async () => {
    const client = {
      rpc: vi.fn(async () => ({ data: null, error: { message: 'os pesos devem somar 100: recebido 99' } })),
      from: vi.fn(),
    };
    const repo = new SupabaseDashboardRepository(client as never);
    const r = await repo.saveWeightingDraft('reg-1', { assistedWeight: 60, auditWeight: 39 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('os pesos devem somar 100: recebido 99');
  });
});

describe('UnavailableDashboardRepository — recusa honesta, nunca simulação', () => {
  it('as cinco operações recusam, e a frase diz por quê', async () => {
    const repo = new UnavailableDashboardRepository();
    const rs = await Promise.all([
      repo.getAggregates(), repo.getMatrix(), repo.getWeightingStatus(),
      repo.saveWeightingDraft('r', { assistedWeight: 60, auditWeight: 40 }),
      repo.publishWeighting('w'),
    ]);
    for (const r of rs) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toBe(DASHBOARD_UNAVAILABLE_MESSAGE);
    }
  });

  it('a frase nomeia o que o servidor faz e o modo demonstração não tem', () => {
    expect(DASHBOARD_UNAVAILABLE_MESSAGE).toContain('escopo por papel');
    expect(DASHBOARD_UNAVAILABLE_MESSAGE).toContain('ponderação regional publicada');
    expect(DASHBOARD_UNAVAILABLE_MESSAGE).toContain('quadrantes');
    expect(DASHBOARD_UNAVAILABLE_MESSAGE).toContain('"zero"');
    // NÃO promete lista vazia nem número algum — seria fingir que há retrato.
    expect(DASHBOARD_UNAVAILABLE_MESSAGE).not.toMatch(/\b0\b|nenhum dado encontrado/);
  });
});
