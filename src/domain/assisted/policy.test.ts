/**
 * Regras de domínio da GESTÃO ASSISTIDA — puras, sem banco e sem React.
 *
 * O QUE ESTES TESTES SÃO. O espelho de domínio existe para que a interface não
 * ofereça o que o servidor recusaria. Se ele divergir do servidor, a tela mente
 * — habilita "Concluir" e o clique falha, ou desabilita e o operador não sabe
 * por quê. Cada caso aqui tem contraparte em
 * `src/db/assisted_management.integration.test.ts`, e é a IGUALDADE entre os
 * dois que importa.
 *
 * Dados 100% sintéticos (§23).
 */
import { describe, it, expect } from 'vitest';
import {
  canOperateAssisted,
  canClose,
  closeBlocks,
  countByStatus,
  describeCloseBlock,
  describeStatus,
  describeWeek,
  groupByTheme,
  isDeviation,
  isReadOnly,
  parseActual,
  statusOf,
  TargetBandSemRegraError,
  todayInBusinessTimezone,
  validateEntryPatch,
  weekEndOf,
  weekStartOf,
} from './policy';
import { AssistedCycle, AssistedEntry, AssistedIndicatorStatus } from './types';
import { AuthzSubject } from '../authz/policy';

// ---------------------------------------------------------------------------

function entry(over: Partial<AssistedEntry> & { indicatorCode: string }): AssistedEntry {
  return {
    id: `e-${over.indicatorCode}`,
    cycleId: 'c-1',
    provenance: {
      indicatorDefinitionId: 'd-1',
      indicatorVersionId: 'v-1',
      regionalConfigId: 'rc-1',
      regionalConfigVersionId: 'rcv-1',
      themeId: 't-1',
      themeVersionId: 'tv-1',
    },
    indicatorName: 'Indicador',
    themeCode: 'TEMA-1',
    themeName: 'Tema 1',
    rule: {
      target: 80, tolerance: 5, weight: 1, unit: '%',
      direction: 'higher_better', orientation: '', sortOrder: 1,
    },
    actual: null,
    source: { period: '', consultedAt: null, reference: '' },
    observation: '',
    diagnosis: '',
    status: 'sem_dado',
    ruleVersion: 'assisted-status/1.3.5-a',
    recordedBy: null,
    recordedAt: null,
    plan: null,
    ...over,
  };
}

function cycle(entries: AssistedEntry[], status: 'draft' | 'closed' = 'draft'): AssistedCycle {
  return {
    id: 'c-1',
    operationId: 'op-1',
    partnerName: 'Parceiro Fictício',
    weekStartDate: '2026-07-27',
    weekEndDate: '2026-08-02',
    status,
    authorUserId: 'u-gc',
    closedAt: status === 'closed' ? '2026-08-02T12:00:00Z' : null,
    closedBy: status === 'closed' ? 'u-gc' : null,
    ruleVersion: status === 'closed' ? 'assisted-status/1.3.5-a' : null,
    entries,
  };
}

const planoCompleto = { id: 'p-1', action: 'Treinar', problem: '', owner: 'Alguém', dueDate: '2099-01-01', priority: 'high', status: 'not_started', source: 'assisted' as const };

// ---------------------------------------------------------------------------

describe('a semana empresarial', () => {
  it('qualquer dia da semana devolve a mesma segunda-feira', () => {
    for (const dia of ['2026-07-27', '2026-07-28', '2026-07-31', '2026-08-01', '2026-08-02']) {
      expect(weekStartOf(dia), `dia ${dia}`).toBe('2026-07-27');
    }
  });

  it('a segunda seguinte já é outra semana', () => {
    expect(weekStartOf('2026-08-03')).toBe('2026-08-03');
  });

  it('a semana termina no domingo', () => {
    expect(weekEndOf('2026-07-29')).toBe('2026-08-02');
  });

  it('vira o ano sem se perder', () => {
    // 01/01/2027 é sexta; a semana começou na segunda 28/12/2026.
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
    expect(weekEndOf('2027-01-01')).toBe('2027-01-03');
  });

  it('"hoje" é lido em America/Sao_Paulo, não em UTC', () => {
    // 00:30 UTC de 02/08 ainda é 01/08 em São Paulo (UTC-3). Ler em UTC faria a
    // semana virar um dia antes da hora para o país inteiro.
    const meiaNoiteMeiaUtc = new Date('2026-08-02T00:30:00Z');
    expect(todayInBusinessTimezone(meiaNoiteMeiaUtc)).toBe('2026-08-01');
  });

  it('descreve a semana em português, com o ano no fim', () => {
    expect(describeWeek('2026-07-27')).toBe('27/07 a 02/08/2026');
  });
});

describe('regra de status — a tabela de D2, literal', () => {
  const casos: Array<[Parameters<typeof statusOf>[0], number, number, number, AssistedIndicatorStatus]> = [
    ['higher_better', 80, 5, 85, 'conforme'],
    ['higher_better', 80, 5, 80, 'conforme'],
    ['higher_better', 80, 5, 79.9, 'atencao'],
    ['higher_better', 80, 5, 75, 'atencao'],
    ['higher_better', 80, 5, 74.9, 'nao_conforme'],
    ['lower_better', 10, 2, 8, 'conforme'],
    ['lower_better', 10, 2, 10, 'conforme'],
    ['lower_better', 10, 2, 10.1, 'atencao'],
    ['lower_better', 10, 2, 12, 'atencao'],
    ['lower_better', 10, 2, 12.1, 'nao_conforme'],
  ];

  it.each(casos)('%s meta=%d tol=%d realizado=%d → %s', (dir, t, tol, act, esperado) => {
    expect(statusOf(dir, t, tol, act)).toBe(esperado);
  });

  it('sem realizado é SEM DADO, e sem dado não é não conformidade', () => {
    expect(statusOf('higher_better', 80, 5, null)).toBe('sem_dado');
    expect(statusOf('lower_better', 10, 2, null)).toBe('sem_dado');
    expect(statusOf('higher_better', 80, 5, null)).not.toBe('nao_conforme');
  });

  it('tolerância zero não cria zona de atenção', () => {
    expect(statusOf('higher_better', 80, 0, 79.99)).toBe('nao_conforme');
    expect(statusOf('lower_better', 10, 0, 10.01)).toBe('nao_conforme');
  });

  it('target_band LANÇA e cita A-01 — nunca escolhe comportamento', () => {
    expect(() => statusOf('target_band', 80, 5, 85)).toThrow(TargetBandSemRegraError);
    try {
      statusOf('target_band', 80, 5, 85);
    } catch (e) {
      expect((e as Error).message).toMatch(/A-01/);
    }
  });

  it('cada status tem palavra própria — a tela nunca depende só de cor', () => {
    const palavras = (['conforme', 'atencao', 'nao_conforme', 'sem_dado'] as const).map(describeStatus);
    expect(palavras).toEqual(['Conforme', 'Atenção', 'Não conforme', 'Sem dado']);
    expect(new Set(palavras).size).toBe(4);
  });

  it('só atenção e não conformidade são desvio', () => {
    expect(isDeviation('atencao')).toBe(true);
    expect(isDeviation('nao_conforme')).toBe(true);
    expect(isDeviation('conforme')).toBe(false);
    expect(isDeviation('sem_dado')).toBe(false);
  });
});

describe('autorização — espelho de app.is_assisted_operator', () => {
  const gc = (ops: string[]): AuthzSubject => ({
    userId: 'u-gc', roles: ['channel_manager'], regionIds: [], coordinationIds: [],
    assignedOperationIds: ops,
  });

  it('o GC responsável executa', () => {
    expect(canOperateAssisted(gc(['op-1']), 'op-1')).toBe(true);
  });

  it('GC de outro parceiro não executa', () => {
    expect(canOperateAssisted(gc(['op-2']), 'op-1')).toBe(false);
  });

  it('ADMIN, REGIONAL e COORDENADOR não executam — permissão não é atalho', () => {
    const outros: AuthzSubject[] = [
      { userId: 'u', roles: ['admin'], regionIds: [], coordinationIds: [], assignedOperationIds: ['op-1'] },
      { userId: 'u', roles: ['regional'], regionIds: ['r-1'], coordinationIds: [], assignedOperationIds: ['op-1'] },
      { userId: 'u', roles: ['coordinator'], regionIds: [], coordinationIds: ['c-1'], assignedOperationIds: ['op-1'] },
    ];
    for (const s of outros) expect(canOperateAssisted(s, 'op-1'), s.roles[0]).toBe(false);
  });
});

describe('guardas de fechamento', () => {
  it('ciclo sem indicador nenhum não fecha', () => {
    expect(closeBlocks(cycle([]))).toEqual([{ reason: 'ciclo-vazio' }]);
  });

  it('sem dado impede o fechamento, nomeando o indicador', () => {
    const blocks = closeBlocks(cycle([entry({ indicatorCode: 'IND-A', status: 'sem_dado' })]));
    expect(blocks).toEqual([{ reason: 'sem-dado', indicatorCode: 'IND-A' }]);
  });

  it('desvio sem diagnóstico é bloqueio', () => {
    const blocks = closeBlocks(cycle([entry({ indicatorCode: 'IND-A', status: 'atencao', actual: 76 })]));
    expect(blocks).toContainEqual({ reason: 'desvio-sem-diagnostico', indicatorCode: 'IND-A' });
  });

  it('desvio com diagnóstico e sem plano é bloqueio', () => {
    const blocks = closeBlocks(cycle([
      entry({ indicatorCode: 'IND-A', status: 'nao_conforme', actual: 10, diagnosis: 'Equipe reduzida' }),
    ]));
    expect(blocks).toEqual([{ reason: 'desvio-sem-plano', indicatorCode: 'IND-A' }]);
  });

  it('plano sem responsável é bloqueio', () => {
    const blocks = closeBlocks(cycle([
      entry({
        indicatorCode: 'IND-A', status: 'atencao', actual: 76, diagnosis: 'x',
        plan: { ...planoCompleto, owner: '   ' },
      }),
    ]));
    expect(blocks).toEqual([{ reason: 'plano-sem-responsavel-ou-prazo', indicatorCode: 'IND-A' }]);
  });

  it('plano sem prazo é bloqueio', () => {
    const blocks = closeBlocks(cycle([
      entry({
        indicatorCode: 'IND-A', status: 'atencao', actual: 76, diagnosis: 'x',
        plan: { ...planoCompleto, dueDate: '' },
      }),
    ]));
    expect(blocks).toEqual([{ reason: 'plano-sem-responsavel-ou-prazo', indicatorCode: 'IND-A' }]);
  });

  it('CONFORME não exige diagnóstico nem plano', () => {
    const c = cycle([entry({ indicatorCode: 'IND-A', status: 'conforme', actual: 95 })]);
    expect(closeBlocks(c)).toEqual([]);
    expect(canClose(c)).toBe(true);
  });

  it('desvio completo libera o fechamento', () => {
    const c = cycle([
      entry({ indicatorCode: 'IND-A', status: 'nao_conforme', actual: 10, diagnosis: 'Causa', plan: planoCompleto }),
      entry({ indicatorCode: 'IND-B', status: 'conforme', actual: 95 }),
    ]);
    expect(closeBlocks(c)).toEqual([]);
    expect(canClose(c)).toBe(true);
  });

  it('os bloqueios saem na ordem em que o servidor recusaria', () => {
    // Sem dado vem antes de diagnóstico; diagnóstico antes de plano. Corrigir o
    // primeiro e tentar de novo tem de revelar o segundo, e não outra recusa.
    const c = cycle([
      entry({ indicatorCode: 'IND-B', status: 'atencao', actual: 76, rule: { ...entry({ indicatorCode: 'x' }).rule, sortOrder: 2 } }),
      entry({ indicatorCode: 'IND-A', status: 'sem_dado', rule: { ...entry({ indicatorCode: 'x' }).rule, sortOrder: 1 } }),
    ]);
    expect(closeBlocks(c).map((b) => b.reason))
      .toEqual(['sem-dado', 'desvio-sem-diagnostico', 'desvio-sem-plano']);
  });

  it('ciclo fechado não é fechável de novo pela interface', () => {
    const c = cycle([entry({ indicatorCode: 'IND-A', status: 'conforme', actual: 95 })], 'closed');
    expect(canClose(c)).toBe(false);
    expect(isReadOnly(c)).toBe(true);
  });

  it('cada bloqueio tem texto para o operador, sem jargão de banco', () => {
    const textos = [
      describeCloseBlock({ reason: 'ciclo-vazio' }),
      describeCloseBlock({ reason: 'sem-dado', indicatorCode: 'IND-A' }),
      describeCloseBlock({ reason: 'desvio-sem-diagnostico', indicatorCode: 'IND-A' }),
      describeCloseBlock({ reason: 'desvio-sem-plano', indicatorCode: 'IND-A' }),
      describeCloseBlock({ reason: 'plano-sem-responsavel-ou-prazo', indicatorCode: 'IND-A' }),
    ];
    for (const t of textos) {
      expect(t.length).toBeGreaterThan(20);
      expect(t).not.toMatch(/errcode|constraint|trigger|null|uuid/i);
    }
    // A mensagem de "sem dado" diz ONDE buscar o número.
    expect(textos[1]).toMatch(/relatório oficial da operação/);
  });
});

describe('validação de campos antes de bater no servidor', () => {
  it('sem resultado não cobra período nem data — quem não consultou não tem o que informar', () => {
    expect(validateEntryPatch({ actual: '', sourcePeriod: '', sourceConsultedAt: '' })).toEqual([]);
  });

  it('com resultado, período e data da consulta viram obrigatórios', () => {
    const erros = validateEntryPatch({ actual: '82', sourcePeriod: '', sourceConsultedAt: '' });
    expect(erros.map((e) => e.field).sort()).toEqual(['sourceConsultedAt', 'sourcePeriod']);
  });

  it('resultado não numérico é recusado antes de virar requisição', () => {
    const erros = validateEntryPatch({ actual: 'oitenta', sourcePeriod: '2026-07', sourceConsultedAt: '2026-07-27' });
    expect(erros).toEqual([{ field: 'actual', message: 'Informe um número.' }]);
  });

  it('preenchimento completo passa', () => {
    expect(validateEntryPatch({ actual: '82,5', sourcePeriod: '2026-07', sourceConsultedAt: '2026-07-27' })).toEqual([]);
  });

  it('vírgula decimal é aceita — é como o operador digita', () => {
    expect(parseActual('82,5')).toBe(82.5);
    expect(parseActual('82.5')).toBe(82.5);
    expect(parseActual('  ')).toBeNull();
    expect(parseActual('')).toBeNull();
  });
});

describe('agrupamento e resumo', () => {
  it('agrupa por tema, na ordem que a região configurou', () => {
    const base = entry({ indicatorCode: 'x' });
    const grupos = groupByTheme([
      { ...base, id: '2', indicatorCode: 'IND-B', rule: { ...base.rule, sortOrder: 2 } },
      {
        ...base, id: '3', indicatorCode: 'IND-C', themeName: 'Tema 2',
        provenance: { ...base.provenance, themeId: 't-2' },
        rule: { ...base.rule, sortOrder: 3 },
      },
      { ...base, id: '1', indicatorCode: 'IND-A', rule: { ...base.rule, sortOrder: 1 } },
    ]);
    expect(grupos.map((g) => g.themeName)).toEqual(['Tema 1', 'Tema 2']);
    expect(grupos[0].entries.map((e) => e.indicatorCode)).toEqual(['IND-A', 'IND-B']);
  });

  it('usa o nome do tema COPIADO no item, não o do catálogo atual', () => {
    // Dois itens do mesmo tema com nomes diferentes seria catálogo renomeado
    // entre ciclos; o agrupamento respeita o que está gravado no primeiro item.
    const base = entry({ indicatorCode: 'x' });
    const grupos = groupByTheme([
      { ...base, id: '1', indicatorCode: 'IND-A', themeName: 'Nome à época' },
    ]);
    expect(grupos[0].themeName).toBe('Nome à época');
  });

  it('conta por status, incluindo os que estão em zero', () => {
    const base = entry({ indicatorCode: 'x' });
    const counts = countByStatus([
      { ...base, status: 'conforme' },
      { ...base, status: 'conforme' },
      { ...base, status: 'nao_conforme' },
    ]);
    expect(counts).toEqual({ conforme: 2, atencao: 0, nao_conforme: 1, sem_dado: 0 });
  });
});
