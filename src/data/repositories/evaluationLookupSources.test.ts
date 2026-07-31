/**
 * Fontes canônicas de PLANO DE AÇÃO e EVIDÊNCIA por modo — última ocorrência
 * conhecida da classe "entidade real resolvida no store de demonstração".
 *
 * Antes: `getActionPlan`/`getEvidences` liam o localStore; um plano ou uma
 * evidência gravados pelo servidor apareciam como inexistentes na edição da
 * avaliação. Aqui provamos que cada modo consulta a própria fonte, por chave
 * canônica e sem N+1.
 *
 * Dados 100% SINTÉTICOS (§23).
 */
import { describe, it, expect } from 'vitest';
import { LocalEvaluationsRepository } from './LocalEvaluationsRepository';
import { SupabaseEvaluationsRepository } from './SupabaseEvaluationsRepository';
import { SupabaseEvidenceRepository } from './EvidenceRepository';
import { LocalStore } from '../store/localStore';
import { AppData, Evidence } from '../../types';

const EVD_SINT: Evidence = {
  id: '00000000-0000-0000-0000-0000000094d1',
  themeId: 'T07',
  name: 'evidencia-sintetica.pdf',
  uri: 'T07/00000000-0000-0000-0000-0000000094d1-evidencia-sintetica.pdf',
  mimeType: 'application/pdf',
  type: 'document',
  status: 'stored',
  createdAt: '2026-01-02T00:00:00.000Z',
};

const EVAL_UUID = '00000000-0000-0000-0000-0000000092b1';

function storeCom(over: Partial<AppData>): LocalStore {
  const vazio = {
    users: [], operations: [], evaluations: [], actionPlans: [], evidences: [],
    indicatorDefinitions: [], indicatorResults: [], visitReports: [],
  } as unknown as AppData;
  return new LocalStore({ ...vazio, ...over }, `@teste:${Math.random()}`);
}

/** Cliente Supabase mínimo: registra consultas e devolve linhas fixas. */
function fakeClient(rows: unknown[]) {
  const calls: Array<{ table: string; filters: string[] }> = [];
  const builder = (table: string) => {
    const filters: string[] = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => Promise.resolve({ data: rows, error: null }),
      eq: (col: string, val: unknown) => { filters.push(`${col}=${String(val)}`); return chain; },
      in: () => chain,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    };
    calls.push({ table, filters });
    return chain;
  };
  return { client: { from: builder } as never, calls };
}

describe('12 — modo demonstração continua lendo o store local', () => {
  it('listVisibleEvidences devolve as evidências seedadas do store', async () => {
    const repo = new LocalEvaluationsRepository(storeCom({ evidences: [EVD_SINT] }));
    const res = await repo.listVisibleEvidences();
    expect(res.ok && res.value).toHaveLength(1);
    expect(res.ok && res.value[0].id).toBe(EVD_SINT.id);
  });
});

describe('10/11 — modo corporativo consulta as projeções, não o store', () => {
  it('14/20 — evidências vêm de ui_evidences em UMA consulta, sem o evaluationId extra', async () => {
    const { client, calls } = fakeClient([{ ...EVD_SINT, evaluationId: EVAL_UUID }]);
    const res = await new SupabaseEvaluationsRepository(client, new SupabaseEvidenceRepository(client)).listVisibleEvidences();
    expect(calls.map((c) => c.table)).toEqual(['ui_evidences']);
    expect(res.ok && res.value[0].id).toBe(EVD_SINT.id);
    // A forma devolvida é exatamente `Evidence` — a chave administrativa da
    // view não vaza para a tela.
    expect(res.ok && ('evaluationId' in res.value[0])).toBe(false);
  });

  it('13/15 — planos por avaliação filtram pela coluna canônica "evaluationId" da view', async () => {
    const { client, calls } = fakeClient([]);
    await new SupabaseEvaluationsRepository(client, new SupabaseEvidenceRepository(client)).listActionPlans(EVAL_UUID);
    expect(calls[0].table).toBe('ui_action_plans');
    // `evaluation_id` não existe em ui_action_plans: filtrar por ela derrubava
    // a consulta inteira.
    expect(calls[0].filters).toEqual([`evaluationId=${EVAL_UUID}`]);
  });
});
