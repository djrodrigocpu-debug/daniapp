import { IndicatorDefinition, IndicatorResult, TrafficLight } from '../types';

export const indicatorDefinitions: IndicatorDefinition[] = [
  { id: 'I01', title: 'BL na Renovação', category: 'Resultado', unit: '%', direction: 'higher_better', defaultTarget: 30, yellowTolerance: 10, weight: 5, diagnosticOptions: ['Não oferta BL na renovação', 'Carteira não priorizada', 'Baixa argumentação comercial', 'Outro'] },
  { id: 'I02', title: 'Domínio de Portfólio', category: 'Processo', unit: '%', direction: 'higher_better', defaultTarget: 85, yellowTolerance: 10, weight: 4, diagnosticOptions: ['Baixo conhecimento', 'Treinamento desatualizado', 'Pouca aplicação prática', 'Outro'] },
  { id: 'I03', title: 'Venda de SD', category: 'Resultado', unit: '%', direction: 'higher_better', defaultTarget: 25, yellowTolerance: 15, weight: 5, diagnosticOptions: ['Não oferta SD', 'Baixo pipeline', 'Falta treinamento', 'Sem rotina de acompanhamento', 'Outro'] },
  { id: 'I04', title: 'Venda de Avançadas', category: 'Resultado', unit: '%', direction: 'higher_better', defaultTarget: 100, yellowTolerance: 15, weight: 5, diagnosticOptions: ['Pipeline insuficiente', 'Baixa qualificação de oportunidades', 'Falta apoio técnico', 'Outro'] },
  { id: 'I05', title: 'Convergência', category: 'Resultado', unit: '%', direction: 'higher_better', defaultTarget: 35, yellowTolerance: 10, weight: 5, diagnosticOptions: ['Oferta não realizada', 'Baixo domínio de abordagem', 'Carteira sem segmentação', 'Outro'] },
  { id: 'I06', title: 'Churn', category: 'Qualidade', unit: '%', direction: 'lower_better', defaultTarget: 1, yellowTolerance: 20, weight: 5, diagnosticOptions: ['Baixa atuação preventiva', 'Problemas de pós-venda', 'Falha na expectativa comercial', 'Outro'] },
  { id: 'I07', title: '% Quebra', category: 'Qualidade', unit: '%', direction: 'lower_better', defaultTarget: 10, yellowTolerance: 15, weight: 5, diagnosticOptions: ['Documentação incompleta', 'Cliente ausente', 'Falha de validação', 'Outro'] },
  { id: 'I08', title: 'Delta Ticket', category: 'Resultado', unit: 'R$', direction: 'higher_better', defaultTarget: 0, yellowTolerance: 10, weight: 4, diagnosticOptions: ['Renovação sem valorização', 'Mix inadequado', 'Desconto excessivo', 'Outro'] },
  { id: 'I09', title: 'Renovação', category: 'Resultado', unit: '%', direction: 'higher_better', defaultTarget: 82, yellowTolerance: 8, weight: 5, diagnosticOptions: ['Carteira não trabalhada', 'Baixa cadência', 'Não oferta convergência', 'Outro'] },
  { id: 'I10', title: 'Aparelhos', category: 'Resultado', unit: '%', direction: 'higher_better', defaultTarget: 100, yellowTolerance: 15, weight: 3, diagnosticOptions: ['Baixa oferta', 'Mix inadequado', 'Restrição de estoque', 'Outro'] },
  { id: 'I11', title: 'Gestão de Prospecção', category: 'Processo', unit: '%', direction: 'higher_better', defaultTarget: 90, yellowTolerance: 10, weight: 5, diagnosticOptions: ['Agenda sem blocos protegidos', 'Baixa cadência', 'Funil desatualizado', 'Outro'] },
  { id: 'I12', title: 'Gestão de Funil', category: 'Processo', unit: 'x', direction: 'higher_better', defaultTarget: 3, yellowTolerance: 15, weight: 5, diagnosticOptions: ['Cobertura insuficiente', 'Oportunidades sem próxima ação', 'Baixa conversão', 'Outro'] },
];

const actuals: Record<string, number[]> = {
  O01: [32, 88, 27, 105, 37, 0.8, 8, 12, 85, 102, 94, 3.2],
  O02: [22, 79, 18, 72, 29, 1.3, 13, -4, 74, 81, 76, 2.1],
  O03: [17, 68, 12, 55, 21, 1.7, 17, -11, 66, 64, 61, 1.4],
  O04: [35, 92, 31, 110, 40, 0.7, 7, 18, 89, 108, 96, 3.6],
  O05: [27, 82, 22, 91, 33, 1.1, 11, 3, 80, 94, 84, 2.7],
  O06: [20, 71, 15, 63, 25, 1.5, 15, -7, 70, 73, 69, 1.8],
};

export const indicatorResults: IndicatorResult[] = Object.entries(actuals).flatMap(([operationId, values]) =>
  indicatorDefinitions.map((definition, index) => ({
    id: `IR_${operationId}_${definition.id}`,
    operationId,
    indicatorId: definition.id,
    period: '2026-07',
    target: definition.defaultTarget,
    actual: values[index],
    previousActual: definition.direction === 'higher_better' ? values[index] * 0.9 : values[index] * 1.1,
    updatedAt: '2026-07-20T12:00:00.000Z',
  })),
);

export function calculateIndicatorStatus(definition: IndicatorDefinition, result: IndicatorResult): TrafficLight {
  if (definition.direction === 'higher_better') {
    if (result.actual >= result.target) return 'green';
    if (result.actual >= result.target * (1 - definition.yellowTolerance / 100)) return 'yellow';
    return 'red';
  }
  if (result.actual <= result.target) return 'green';
  if (result.actual <= result.target * (1 + definition.yellowTolerance / 100)) return 'yellow';
  return 'red';
}

export function achievement(definition: IndicatorDefinition, result: IndicatorResult): number {
  if (definition.direction === 'higher_better') {
    if (result.target === 0) return result.actual >= 0 ? 100 : 0;
    return Math.max(0, Math.min(150, (result.actual / result.target) * 100));
  }
  if (result.actual === 0) return 150;
  return Math.max(0, Math.min(150, (result.target / result.actual) * 100));
}
