/**
 * Regras PURAS de apresentação do Dashboard e da Matriz (AAPEx 1.3.5, D10).
 *
 * O QUE ESTE MÓDULO **NÃO** FAZ, e é o mais importante: não calcula quadrante,
 * não calcula índice, não decide se há dado suficiente e não escolhe peso.
 * Tudo isso é do servidor (migration 0048). Aqui mora só o que a interface
 * precisa para DIZER o que o servidor decidiu — rótulos, ordem, e as frases que
 * impedem um número provisório de passar por homologado.
 *
 * Duplicar a regra aqui criaria a segunda verdade contra a qual a ADR-135-002
 * (D-J) adverte: no primeiro conserto, tela e banco divergiriam, e a tela é a
 * que o usuário acredita.
 */
import {
  DashboardFilters,
  MatrixEntry,
  MatrixQuadrant,
  PerformanceAxis,
  ProcessAxis,
  RuleProvenance,
  SufficiencyReason,
  WeightedIndexResult,
  WeightingVersion,
} from './types135';

/** Os cinco quadrantes canônicos, com os nomes de D10. Nenhum foi renomeado. */
export const QUADRANT_LABEL_135: Record<MatrixQuadrant, string> = {
  healthy: 'Saudável',
  ineffective_routine: 'Processo cumprido, resultado insuficiente',
  result_without_process: 'Resultado sem processo',
  critical: 'Crítico',
};

export const NO_QUADRANT_LABEL = 'Sem dado suficiente';

export const PERFORMANCE_AXIS_LABEL: Record<PerformanceAxis, string> = {
  on_target: 'No alvo',
  attention: 'Atenção',
  critical: 'Não conforme',
  no_measurement: 'Sem dado',
};

export const PROCESS_AXIS_LABEL: Record<ProcessAxis, string> = {
  green: 'Conforme',
  yellow: 'Atenção',
  red: 'Não conforme',
  not_evaluated: 'Sem auditoria aprovada',
  no_audit: 'Sem auditoria aprovada',
};

export const SUFFICIENCY_REASON_LABEL: Record<SufficiencyReason, string> = {
  missing_audit: 'falta Auditoria Mensal aprovada no período',
  missing_measurement: 'falta registro de Gestão Assistida no período',
};

/** Ordem de exibição dos quadrantes. Estável, e independente dos dados. */
export const QUADRANT_ORDER: MatrixQuadrant[] = [
  'healthy',
  'ineffective_routine',
  'result_without_process',
  'critical',
];

/**
 * Conta os quadrantes tal como o servidor os classificou. Contar não é
 * classificar: nenhuma entrada muda de quadrante aqui.
 */
export function countQuadrants(entries: MatrixEntry[]): Record<string, number> {
  const counts: Record<string, number> = {
    healthy: 0, ineffective_routine: 0, result_without_process: 0, critical: 0, no_data: 0,
  };
  for (const e of entries) counts[e.quadrant ?? 'no_data'] += 1;
  return counts;
}

/** Frase única do estado da ponderação, para a tela nunca inventar a sua. */
export function weightingLabel(w: WeightingVersion): string {
  if (!w.configured) return 'Ponderação não configurada';
  return `Desempenho ${w.assistedWeight}% · Processo ${w.auditWeight}%`
    + (w.versionNumber ? ` (versão ${w.versionNumber})` : '');
}

/**
 * Por que o índice não existe, quando não existe. Distinguir os dois motivos
 * importa: um se resolve configurando pesos, o outro se resolve operando.
 */
export function weightedIndexUnavailableReason(entry: MatrixEntry): string | null {
  if (entry.weightedIndex) return null;
  if (!entry.weighting.configured) return 'Ponderação não configurada';
  const faltas = entry.dataSufficiency.reasons.map((r) => SUFFICIENCY_REASON_LABEL[r]);
  if (faltas.length > 0) return `Dados insuficientes: ${faltas.join('; ')}`;
  return 'Índice indisponível';
}

/**
 * A frase que acompanha TODO índice exibido. Não é adorno: A-10 e A-11 estão
 * abertas, e as duas notas são proporção simples.
 */
export function provisionalNotice(p: RuleProvenance): string {
  const pendentes = p.openDecisions.filter((d) => d !== 'A-04');
  return 'Índice provisório: a regra de pontuação aguarda decisão empresarial '
    + `(${pendentes.join(', ')}). Não é o Índice de Excelência.`;
}

/** Texto acessível de um índice — usado como `accessibilityLabel`. */
export function weightedIndexAccessibleLabel(
  entry: MatrixEntry, index: WeightedIndexResult,
): string {
  return `${entry.partnerName}: índice ponderado provisório ${index.value.toFixed(2)}, `
    + `composto por desempenho ${index.assistedComponent.toFixed(2)} e `
    + `processo ${index.auditComponent.toFixed(2)}, `
    + `com pesos ${entry.weighting.assistedWeight}% e ${entry.weighting.auditWeight}%.`;
}

/** Texto acessível do quadrante — cor nunca é o único sinal. */
export function quadrantAccessibleLabel(entry: MatrixEntry): string {
  const nome = entry.quadrant ? QUADRANT_LABEL_135[entry.quadrant] : NO_QUADRANT_LABEL;
  const motivos = entry.dataSufficiency.sufficient
    ? ''
    : ` (${entry.dataSufficiency.reasons.map((r) => SUFFICIENCY_REASON_LABEL[r]).join('; ')})`;
  return `${entry.partnerName}: ${nome}${motivos}. `
    + `Desempenho ${PERFORMANCE_AXIS_LABEL[entry.performance.axis]}, `
    + `processo ${PROCESS_AXIS_LABEL[entry.process.axis]}.`;
}

/**
 * Remove do payload de filtros tudo que é vazio, para que o servidor receba
 * "sem filtro" em vez de "lista vazia". As duas coisas significam o mesmo no
 * servidor (0048), e mandar a forma limpa mantém o contrato legível.
 */
export function normalizeFilters(f: DashboardFilters): DashboardFilters {
  const out: DashboardFilters = {};
  if (f.periodFrom) out.periodFrom = f.periodFrom;
  if (f.periodTo) out.periodTo = f.periodTo;
  if (f.operationIds?.length) out.operationIds = f.operationIds;
  if (f.channelManagerIds?.length) out.channelManagerIds = f.channelManagerIds;
  if (f.coordinationIds?.length) out.coordinationIds = f.coordinationIds;
  if (f.themeIds?.length) out.themeIds = f.themeIds;
  if (f.indicatorIds?.length) out.indicatorIds = f.indicatorIds;
  if (f.modules?.length) out.modules = f.modules;
  if (f.statuses?.length) out.statuses = f.statuses;
  return out;
}

/**
 * Descrição textual do recorte aplicado, para o cabeçalho de cada gráfico e da
 * alternativa tabular. Todo gráfico tem de dizer de que recorte fala.
 */
export function filtersSummary(f: DashboardFilters, resolvedPartners: number): string {
  const partes: string[] = [];
  if (f.periodFrom || f.periodTo) {
    partes.push(`período ${f.periodFrom || 'início'} a ${f.periodTo || 'hoje'}`);
  } else {
    partes.push('todo o período');
  }
  partes.push(`${resolvedPartners} parceiro${resolvedPartners === 1 ? '' : 's'} no escopo`);
  if (f.modules?.length) partes.push(`módulos: ${f.modules.join(', ')}`);
  if (f.themeIds?.length) partes.push(`${f.themeIds.length} tema(s)`);
  if (f.indicatorIds?.length) partes.push(`${f.indicatorIds.length} indicador(es)`);
  if (f.statuses?.length) partes.push(`status: ${f.statuses.join(', ')}`);
  return partes.join(' · ');
}

/**
 * Uma barra proporcional só pode ser desenhada se houver total. Zero de tudo
 * NÃO é "0%" — é ausência de dado, e a tela precisa dizer isso em texto.
 */
export function proportion(part: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return (part / total) * 100;
}
