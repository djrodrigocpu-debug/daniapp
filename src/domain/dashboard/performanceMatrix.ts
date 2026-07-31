/**
 * Matriz de desempenho: cruza conformidade (Índice de excelência, da auditoria
 * aprovada) com resultado (situação dos indicadores da Gestão Assistida), por
 * Parceiro AACE. Módulo PURO: sem React, sem I/O — a tela não recalcula nada,
 * só lê o que esta função produz.
 *
 * Os dois eixos são DELIBERADAMENTE independentes (Dossiê §6, §21.5): nem a
 * fórmula do Índice de excelência nem o semáforo do indicador são recalculados
 * aqui — ambos são reaproveitados verbatim das funções já existentes.
 */
import { calculateIndicatorStatus } from '../../data/performance';
import { IndicatorDefinition, IndicatorResult, Operation, TrafficLight } from '../../types';

/** Gravidade máxima presente entre os indicadores medidos do parceiro. */
export type ResultAxis = 'critical' | 'attention' | 'on_target' | 'no_measurement';

export type Quadrant = 'healthy' | 'ineffective_routine' | 'result_without_process' | 'critical';

export type ExclusionReason = 'missing_audit' | 'missing_measurement';

export interface PerformanceMatrixEntry {
  operationId: string;
  partnerName: string;
  /** Reaproveitado verbatim de `Operation.status` — nunca recalculado a partir de currentScore. */
  conformity: TrafficLight;
  result: ResultAxis;
  /** `null` quando o parceiro fica fora dos quadrantes — ver `exclusionReasons`. */
  quadrant: Quadrant | null;
  exclusionReasons: ExclusionReason[];
}

export interface PerformanceMatrix {
  entries: PerformanceMatrixEntry[];
  quadrantCounts: Record<Quadrant, number>;
  excludedCount: number;
}

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  healthy: 'Saudável',
  ineffective_routine: 'Processo cumprido, resultado insuficiente',
  result_without_process: 'Resultado sem processo',
  critical: 'Crítico',
};

export const NO_DATA_LABEL = 'Sem dado suficiente para cruzar';

export const EXCLUSION_REASON_LABEL: Record<ExclusionReason, string> = {
  missing_audit: 'falta auditoria aprovada',
  missing_measurement: 'falta lançamento de indicador',
};

/** `not_applicable` não ocorre hoje em `Operation.status` (0005), mas conta como ausência de auditoria aprovada se aparecer. */
const CONFORMITY_MISSING = new Set<TrafficLight>(['not_evaluated', 'not_applicable']);

function resultAxisFor(
  definitionsById: Map<string, IndicatorDefinition>,
  results: IndicatorResult[],
): ResultAxis {
  let sawYellow = false;
  let sawGreen = false;
  for (const result of results) {
    const definition = definitionsById.get(result.indicatorId);
    if (!definition) continue; // sem contrato vigente para calcular o semáforo — não conta como nada.
    const status = calculateIndicatorStatus(definition, result);
    if (status === 'red') return 'critical'; // gravidade máxima: vermelho vence de imediato.
    if (status === 'yellow') sawYellow = true;
    else sawGreen = true;
  }
  if (sawYellow) return 'attention';
  if (sawGreen) return 'on_target';
  return 'no_measurement';
}

function quadrantFor(conformity: TrafficLight, result: ResultAxis): Quadrant {
  const conformityGood = conformity === 'green';
  const resultGood = result === 'on_target';
  if (conformityGood) return resultGood ? 'healthy' : 'ineffective_routine';
  return resultGood ? 'result_without_process' : 'critical';
}

export function computePerformanceMatrix(
  operations: Operation[],
  indicatorDefinitions: IndicatorDefinition[],
  indicatorResults: IndicatorResult[],
): PerformanceMatrix {
  const definitionsById = new Map(indicatorDefinitions.map((definition) => [definition.id, definition]));

  const resultsByOperation = new Map<string, IndicatorResult[]>();
  for (const result of indicatorResults) {
    const bucket = resultsByOperation.get(result.operationId);
    if (bucket) bucket.push(result);
    else resultsByOperation.set(result.operationId, [result]);
  }

  const quadrantCounts: Record<Quadrant, number> = {
    healthy: 0,
    ineffective_routine: 0,
    result_without_process: 0,
    critical: 0,
  };
  let excludedCount = 0;

  const entries = operations.map((operation): PerformanceMatrixEntry => {
    const conformity = operation.status;
    const result = resultAxisFor(definitionsById, resultsByOperation.get(operation.id) ?? []);

    const exclusionReasons: ExclusionReason[] = [];
    if (CONFORMITY_MISSING.has(conformity)) exclusionReasons.push('missing_audit');
    if (result === 'no_measurement') exclusionReasons.push('missing_measurement');

    if (exclusionReasons.length > 0) {
      excludedCount += 1;
      return { operationId: operation.id, partnerName: operation.partnerName, conformity, result, quadrant: null, exclusionReasons };
    }

    const quadrant = quadrantFor(conformity, result);
    quadrantCounts[quadrant] += 1;
    return { operationId: operation.id, partnerName: operation.partnerName, conformity, result, quadrant, exclusionReasons: [] };
  });

  return { entries, quadrantCounts, excludedCount };
}
