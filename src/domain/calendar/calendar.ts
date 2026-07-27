/**
 * Regras de calendário (Masterplan §6.1, §6.2, §7.3; Anexo D — T12).
 *
 * A rotina "terça semanal / primeira segunda mensal" é uma REGRA CONFIGURÁVEL,
 * nunca data hardcoded. Todas as funções são puras e determinísticas, operando
 * sobre datas ISO `YYYY-MM-DD` para evitar deriva de fuso.
 */
import { CalendarException, VisitRule } from '../model';

/** Dia da semana (0=domingo..6=sábado) de uma data ISO, sem efeito de fuso. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function toISO(y: number, m0: number, d: number): string {
  const dt = new Date(Date.UTC(y, m0, d));
  return dt.toISOString().slice(0, 10);
}

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Próxima ocorrência de `weekday` a partir de `fromISO`. Se `inclusive` e a data
 * já é o dia desejado, retorna a própria data.
 */
export function nextWeekday(fromISO: string, weekday: number, inclusive = true): string {
  const current = weekdayOf(fromISO);
  let delta = (weekday - current + 7) % 7;
  if (delta === 0 && !inclusive) delta = 7;
  return addDaysISO(fromISO, delta);
}

/**
 * N-ésima ocorrência de um dia da semana no mês (ex.: 1ª segunda-feira).
 * `month` é 1–12. Retorna ISO `YYYY-MM-DD`.
 */
export function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): string {
  const firstISO = toISO(year, month - 1, 1);
  const firstWeekday = weekdayOf(firstISO);
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (ordinal - 1) * 7;
  return toISO(year, month - 1, day);
}

/** Data da visita semanal da semana que contém `referenceISO`. */
export function weeklyVisitDate(referenceISO: string, rule: VisitRule): string {
  // Início da semana (domingo) e soma do weekday configurado.
  const wd = weekdayOf(referenceISO);
  const sunday = addDaysISO(referenceISO, -wd);
  return addDaysISO(sunday, rule.weeklyVisitWeekday);
}

/** Data da auditoria mensal do mês de `year/month` (1–12). */
export function monthlyAuditDate(year: number, month: number, rule: VisitRule): string {
  return nthWeekdayOfMonth(year, month, rule.monthlyAuditWeekday, rule.monthlyAuditWeekOrdinal);
}

export interface ResolvedDate {
  date: string;
  status: 'scheduled' | 'rescheduled' | 'cancelled_justified' | 'not_performed' | 'holiday';
  reason?: string;
}

/**
 * Aplica exceções de calendário a uma data planejada (§6.2). Feriado ou
 * reprogramação NÃO apaga a obrigação — muda estado e, se for o caso, a data.
 */
export function resolveWithExceptions(plannedISO: string, exceptions: CalendarException[]): ResolvedDate {
  const match = exceptions.find((e) => e.date === plannedISO);
  if (!match) return { date: plannedISO, status: 'scheduled' };

  switch (match.kind) {
    case 'rescheduled':
      return { date: match.rescheduledTo ?? plannedISO, status: 'rescheduled', reason: match.reason };
    case 'holiday':
      // feriado: reprograma para o próximo dia útil (seg-sex) se não houver data explícita
      return {
        date: match.rescheduledTo ?? nextBusinessDay(plannedISO),
        status: 'holiday',
        reason: match.reason,
      };
    case 'cancelled_justified':
      return { date: plannedISO, status: 'cancelled_justified', reason: match.reason };
    case 'not_performed':
      return { date: plannedISO, status: 'not_performed', reason: match.reason };
    default:
      return { date: plannedISO, status: 'scheduled' };
  }
}

/** Próximo dia útil (seg–sex) após uma data. */
export function nextBusinessDay(isoDate: string): string {
  let next = addDaysISO(isoDate, 1);
  while (weekdayOf(next) === 0 || weekdayOf(next) === 6) {
    next = addDaysISO(next, 1);
  }
  return next;
}

/** Aderência: distingue atraso de cancelamento legítimo (§6.2, Anexo F). */
export function isOnTime(actualISO: string, plannedISO: string, toleranceDays: number): boolean {
  const diff = daysBetween(plannedISO, actualISO);
  return diff <= toleranceDays;
}

export function daysBetween(startISO: string, endISO: string): number {
  const [y1, m1, d1] = startISO.split('-').map(Number);
  const [y2, m2, d2] = endISO.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}
