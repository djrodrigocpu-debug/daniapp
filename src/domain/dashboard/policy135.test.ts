/**
 * O módulo de apresentação do Dashboard/Matriz é PURO, e a coisa mais importante
 * que estes casos provam é o que ele NÃO faz: não classifica quadrante, não
 * calcula índice e não decide suficiência. Ele só sabe DIZER o que o servidor
 * decidiu — e recusar-se a transformar ausência de dado em zero.
 */
import { describe, it, expect } from 'vitest';
import {
  NO_QUADRANT_LABEL, QUADRANT_LABEL_135, QUADRANT_ORDER, SUFFICIENCY_REASON_LABEL,
  countQuadrants, filtersSummary, normalizeFilters, proportion, provisionalNotice,
  quadrantAccessibleLabel, weightedIndexAccessibleLabel, weightedIndexUnavailableReason,
  weightingLabel,
} from './policy135';
import { MatrixEntry, RuleProvenance } from './types135';

const PROVENANCIA: RuleProvenance = {
  assistedStatusRule: 'assisted/1',
  performanceScoreRule: 'proporcao-simples-desempenho/A-11-pendente',
  performanceProvisional: true,
  monthlyScoreRule: 'proporcao-simples/A-10-pendente',
  monthlyProvisional: true,
  quadrantRule: '1.3.4-quadrants-1',
  trafficLightRule: 'app.score_traffic_light/0004',
  openDecisions: ['A-04', 'A-10', 'A-11'],
};

const entrada = (over: Partial<MatrixEntry> = {}): MatrixEntry => ({
  operationId: 'op-1',
  partnerName: 'Parceiro A',
  regionId: 'reg-1',
  performance: { axis: 'critical', score: 33.33, conforme: 1, atencao: 1, naoConforme: 1, semDado: 0 },
  process: { axis: 'green', score: 100, trafficLight: 'green', auditsConsidered: 1 },
  quadrant: 'ineffective_routine',
  dataSufficiency: { sufficient: true, reasons: [] },
  weighting: { configured: true, regionId: 'reg-1', assistedWeight: 60, auditWeight: 40, versionNumber: 1, id: 'w-1' },
  weightedIndex: {
    value: 60, assistedComponent: 33.33, auditComponent: 100,
    weightingVersionId: 'w-1', provisional: true, provisionalReason: 'A-10 e A-11 abertas',
  },
  ...over,
});

describe('os cinco quadrantes canônicos', () => {
  it('os nomes de D10 estão preservados, e são cinco estados', () => {
    expect(QUADRANT_ORDER).toEqual([
      'healthy', 'ineffective_routine', 'result_without_process', 'critical',
    ]);
    expect(QUADRANT_LABEL_135.healthy).toBe('Saudável');
    expect(QUADRANT_LABEL_135.ineffective_routine).toBe('Processo cumprido, resultado insuficiente');
    expect(QUADRANT_LABEL_135.result_without_process).toBe('Resultado sem processo');
    expect(QUADRANT_LABEL_135.critical).toBe('Crítico');
    expect(NO_QUADRANT_LABEL).toBe('Sem dado suficiente');
  });

  it('contar não é classificar: nenhuma entrada muda de quadrante', () => {
    const c = countQuadrants([
      entrada({ quadrant: 'healthy' }),
      entrada({ quadrant: 'healthy' }),
      entrada({ quadrant: null }),
    ]);
    expect(c).toEqual({
      healthy: 2, ineffective_routine: 0, result_without_process: 0, critical: 0, no_data: 1,
    });
  });
});

describe('ponderação — a ausência tem nome próprio', () => {
  it('sem configuração, a frase é a de D10, literal', () => {
    expect(weightingLabel({ configured: false, regionId: 'r' })).toBe('Ponderação não configurada');
  });

  it('com configuração, os dois pesos aparecem, e a versão junto', () => {
    expect(weightingLabel({
      configured: true, regionId: 'r', assistedWeight: 60, auditWeight: 40, versionNumber: 2,
    })).toBe('Desempenho 60% · Processo 40% (versão 2)');
  });
});

describe('por que o índice não existe — e os dois motivos são diferentes', () => {
  it('sem ponderação: resolve-se configurando pesos', () => {
    const e = entrada({ weighting: { configured: false, regionId: 'r' }, weightedIndex: null });
    expect(weightedIndexUnavailableReason(e)).toBe('Ponderação não configurada');
  });

  it('faltando módulo: resolve-se operando, e o motivo é nomeado', () => {
    const e = entrada({
      weightedIndex: null,
      dataSufficiency: { sufficient: false, reasons: ['missing_audit'] },
    });
    expect(weightedIndexUnavailableReason(e))
      .toBe(`Dados insuficientes: ${SUFFICIENCY_REASON_LABEL.missing_audit}`);
  });

  it('com índice, não há motivo — a função devolve nulo', () => {
    expect(weightedIndexUnavailableReason(entrada())).toBeNull();
  });
});

describe('todo índice exibido é anunciado como provisório', () => {
  it('a frase cita A-10 e A-11, e nega ser o Índice de Excelência', () => {
    const aviso = provisionalNotice(PROVENANCIA);
    expect(aviso).toContain('A-10');
    expect(aviso).toContain('A-11');
    expect(aviso).toContain('Não é o Índice de Excelência');
    // A-04 é sobre PESOS, não sobre a regra de pontuação: fica de fora da frase.
    expect(aviso).not.toContain('A-04');
  });

  it('o texto acessível do índice diz o valor, as duas partes e os dois pesos', () => {
    const e = entrada();
    const t = weightedIndexAccessibleLabel(e, e.weightedIndex!);
    expect(t).toContain('provisório 60.00');
    expect(t).toContain('desempenho 33.33');
    expect(t).toContain('processo 100.00');
    expect(t).toContain('60%');
    expect(t).toContain('40%');
  });
});

describe('cor nunca é o único sinal', () => {
  it('o rótulo acessível traz quadrante e os dois eixos em texto', () => {
    const t = quadrantAccessibleLabel(entrada());
    expect(t).toContain('Processo cumprido, resultado insuficiente');
    expect(t).toContain('Desempenho Não conforme');
    expect(t).toContain('processo Conforme');
  });

  it('sem dado suficiente, o rótulo diz o que falta', () => {
    const t = quadrantAccessibleLabel(entrada({
      quadrant: null,
      dataSufficiency: { sufficient: false, reasons: ['missing_audit', 'missing_measurement'] },
    }));
    expect(t).toContain('Sem dado suficiente');
    expect(t).toContain('falta Auditoria Mensal aprovada');
    expect(t).toContain('falta registro de Gestão Assistida');
  });
});

describe('ausência de dado NÃO é zero por cento', () => {
  it('sem total, a proporção é nula — e nula não desenha barra', () => {
    expect(proportion(0, 0)).toBeNull();
    expect(proportion(3, 0)).toBeNull();
    expect(proportion(0, Number.NaN)).toBeNull();
  });

  it('com total, a proporção é a esperada', () => {
    expect(proportion(1, 4)).toBe(25);
    expect(proportion(0, 4)).toBe(0);
  });
});

describe('filtros', () => {
  it('lista vazia vira ausência de chave — as duas significam o mesmo no servidor', () => {
    expect(normalizeFilters({
      periodFrom: '', periodTo: '2026-12-31',
      operationIds: [], statuses: ['conforme'], modules: [],
    })).toEqual({ periodTo: '2026-12-31', statuses: ['conforme'] });
  });

  it('o resumo do recorte diz o período e o tamanho do escopo', () => {
    expect(filtersSummary({}, 3)).toBe('todo o período · 3 parceiros no escopo');
    expect(filtersSummary({ periodFrom: '2026-01-01' }, 1))
      .toBe('período 2026-01-01 a hoje · 1 parceiro no escopo');
    expect(filtersSummary({ modules: ['assisted'], statuses: ['sem_dado'] }, 2))
      .toContain('módulos: assisted');
  });
});
