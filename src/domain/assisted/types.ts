/**
 * Contratos de domínio da GESTÃO ASSISTIDA semanal (AAPEx 1.3.5, decisão D1).
 *
 * Espelham as migrations 0039–0041 e nada mais. Onde o servidor calcula, aqui há
 * um campo de LEITURA — nunca um que a interface possa preencher: `status` e
 * `ruleVersion` não entram em nenhum tipo de entrada, porque não é a interface
 * que os produz.
 *
 * TERMINOLOGIA (D8, obrigatória). "Relatório oficial da operação" é a FONTE
 * EXTERNA que o Gerente de Canal consulta. Não confundir com o "Relatório
 * Oficial da Auditoria Mensal", que é o PDF produzido pelo AAPEx.
 */
import { IndicatorDirection } from '../model';

/** Rascunho ou fechado. Não há terceiro estado, e não há reabertura. */
export type AssistedCycleStatus = 'draft' | 'closed';

/**
 * Status calculado pelo servidor a partir da regra materializada no item.
 *
 * `sem_dado` NÃO é não conformidade (Modelo Operacional §2.4): é ausência de
 * dado, e alimenta o quadrante "Sem dado suficiente" da Matriz.
 */
export type AssistedIndicatorStatus = 'conforme' | 'atencao' | 'nao_conforme' | 'sem_dado';

/** Origem de um plano no motor único (D6). */
export type ActionPlanSource = 'legacy' | 'assisted' | 'monthly_audit';

/**
 * A regra CONGELADA no item, copiada da configuração regional no ato da
 * abertura do ciclo.
 *
 * É o que impede o recálculo histórico: mudar a meta amanhã altera a
 * configuração regional, e não altera nada aqui.
 */
export interface AssistedRuleSnapshot {
  target: number;
  tolerance: number;
  weight: number;
  unit: string;
  direction: IndicatorDirection;
  orientation: string;
  sortOrder: number;
}

/** De onde o Gerente de Canal tirou o número. */
export interface AssistedSourceReference {
  /** Período da FONTE externa, como o relatório oficial da operação o nomeia. */
  period: string;
  /** Data em que a consulta foi feita, no formato AAAA-MM-DD. */
  consultedAt: string | null;
  /** Referência textual livre — aba, painel, seção. Opcional. */
  reference: string;
}

/** O plano vinculado ao item, no seu estado ATUAL — não no do fechamento. */
export interface AssistedPlanLink {
  id: string;
  action: string;
  problem: string;
  owner: string;
  dueDate: string;
  priority: string;
  /** Vocabulário de interface do motor de planos (`not_started`, `validated`…). */
  status: string;
  source: ActionPlanSource;
}

/** Proveniência do item: a que objetos de catálogo a regra congelada se refere. */
export interface AssistedEntryProvenance {
  indicatorDefinitionId: string;
  indicatorVersionId: string;
  regionalConfigId: string;
  regionalConfigVersionId: string;
  themeId: string;
  themeVersionId: string;
}

export interface AssistedEntry {
  id: string;
  cycleId: string;
  provenance: AssistedEntryProvenance;

  indicatorCode: string;
  indicatorName: string;
  themeCode: string;
  themeName: string;

  rule: AssistedRuleSnapshot;

  /** `null` é SEM DADO, e é o estado inicial legítimo de toda entrada. */
  actual: number | null;
  source: AssistedSourceReference;
  observation: string;
  diagnosis: string;

  /** Calculado e gravado pelo servidor. Somente leitura. */
  status: AssistedIndicatorStatus;
  /** Versão da regra que produziu o status. Somente leitura. */
  ruleVersion: string;

  recordedBy: string | null;
  recordedAt: string | null;

  plan: AssistedPlanLink | null;
}

export interface AssistedCycle {
  id: string;
  operationId: string;
  partnerName: string;
  /** Segunda-feira da semana, AAAA-MM-DD. */
  weekStartDate: string;
  /** Domingo da mesma semana, AAAA-MM-DD. */
  weekEndDate: string;
  status: AssistedCycleStatus;
  authorUserId: string;
  closedAt: string | null;
  closedBy: string | null;
  /** Preenchida só no fechamento. */
  ruleVersion: string | null;
  entries: AssistedEntry[];
}

/** Linha da consulta histórica — o suficiente para listar sem carregar itens. */
export interface AssistedCycleSummary {
  id: string;
  operationId: string;
  weekStartDate: string;
  weekEndDate: string;
  status: AssistedCycleStatus;
  closedAt: string | null;
  entryCount: number;
  deviationCount: number;
  missingCount: number;
}

/**
 * O que a interface pode enviar de um item. Note o que NÃO está aqui: `status`,
 * `ruleVersion`, meta, tolerância, peso e tema. Nenhum deles é do cliente.
 */
export interface AssistedEntryPatch {
  actual?: number | null;
  sourcePeriod?: string;
  sourceConsultedAt?: string | null;
  sourceReference?: string;
  observation?: string;
  diagnosis?: string;
}

/** O que a interface envia para criar ou editar o plano do desvio. */
export interface AssistedPlanInput {
  /** Presente = edição; ausente = criação. */
  id?: string;
  action: string;
  problem?: string;
  owner: string;
  dueDate: string;
  priority?: 'high' | 'medium' | 'low';
}
