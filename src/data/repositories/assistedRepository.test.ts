/**
 * Adapters da Gestão Assistida — por MOCK do SupabaseClient.
 *
 * Estes testes NÃO provam que o servidor obedece: isso está provado contra
 * Postgres real em `src/db/assisted_management.integration.test.ts`. Aqui se
 * prova o CONTRATO que o cliente emite (qual RPC, com quais argumentos) e a
 * tradução da resposta — mais o compromisso do adapter de demonstração de não
 * fingir.
 *
 * Dados 100% sintéticos (§23).
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASSISTED_UNAVAILABLE_MESSAGE,
  SupabaseAssistedRepository,
  UnavailableAssistedRepository,
} from './AssistedRepository';
import { isErr, isOk } from '../../domain/errors/result';

interface RpcCall { name: string; params: Record<string, unknown> }

function thenable(result: { data?: unknown; error?: unknown }) {
  return {
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: result.data ?? null, error: result.error ?? null }),
  };
}

function fakeClient(
  rpc: Record<string, (params: Record<string, unknown>) => { data?: unknown; error?: unknown }> = {},
) {
  const rpcCalls: RpcCall[] = [];
  const client = {
    rpc(name: string, params: Record<string, unknown>) {
      rpcCalls.push({ name, params });
      const handler = rpc[name];
      return thenable(handler ? handler(params) : { error: { message: `RPC ${name} não mockada` } });
    },
  };
  return { client: client as unknown as SupabaseClient, rpcCalls };
}

/** Resposta crua da RPC, com numéricos como STRING — é como o PostgREST entrega. */
const cicloCru = {
  id: 'c-1',
  operationId: 'op-1',
  partnerName: 'Parceiro Fictício',
  weekStartDate: '2026-07-27',
  weekEndDate: '2026-08-02',
  status: 'draft',
  authorUserId: 'u-gc',
  closedAt: null,
  closedBy: null,
  ruleVersion: null,
  entries: [
    {
      id: 'e-1',
      cycleId: 'c-1',
      indicatorDefinitionId: 'd-1',
      indicatorVersionId: 'v-1',
      regionalConfigId: 'rc-1',
      regionalConfigVersionId: 'rcv-1',
      themeId: 't-1',
      themeVersionId: 'tv-1',
      indicatorCode: 'IND-A',
      indicatorName: 'Conversão',
      themeCode: 'TEMA-1',
      themeName: 'Resultado comercial',
      unit: '%',
      direction: 'higher_better',
      orientation: null,
      target: '80.0000',
      tolerance: '5.0000',
      weight: '2.00',
      sortOrder: 1,
      actual: '76.5000',
      sourcePeriod: '2026-07',
      sourceConsultedAt: '2026-07-27',
      sourceReference: null,
      observation: null,
      diagnosis: 'Equipe reduzida',
      status: 'atencao',
      ruleVersion: 'assisted-status/1.3.5-a',
      recordedBy: 'u-gc',
      recordedAt: '2026-07-27T10:00:00Z',
      plan: {
        id: 'p-1', action: 'Treinar equipe', problem: null, owner: 'Coordenador',
        dueDate: '2099-12-31', priority: 'high', status: 'not_started', source: 'assisted',
      },
    },
  ],
};

describe('SupabaseAssistedRepository — contrato emitido', () => {
  it('abrir sem data manda NULO, para o servidor decidir a semana', async () => {
    const { client, rpcCalls } = fakeClient({ open_assisted_cycle: () => ({ data: cicloCru }) });
    await new SupabaseAssistedRepository(client).openCycle('op-1');
    expect(rpcCalls[0]).toEqual({
      name: 'open_assisted_cycle',
      params: { p_operation_id: 'op-1', p_reference_date: null },
    });
  });

  it('abrir com data repassa a data escolhida', async () => {
    const { client, rpcCalls } = fakeClient({ open_assisted_cycle: () => ({ data: cicloCru }) });
    await new SupabaseAssistedRepository(client).openCycle('op-1', '2026-07-29');
    expect(rpcCalls[0].params.p_reference_date).toBe('2026-07-29');
  });

  it('numéricos vindos como string viram número no domínio', async () => {
    const { client } = fakeClient({ open_assisted_cycle: () => ({ data: cicloCru }) });
    const res = await new SupabaseAssistedRepository(client).openCycle('op-1');
    if (!isOk(res)) throw new Error('esperava sucesso');
    const e = res.value.entries[0];
    expect(e.rule.target).toBe(80);
    expect(e.rule.tolerance).toBe(5);
    expect(e.rule.weight).toBe(2);
    expect(e.actual).toBe(76.5);
    // Zero e vazio não podem virar `null` por engano.
    expect(typeof e.rule.target).toBe('number');
  });

  it('nulos de texto viram string vazia; `actual` nulo permanece NULO', async () => {
    const semDado = {
      ...cicloCru,
      entries: [{ ...cicloCru.entries[0], actual: null, sourcePeriod: null, observation: null, plan: null }],
    };
    const { client } = fakeClient({ open_assisted_cycle: () => ({ data: semDado }) });
    const res = await new SupabaseAssistedRepository(client).openCycle('op-1');
    if (!isOk(res)) throw new Error('esperava sucesso');
    const e = res.value.entries[0];
    // Sem dado é AUSÊNCIA, e tem de continuar distinguível de zero.
    expect(e.actual).toBeNull();
    expect(e.source.period).toBe('');
    expect(e.observation).toBe('');
    expect(e.plan).toBeNull();
  });

  it('a proveniência das sete FKs chega inteira ao domínio', async () => {
    const { client } = fakeClient({ open_assisted_cycle: () => ({ data: cicloCru }) });
    const res = await new SupabaseAssistedRepository(client).openCycle('op-1');
    if (!isOk(res)) throw new Error('esperava sucesso');
    expect(res.value.entries[0].provenance).toEqual({
      indicatorDefinitionId: 'd-1',
      indicatorVersionId: 'v-1',
      regionalConfigId: 'rc-1',
      regionalConfigVersionId: 'rcv-1',
      themeId: 't-1',
      themeVersionId: 'tv-1',
    });
  });

  it('semana ainda não aberta chega como NULO de sucesso, não como erro', async () => {
    const { client } = fakeClient({ get_assisted_cycle: () => ({ data: null }) });
    const res = await new SupabaseAssistedRepository(client).getCycle('op-1', '2027-01-04');
    expect(isOk(res) && res.value).toBeNull();
  });

  it('o patch do item NÃO carrega status nem versão de regra', async () => {
    const { client, rpcCalls } = fakeClient({
      save_assisted_entry: () => ({ data: cicloCru.entries[0] }),
    });
    await new SupabaseAssistedRepository(client).saveEntry('e-1', {
      actual: 82, sourcePeriod: '2026-07', sourceConsultedAt: '2026-07-27',
    });
    const patch = rpcCalls[0].params.p_patch as Record<string, unknown>;
    expect(Object.keys(patch)).not.toContain('status');
    expect(Object.keys(patch)).not.toContain('ruleVersion');
    expect(patch.actual).toBe(82);
  });

  it('o plano vai pelo MOTOR ÚNICO: save_action_plan com assistedEntryId', async () => {
    const { client, rpcCalls } = fakeClient({ save_action_plan: () => ({ data: { id: 'p-1' } }) });
    await new SupabaseAssistedRepository(client).savePlan('op-1', 'e-1', {
      action: 'Treinar', owner: 'Coordenador', dueDate: '2099-12-31',
    });
    expect(rpcCalls[0].name).toBe('save_action_plan');
    const input = rpcCalls[0].params.p_input as Record<string, unknown>;
    expect(input.assistedEntryId).toBe('e-1');
    expect(input.operationId).toBe('op-1');
    // Nenhuma RPC própria de plano da Gestão Assistida foi inventada.
    expect(rpcCalls.map((c) => c.name)).not.toContain('save_assisted_action_plan');
  });

  it('editar plano existente manda o id; criar não manda id vazio', async () => {
    const { client, rpcCalls } = fakeClient({ save_action_plan: () => ({ data: { id: 'p-1' } }) });
    const repo = new SupabaseAssistedRepository(client);
    await repo.savePlan('op-1', 'e-1', { action: 'a', owner: 'o', dueDate: '2099-01-01' });
    await repo.savePlan('op-1', 'e-1', { id: 'p-1', action: 'a', owner: 'o', dueDate: '2099-01-01' });
    expect(Object.keys(rpcCalls[0].params.p_input as object)).not.toContain('id');
    expect((rpcCalls[1].params.p_input as Record<string, unknown>).id).toBe('p-1');
  });

  it('a mensagem do servidor é repassada CRUA — é ela que resolve o problema', async () => {
    const literal = 'fechamento bloqueado: IND-A apresenta desvio sem plano de acao';
    const { client } = fakeClient({ close_assisted_cycle: () => ({ error: { message: literal } }) });
    const res = await new SupabaseAssistedRepository(client).closeCycle('c-1');
    expect(isErr(res) && res.error.message).toBe(literal);
  });

  it('sem mensagem do servidor, cai num texto que ainda diz o que falhou', async () => {
    const { client } = fakeClient({ close_assisted_cycle: () => ({ error: {} }) });
    const res = await new SupabaseAssistedRepository(client).closeCycle('c-1');
    expect(isErr(res) && res.error.message).toBe('Falha ao concluir o ciclo.');
  });
});

describe('UnavailableAssistedRepository — honesto em vez de vazio', () => {
  const repo = new UnavailableAssistedRepository();

  it('recusa TODA operação, leitura inclusive', async () => {
    const resultados = await Promise.all([
      repo.openCycle('op-1'),
      repo.getCycle('op-1'),
      repo.listCycles('op-1'),
      repo.saveEntry('e-1', {}),
      repo.savePlan('op-1', 'e-1', { action: 'a', owner: 'o', dueDate: '2099-01-01' }),
      repo.closeCycle('c-1'),
    ]);
    for (const r of resultados) {
      expect(isErr(r)).toBe(true);
      expect(isErr(r) && r.error.message).toBe(ASSISTED_UNAVAILABLE_MESSAGE);
    }
  });

  it('NUNCA devolve lista vazia — isso seria pior que recusar', async () => {
    // "Nenhum indicador configurado" e "não há Gestão Assistida aqui" são coisas
    // diferentes, e a segunda não pode se disfarçar da primeira.
    const r = await repo.listCycles('op-1');
    expect(isOk(r)).toBe(false);
  });

  it('a frase diz POR QUE, não só que falhou', async () => {
    expect(ASSISTED_UNAVAILABLE_MESSAGE).toMatch(/ambiente corporativo/);
    expect(ASSISTED_UNAVAILABLE_MESSAGE).toMatch(/servidor/);
  });
});
