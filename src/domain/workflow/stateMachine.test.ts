import { describe, it, expect } from 'vitest';
import { canTransitionVisit, canTransitionEvaluation, canTransitionAction } from './stateMachine';

describe('transições de avaliação (§6.3)', () => {
  it('draft -> submitted permitido', () => expect(canTransitionEvaluation('draft', 'submitted').ok).toBe(true));
  it('submitted -> approved permitido', () => expect(canTransitionEvaluation('submitted', 'approved').ok).toBe(true));
  it('submitted -> returned permitido', () => expect(canTransitionEvaluation('submitted', 'returned').ok).toBe(true));
  it('approved -> draft PROIBIDO (imutável)', () => expect(canTransitionEvaluation('approved', 'draft').ok).toBe(false));
  it('approved -> superseded permitido (adendo)', () => expect(canTransitionEvaluation('approved', 'superseded').ok).toBe(true));
  it('draft -> approved PROIBIDO (pula submissão)', () => expect(canTransitionEvaluation('draft', 'approved').ok).toBe(false));
});

describe('transições de visita', () => {
  it('planned -> draft', () => expect(canTransitionVisit('planned', 'draft').ok).toBe(true));
  it('approved é terminal', () => expect(canTransitionVisit('approved', 'draft').ok).toBe(false));
});

describe('transições de plano de ação (manual do GC normativo)', () => {
  it('open -> in_progress', () => expect(canTransitionAction('open', 'in_progress').ok).toBe(true));
  it('open -> waiting_partner e blocked (esperas distintas)', () => {
    expect(canTransitionAction('open', 'waiting_partner').ok).toBe(true);
    expect(canTransitionAction('open', 'blocked').ok).toBe(true);
  });
  it('open -> done PROIBIDO (não pula andamento)', () => expect(canTransitionAction('open', 'done').ok).toBe(false));
  it('open -> validated PROIBIDO', () => expect(canTransitionAction('open', 'validated').ok).toBe(false));
  it('waiting_partner <-> blocked circulam entre si e com in_progress', () => {
    expect(canTransitionAction('waiting_partner', 'blocked').ok).toBe(true);
    expect(canTransitionAction('blocked', 'waiting_partner').ok).toBe(true);
    expect(canTransitionAction('waiting_partner', 'in_progress').ok).toBe(true);
  });
  it('esperas concluem direto', () => {
    expect(canTransitionAction('waiting_partner', 'done').ok).toBe(true);
    expect(canTransitionAction('blocked', 'done').ok).toBe(true);
  });
  it('in_progress -> validated PROIBIDO (validado exige concluído)', () =>
    expect(canTransitionAction('in_progress', 'validated').ok).toBe(false));
  it('done -> in_progress (reabertura ANTES da validação §7.7)', () => expect(canTransitionAction('done', 'in_progress').ok).toBe(true));
  it('done -> validated permitido (papel é checado fora da tabela)', () =>
    expect(canTransitionAction('done', 'validated').ok).toBe(true));
  it('validated é terminal', () => {
    expect(canTransitionAction('validated', 'in_progress').ok).toBe(false);
    expect(canTransitionAction('validated', 'done').ok).toBe(false);
    expect(canTransitionAction('validated', 'open').ok).toBe(false);
  });
  it('overdue legado sai como in_progress (divergência registrada)', () => {
    expect(canTransitionAction('overdue', 'in_progress').ok).toBe(true);
    expect(canTransitionAction('overdue', 'done').ok).toBe(true);
    expect(canTransitionAction('overdue', 'validated').ok).toBe(false);
  });
  it('nenhuma transição ENTRA em overdue (vencido deriva da data)', () => {
    for (const from of ['open', 'in_progress', 'waiting_partner', 'blocked', 'done'] as const) {
      expect(canTransitionAction(from, 'overdue').ok).toBe(false);
    }
  });
  it('cancelled_justified é terminal', () => expect(canTransitionAction('cancelled_justified', 'open').ok).toBe(false));
});
