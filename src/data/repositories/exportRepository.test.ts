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
  summary: {
    label: 'Resumo tecnico provisorio',
    a06: 'A composicao empresarial final da aba Resumo continua pendente (A-06).',
    partners: '2', partnersWithAssisted: '2', partnersWithMonthlyAudit: '1',
    plansByStatus: { not_started: '1' }, plansOverdue: '1',
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

  it('o bloco do Resumo chega tipado, com A-06 nomeada', async () => {
    const { client } = clienteFalso(RESPOSTA);
    const repo = new SupabaseExportRepository(client as never);
    const r = await repo.getDataset('summary');
    if (!r.ok) throw new Error('esperava sucesso');
    expect(r.value.summary).toEqual({
      label: 'Resumo tecnico provisorio',
      a06: 'A composicao empresarial final da aba Resumo continua pendente (A-06).',
      partners: 2, partnersWithAssisted: 2, partnersWithMonthlyAudit: 1,
      plansByStatus: { not_started: 1 }, plansOverdue: 1,
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
