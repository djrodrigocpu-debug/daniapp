/**
 * Adapter da exportação — uma RPC, nenhuma tabela, e a coerção guiada pelo TIPO
 * que o servidor declarou.
 *
 * A propriedade mais importante é a mesma do painel: `null` sobrevive. Um
 * `Number(null)` distraído transformaria "sem dado" em `0` dentro de um arquivo
 * que vai circular por e-mail — e ninguém que o abrir amanhã terá como saber.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  EXPORT_UNAVAILABLE_MESSAGE, SupabaseExportRepository, UnavailableExportRepository,
} from './ExportRepository';

const RESPOSTA = {
  contractVersion: '1.3.5-export-1',
  module: 'summary',
  generatedAt: '2026-08-02T10:00:00Z',
  today: '2026-08-02',
  requestedBy: 'Admin Fic',
  scope: { operationCount: '2' },
  filters: { operationIds: ['op-1'], statuses: [] },
  ruleProvenance: { openDecisions: ['A-04', 'A-10', 'A-11'] },
  columns: [
    { key: 'partnerName', label: 'Parceiro AACE', type: 'text' },
    { key: 'performanceScore', label: 'Nota', type: 'number' },
    { key: 'dataSufficient', label: 'Suficiente', type: 'boolean' },
    { key: 'dueDate', label: 'Prazo', type: 'date' },
  ],
  rowCount: '2',
  rows: [
    { partnerName: 'Parceiro A', performanceScore: '33.33', dataSufficient: true, dueDate: '2026-07-06' },
    { partnerName: 'Parceiro B', performanceScore: null, dataSufficient: false, dueDate: null },
  ],
  // O servidor devolve contagens como STRING (numeric do PostgreSQL). O adapter
  // precisa coagir sem transformar ausência em zero — é a lição L-04.
  summary: {
    label: 'Resumo',
    period: { from: '2026-07-01', to: null },
    appliedFilters: { operationIds: [] },
    partners: '2',
    assistedCoverage: { partnersWithData: '2', partners: '2' },
    monthlyAuditCoverage: { partnersWithData: '1', partnersApproved: '1', partners: '2' },
    performanceAxis: { score: 70, sufficient: true },
    processAxis: { conforme: '2' },
    plansByStatus: { not_started: '1' },
    dataSufficiency: { partnersSufficient: '1', partnersInsufficient: '1', performanceSufficient: true },
    weighting: [],
    consolidatedIndex: { partnersWithIndex: '1', partnersWithout: '1', note: 'sem renormalizacao' },
    ruleVersions: { performanceScoreRule: 'desempenho-ponderado-status/1.3.5' },
  },
};

function clienteFalso(data: unknown, error: { message: string } | null = null) {
  const chamadas: Array<{ fn: string; args: unknown }> = [];
  return {
    chamadas,
    client: {
      rpc: vi.fn(async (fn: string, args: unknown) => { chamadas.push({ fn, args }); return { data, error }; }),
      from: vi.fn(() => { throw new Error('o adapter NAO pode ler tabela direto'); }),
    },
  };
}

describe('SupabaseExportRepository', () => {
  it('chama `export_dataset` com módulo e filtros normalizados, e nunca uma tabela', async () => {
    const { client, chamadas } = clienteFalso(RESPOSTA);
    const repo = new SupabaseExportRepository(client as never);
    await repo.getDataset('summary', { periodFrom: '', statuses: [], modules: ['plans'] });

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].fn).toBe('export_dataset');
    expect(chamadas[0].args).toEqual({ p_module: 'summary', p_filters: { modules: ['plans'] } });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('a coerção segue o TIPO da coluna — e `null` sobrevive', async () => {
    const { client } = clienteFalso(RESPOSTA);
    const repo = new SupabaseExportRepository(client as never);
    const r = await repo.getDataset('summary');
    if (!r.ok) throw new Error('esperava sucesso');

    expect(r.value.rowCount).toBe(2);
    expect(r.value.rows[0]).toEqual({
      partnerName: 'Parceiro A', performanceScore: 33.33,
      dataSufficient: true, dueDate: '2026-07-06',
    });
    // A segunda linha é a que importa: sem dado NÃO virou zero.
    expect(r.value.rows[1].performanceScore).toBeNull();
    expect(r.value.rows[1].dueDate).toBeNull();
    expect(r.value.rows[1].dataSufficient).toBe(false);
  });

  it('o bloco DEFINITIVO do Resumo chega tipado, com os doze itens', async () => {
    const { client } = clienteFalso(RESPOSTA);
    const repo = new SupabaseExportRepository(client as never);
    const r = await repo.getDataset('summary');
    if (!r.ok) throw new Error('esperava sucesso');
    expect(r.value.summary).toEqual({
      label: 'Resumo',
      // A ponta ausente do período sobrevive como `null`: "sem limite final"
      // não é "hoje", e o arquivo não pode inventar a data que faltou.
      period: { from: '2026-07-01', to: null },
      appliedFilters: { operationIds: [] },
      partners: 2,
      assistedCoverage: { partnersWithData: 2, partners: 2 },
      monthlyAuditCoverage: { partnersWithData: 1, partnersApproved: 1, partners: 2 },
      performanceAxis: { score: 70, sufficient: true },
      processAxis: { conforme: '2' },
      plansByStatus: { not_started: 1 },
      dataSufficiency: { partnersSufficient: 1, partnersInsufficient: 1, performanceSufficient: true },
      weighting: [],
      consolidatedIndex: { partnersWithIndex: 1, partnersWithout: 1, note: 'sem renormalizacao' },
      ruleVersions: { performanceScoreRule: 'desempenho-ponderado-status/1.3.5' },
    });
  });

  it('a recusa do servidor é repassada CRUA — inclusive a do teste 35', async () => {
    const { client } = clienteFalso(null, { message: 'operacao inexistente ou fora do escopo' });
    const repo = new SupabaseExportRepository(client as never);
    const r = await repo.getDataset('assisted', { operationIds: ['alheio'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('operacao inexistente ou fora do escopo');
  });
});

describe('UnavailableExportRepository', () => {
  it('recusa, e a frase explica que o arquivo sobreviveria ao contexto', async () => {
    const r = await new UnavailableExportRepository().getDataset('plans');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe(EXPORT_UNAVAILABLE_MESSAGE);
    expect(EXPORT_UNAVAILABLE_MESSAGE).toContain('escopo do arquivo');
    expect(EXPORT_UNAVAILABLE_MESSAGE).toContain('sobreviveria ao contexto');
  });
});
