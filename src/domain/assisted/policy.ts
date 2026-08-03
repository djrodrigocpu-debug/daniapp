/**
 * Espelho de domínio das regras da GESTÃO ASSISTIDA (migrations 0039–0041).
 *
 * ISTO NÃO É SEGURANÇA. A barreira é o servidor: `app.is_assisted_operator`,
 * `app.assisted_status_of`, os gatilhos de imutabilidade e coerência, e a RLS.
 * Este módulo existe para que a interface não OFEREÇA o que será recusado, e
 * para que a regra possa ser lida e testada sem subir um banco.
 *
 * Cada função tem contraparte nominal no servidor. Quando as duas discordarem,
 * quem está certo é o servidor.
 */
import { AuthzSubject, hasRole } from '../authz/policy';
import { IndicatorDirection } from '../model';
import {
  AssistedCycle,
  AssistedEntry,
  AssistedIndicatorStatus,
} from './types';

// ---------------------------------------------------------------------------
// A semana empresarial
// ---------------------------------------------------------------------------

/**
 * Segunda-feira da semana a que o dia pertence. Espelha
 * `app.assisted_week_start(date)`.
 *
 * Opera sobre a data de calendário `AAAA-MM-DD` e usa `Date.UTC` DE PROPÓSITO:
 * construir `new Date('2026-07-27')` já é UTC, e fazer a aritmética em horário
 * local moveria o resultado um dia para quem estiver a oeste de Greenwich. O
 * fuso empresarial entra em `todayInBusinessTimezone`, que é onde ele importa.
 */
export function weekStartOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0 = domingo. A semana empresarial começa na segunda.
  const isoDow = at.getUTCDay() === 0 ? 7 : at.getUTCDay();
  at.setUTCDate(at.getUTCDate() - (isoDow - 1));
  return at.toISOString().slice(0, 10);
}

/** Domingo da mesma semana. */
export function weekEndOf(day: string): string {
  const start = new Date(`${weekStartOf(day)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 6);
  return start.toISOString().slice(0, 10);
}

/**
 * Hoje em `America/Sao_Paulo`. Espelha `app.assisted_today()`.
 *
 * `en-CA` porque é o locale que formata como `AAAA-MM-DD` sem montar a string à
 * mão — e montá-la à mão a partir de `toLocaleDateString('pt-BR')` exigiria
 * inverter os pedaços, que é onde esse tipo de código costuma errar.
 */
export function todayInBusinessTimezone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Rótulo humano da semana: `27/07 a 02/08/2026`. */
export function describeWeek(weekStartDate: string): string {
  const end = weekEndOf(weekStartDate);
  const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return `${br(weekStartDate)} a ${br(end)}/${end.slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// Regra de status
// ---------------------------------------------------------------------------

/**
 * Espelha `app.assisted_status_of`. Tabela de D2, literal.
 *
 * `target_band` LANÇA, e é intencional: a pendência A-01 continua aberta e não
 * há regra. Converter para uma das outras direções, ou devolver `sem_dado` para
 * disfarçar, seria inventar comportamento. Quem chama esta função sobre um
 * indicador `target_band` tem um defeito a corrigir, não um caso a tratar — e o
 * servidor recusa publicá-lo na Gestão Assistida desde a 0037.
 */
export class TargetBandSemRegraError extends Error {
  constructor() {
    super(
      'Direção "faixa alvo" ainda não tem regra de status definida (pendência A-01). '
      + 'A Gestão Assistida não calcula status para este indicador.',
    );
    this.name = 'TargetBandSemRegraError';
  }
}

export function statusOf(
  direction: IndicatorDirection,
  target: number,
  tolerance: number,
  actual: number | null,
): AssistedIndicatorStatus {
  if (direction === 'target_band') throw new TargetBandSemRegraError();
  if (actual === null || actual === undefined || Number.isNaN(actual)) return 'sem_dado';

  // A tolerância é uma PORCENTAGEM DA META, não uma diferença absoluta. É assim
  // desde antes da 1.3.5 (`indicatorStatus.ts`), é o que o formulário de
  // cadastro declara e é o que a prévia de `yellowLimitPreview` mostra.
  //
  // A 1.3.5 nasceu tratando este campo como valor absoluto, e isso era um
  // DEFEITO: com meta 1 e tolerância 20, `Churn` aceitava até 21 como "atenção"
  // em vez de até 1,2. Corrigido aqui e em `app.assisted_status_of` (0053).
  const tol = Math.abs(tolerance ?? 0);
  const limite = direction === 'higher_better'
    ? target * (1 - tol / 100)
    : target * (1 + tol / 100);

  if (direction === 'higher_better') {
    if (actual >= target) return 'conforme';
    return actual >= limite ? 'atencao' : 'nao_conforme';
  }
  if (actual <= target) return 'conforme';
  return actual <= limite ? 'atencao' : 'nao_conforme';
}

/** Texto do status. Nunca só cor — a tela precisa dizer a palavra. */
export function describeStatus(status: AssistedIndicatorStatus): string {
  switch (status) {
    case 'conforme': return 'Conforme';
    case 'atencao': return 'Atenção';
    case 'nao_conforme': return 'Não conforme';
    case 'sem_dado': return 'Sem dado';
  }
}

/** Um desvio exige diagnóstico, plano, responsável e prazo (D2). */
export function isDeviation(status: AssistedIndicatorStatus): boolean {
  return status === 'atencao' || status === 'nao_conforme';
}

// ---------------------------------------------------------------------------
// Autorização — espelho de `app.is_assisted_operator`
// ---------------------------------------------------------------------------

/**
 * Quem EXECUTA a Gestão Assistida: o Gerente de Canal responsável pelo parceiro.
 *
 * Permissão administrativa NÃO é atalho (Matriz §3, nota ¹): ADMIN, REGIONAL e
 * COORDENADOR consultam e acompanham, mas não registram em nome do GC. Se a
 * operação vier a exigir isso, é regra de negócio ainda não declarada.
 */
export function canOperateAssisted(subject: AuthzSubject, operationId: string): boolean {
  return hasRole(subject, 'channel_manager') && subject.assignedOperationIds.includes(operationId);
}

// ---------------------------------------------------------------------------
// Guardas de fechamento — espelho de `close_assisted_cycle`
// ---------------------------------------------------------------------------

export type CloseBlock =
  | { reason: 'ciclo-vazio' }
  | { reason: 'sem-dado'; indicatorCode: string }
  | { reason: 'desvio-sem-diagnostico'; indicatorCode: string }
  | { reason: 'desvio-sem-plano'; indicatorCode: string }
  | { reason: 'plano-sem-responsavel-ou-prazo'; indicatorCode: string };

/**
 * Tudo que impede fechar este ciclo, na ordem em que o servidor recusaria.
 * Lista vazia = o servidor deve aceitar.
 *
 * A ordem importa: o operador que corrigir o primeiro item da lista e tentar de
 * novo deve encontrar o segundo, e não uma recusa diferente da que a interface
 * previu.
 */
export function closeBlocks(cycle: AssistedCycle): CloseBlock[] {
  if (cycle.entries.length === 0) return [{ reason: 'ciclo-vazio' }];

  const ordered = [...cycle.entries].sort(
    (a, b) => a.rule.sortOrder - b.rule.sortOrder || a.indicatorCode.localeCompare(b.indicatorCode),
  );
  const blocks: CloseBlock[] = [];

  for (const e of ordered) {
    if (e.status === 'sem_dado') blocks.push({ reason: 'sem-dado', indicatorCode: e.indicatorCode });
  }
  for (const e of ordered) {
    if (isDeviation(e.status) && e.diagnosis.trim() === '') {
      blocks.push({ reason: 'desvio-sem-diagnostico', indicatorCode: e.indicatorCode });
    }
  }
  for (const e of ordered) {
    if (isDeviation(e.status) && e.plan === null) {
      blocks.push({ reason: 'desvio-sem-plano', indicatorCode: e.indicatorCode });
    }
  }
  for (const e of ordered) {
    if (isDeviation(e.status) && e.plan && (e.plan.owner.trim() === '' || !e.plan.dueDate)) {
      blocks.push({ reason: 'plano-sem-responsavel-ou-prazo', indicatorCode: e.indicatorCode });
    }
  }
  return blocks;
}

/** Texto apresentável de cada bloqueio. Sem jargão de banco. */
export function describeCloseBlock(block: CloseBlock): string {
  switch (block.reason) {
    case 'ciclo-vazio':
      return 'Nenhum indicador aplicável a esta região está configurado para a Gestão Assistida.';
    case 'sem-dado':
      return `${block.indicatorCode}: informe o resultado consultado no relatório oficial da operação.`;
    case 'desvio-sem-diagnostico':
      return `${block.indicatorCode}: o desvio exige diagnóstico.`;
    case 'desvio-sem-plano':
      return `${block.indicatorCode}: o desvio exige plano de ação.`;
    case 'plano-sem-responsavel-ou-prazo':
      return `${block.indicatorCode}: o plano precisa de responsável e prazo.`;
  }
}

/** O ciclo pode ser fechado agora? */
export function canClose(cycle: AssistedCycle): boolean {
  return cycle.status === 'draft' && closeBlocks(cycle).length === 0;
}

/** Ciclo fechado é somente leitura — a evolução continua no plano. */
export function isReadOnly(cycle: AssistedCycle): boolean {
  return cycle.status === 'closed';
}

// ---------------------------------------------------------------------------
// Validação de campos, antes de bater no servidor
// ---------------------------------------------------------------------------

export type EntryFieldError =
  | { field: 'actual'; message: string }
  | { field: 'sourcePeriod'; message: string }
  | { field: 'sourceConsultedAt'; message: string };

/**
 * Espelha a CHECK `assisted_entries_source_ck` e a recusa de
 * `save_assisted_entry`: resultado informado exige período da fonte e data da
 * consulta. Sem resultado, nenhum dos dois é cobrado — pedir data de consulta a
 * quem ainda não consultou nada seria ruído.
 */
export function validateEntryPatch(input: {
  actual: string;
  sourcePeriod: string;
  sourceConsultedAt: string;
}): EntryFieldError[] {
  const errors: EntryFieldError[] = [];
  const raw = input.actual.trim();
  if (raw === '') return errors;

  if (Number.isNaN(Number(raw.replace(',', '.')))) {
    errors.push({ field: 'actual', message: 'Informe um número.' });
    return errors;
  }
  if (input.sourcePeriod.trim() === '') {
    errors.push({ field: 'sourcePeriod', message: 'Informe o período da fonte.' });
  }
  if (input.sourceConsultedAt.trim() === '') {
    errors.push({ field: 'sourceConsultedAt', message: 'Informe a data da consulta.' });
  }
  return errors;
}

/** Converte o texto do campo em número, aceitando vírgula decimal. */
export function parseActual(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Agrupamento para exibição
// ---------------------------------------------------------------------------

export interface AssistedThemeGroup {
  themeId: string;
  themeCode: string;
  themeName: string;
  entries: AssistedEntry[];
}

/**
 * Itens agrupados por tema, na ordem que a região configurou.
 *
 * O tema vem do NOME COPIADO no item, não do catálogo atual: renomear o tema
 * amanhã não pode reescrever a leitura de um ciclo fechado (Modelo Operacional
 * §4.3).
 */
export function groupByTheme(entries: AssistedEntry[]): AssistedThemeGroup[] {
  const groups = new Map<string, AssistedThemeGroup>();
  const ordered = [...entries].sort(
    (a, b) => a.rule.sortOrder - b.rule.sortOrder || a.indicatorCode.localeCompare(b.indicatorCode),
  );
  for (const e of ordered) {
    const themeId = e.provenance.themeId;
    const g = groups.get(themeId);
    if (g) g.entries.push(e);
    else groups.set(themeId, {
      themeId,
      themeCode: e.themeCode,
      themeName: e.themeName,
      entries: [e],
    });
  }
  return [...groups.values()];
}

/** Contagem por status, para o resumo do cabeçalho. */
export function countByStatus(entries: AssistedEntry[]): Record<AssistedIndicatorStatus, number> {
  const counts: Record<AssistedIndicatorStatus, number> = {
    conforme: 0, atencao: 0, nao_conforme: 0, sem_dado: 0,
  };
  for (const e of entries) counts[e.status] += 1;
  return counts;
}
