import { describe, it, expect } from 'vitest';
import {
  weekdayOf,
  nextWeekday,
  nthWeekdayOfMonth,
  weeklyVisitDate,
  monthlyAuditDate,
  resolveWithExceptions,
  nextBusinessDay,
  isOnTime,
  daysBetween,
} from './calendar';
import { VisitRule, CalendarException } from '../model';

const rule: VisitRule = {
  id: 'r1',
  unitId: 'u1',
  weeklyVisitWeekday: 2, // terça
  monthlyAuditWeekOrdinal: 1,
  monthlyAuditWeekday: 1, // segunda
  toleranceDays: 2,
};

describe('weekdayOf', () => {
  it('2026-07-06 é segunda-feira (1)', () => expect(weekdayOf('2026-07-06')).toBe(1));
  it('2026-07-21 é terça-feira (2)', () => expect(weekdayOf('2026-07-21')).toBe(2));
});

describe('nthWeekdayOfMonth — primeira segunda (§6.1)', () => {
  it('1ª segunda de julho/2026 = 2026-07-06', () => {
    expect(nthWeekdayOfMonth(2026, 7, 1, 1)).toBe('2026-07-06');
  });
  it('resultado é sempre o dia da semana pedido no mês pedido', () => {
    const d = nthWeekdayOfMonth(2026, 3, 1, 1); // 1ª segunda de março
    expect(weekdayOf(d)).toBe(1);
    expect(d.startsWith('2026-03')).toBe(true);
    expect(Number(d.slice(8))).toBeLessThanOrEqual(7);
  });
});

describe('nextWeekday', () => {
  it('próxima terça a partir de qua 2026-07-22 = 2026-07-28', () => {
    expect(nextWeekday('2026-07-22', 2)).toBe('2026-07-28');
  });
  it('inclusive: se já é o dia, retorna a própria data', () => {
    expect(nextWeekday('2026-07-21', 2, true)).toBe('2026-07-21');
  });
});

describe('weeklyVisitDate / monthlyAuditDate', () => {
  it('terça da semana de 2026-07-22 = 2026-07-21', () => {
    expect(weeklyVisitDate('2026-07-22', rule)).toBe('2026-07-21');
  });
  it('auditoria mensal julho/2026 = 2026-07-06', () => {
    expect(monthlyAuditDate(2026, 7, rule)).toBe('2026-07-06');
  });
});

describe('resolveWithExceptions (§6.2, T12)', () => {
  it('feriado reprograma sem apagar a obrigação', () => {
    const exc: CalendarException[] = [
      { id: 'e1', unitId: 'u1', date: '2026-07-21', kind: 'holiday', reason: 'Feriado municipal' },
    ];
    const r = resolveWithExceptions('2026-07-21', exc);
    expect(r.status).toBe('holiday');
    expect(r.date).toBe('2026-07-22'); // próximo dia útil
    expect(r.reason).toBe('Feriado municipal');
  });

  it('reprogramação usa a data indicada', () => {
    const exc: CalendarException[] = [
      { id: 'e2', unitId: 'u1', date: '2026-07-21', kind: 'rescheduled', reason: 'x', rescheduledTo: '2026-07-23' },
    ];
    expect(resolveWithExceptions('2026-07-21', exc).date).toBe('2026-07-23');
  });

  it('cancelamento justificado mantém a data e marca o estado', () => {
    const exc: CalendarException[] = [
      { id: 'e3', unitId: 'u1', date: '2026-07-21', kind: 'cancelled_justified', reason: 'Operação fechada' },
    ];
    const r = resolveWithExceptions('2026-07-21', exc);
    expect(r.status).toBe('cancelled_justified');
    expect(r.date).toBe('2026-07-21');
  });

  it('sem exceção retorna agendado', () => {
    expect(resolveWithExceptions('2026-07-21', []).status).toBe('scheduled');
  });
});

describe('nextBusinessDay / isOnTime / daysBetween', () => {
  it('próximo dia útil pula fim de semana (sáb 2026-07-25 -> seg 2026-07-27)', () => {
    expect(nextBusinessDay('2026-07-25')).toBe('2026-07-27');
  });
  it('aderência: dentro da tolerância é no prazo', () => {
    expect(isOnTime('2026-07-23', '2026-07-21', 2)).toBe(true);
    expect(isOnTime('2026-07-24', '2026-07-21', 2)).toBe(false);
  });
  it('daysBetween', () => expect(daysBetween('2026-07-21', '2026-07-24')).toBe(3));
});
