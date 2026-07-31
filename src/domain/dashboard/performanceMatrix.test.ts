import { describe, it, expect } from 'vitest';
import { computePerformanceMatrix } from './performanceMatrix';
import { IndicatorDefinition, IndicatorResult, Operation } from '../../types';

const op = (id: string, status: Operation['status']): Operation => ({
  id, partnerName: `Parceiro ${id}`, officeName: 'O', city: 'C', state: 'PR',
  coordinatorId: 'U02', managerId: 'U03', active: true,
  currentScore: 0, previousScore: 0, lastAudit: status === 'not_evaluated' ? undefined : '2026-07-01',
  nextAudit: '2026-08-01', status, openActions: 0,
});

const def = (id: string, target = 100, yellowTolerance = 10): IndicatorDefinition => ({
  id, title: `Indicador ${id}`, unit: '%', direction: 'higher_better',
  defaultTarget: target, yellowTolerance, weight: 1, diagnosticOptions: [],
});

const result = (operationId: string, indicatorId: string, actual: number, target = 100): IndicatorResult => ({
  id: `IR_${operationId}_${indicatorId}`, operationId, indicatorId, period: '2026-07',
  target, actual, previousActual: actual, updatedAt: '2026-07-20T00:00:00.000Z',
});

describe('computePerformanceMatrix', () => {
  it('parceiro verde com todos indicadores verdes -> Saudável', () => {
    const m = computePerformanceMatrix([op('O1', 'green')], [def('D1')], [result('O1', 'D1', 100)]);
    expect(m.entries[0]).toMatchObject({ quadrant: 'healthy', result: 'on_target', exclusionReasons: [] });
  });

  it('parceiro verde com 1 indicador vermelho -> Processo cumprido, resultado insuficiente', () => {
    const m = computePerformanceMatrix([op('O1', 'green')], [def('D1')], [result('O1', 'D1', 50)]);
    expect(m.entries[0]).toMatchObject({ quadrant: 'ineffective_routine', result: 'critical' });
  });

  it('parceiro vermelho com indicadores verdes -> Resultado sem processo', () => {
    const m = computePerformanceMatrix([op('O1', 'red')], [def('D1')], [result('O1', 'D1', 100)]);
    expect(m.entries[0]).toMatchObject({ quadrant: 'result_without_process', result: 'on_target' });
  });

  it('parceiro vermelho com indicador vermelho -> Crítico', () => {
    const m = computePerformanceMatrix([op('O1', 'red')], [def('D1')], [result('O1', 'D1', 50)]);
    expect(m.entries[0]).toMatchObject({ quadrant: 'critical', result: 'critical' });
  });

  it('gravidade máxima: 1 vermelho entre vários verdes vence', () => {
    const defs = [def('D1'), def('D2'), def('D3')];
    const results = [result('O1', 'D1', 150), result('O1', 'D2', 100), result('O1', 'D3', 10)];
    const m = computePerformanceMatrix([op('O1', 'green')], defs, results);
    expect(m.entries[0].result).toBe('critical');
  });

  it('gravidade máxima: amarelo vence verde (sem vermelho presente)', () => {
    const defs = [def('D1'), def('D2')];
    const results = [result('O1', 'D1', 100), result('O1', 'D2', 95)];
    const m = computePerformanceMatrix([op('O1', 'green')], defs, results);
    expect(m.entries[0].result).toBe('attention');
  });

  it('indicador sem valor lançado NÃO conta como verde', () => {
    // D1 e D2 estão no catálogo, mas nenhum dos dois tem resultado lançado.
    const defs = [def('D1'), def('D2')];
    const m = computePerformanceMatrix([op('O1', 'green')], defs, []);
    expect(m.entries[0].result).toBe('no_measurement');
  });

  it('parceiro not_evaluated -> excluído, motivo "falta auditoria aprovada"', () => {
    const m = computePerformanceMatrix([op('O1', 'not_evaluated')], [def('D1')], [result('O1', 'D1', 100)]);
    expect(m.entries[0].quadrant).toBeNull();
    expect(m.entries[0].exclusionReasons).toEqual(['missing_audit']);
  });

  it('parceiro sem nenhum resultado -> excluído, motivo "falta lançamento"', () => {
    const m = computePerformanceMatrix([op('O1', 'green')], [def('D1')], []);
    expect(m.entries[0].quadrant).toBeNull();
    expect(m.entries[0].exclusionReasons).toEqual(['missing_measurement']);
  });

  it('parceiro sem os dois -> excluído, com os dois motivos', () => {
    const m = computePerformanceMatrix([op('O1', 'not_evaluated')], [def('D1')], []);
    expect(m.entries[0].quadrant).toBeNull();
    expect(m.entries[0].exclusionReasons).toEqual(['missing_audit', 'missing_measurement']);
  });

  it('escopo vazio -> matriz vazia, sem exceção', () => {
    const m = computePerformanceMatrix([], [], []);
    expect(m.entries).toEqual([]);
    expect(m.excludedCount).toBe(0);
    expect(m.quadrantCounts).toEqual({ healthy: 0, ineffective_routine: 0, result_without_process: 0, critical: 0 });
  });

  it('agregados por quadrante somam o total classificado', () => {
    const ops = [op('O1', 'green'), op('O2', 'red'), op('O3', 'green'), op('O4', 'not_evaluated')];
    const defs = [def('D1')];
    const results = [result('O1', 'D1', 100), result('O2', 'D1', 50), result('O3', 'D1', 50)];
    const m = computePerformanceMatrix(ops, defs, results);
    const classified = m.entries.filter((e) => e.quadrant !== null).length;
    const sum = Object.values(m.quadrantCounts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(classified);
    expect(classified).toBe(ops.length - m.excludedCount);
  });

  it('computePerformanceMatrix NÃO altera nenhuma operação recebida', () => {
    const ops = [op('O1', 'green'), op('O2', 'red')];
    const defs = [def('D1')];
    const results = [result('O1', 'D1', 100), result('O2', 'D1', 50)];
    const opsBefore = JSON.parse(JSON.stringify(ops));
    const defsBefore = JSON.parse(JSON.stringify(defs));
    const resultsBefore = JSON.parse(JSON.stringify(results));
    computePerformanceMatrix(ops, defs, results);
    expect(ops).toEqual(opsBefore);
    expect(defs).toEqual(defsBefore);
    expect(results).toEqual(resultsBefore);
  });
});
