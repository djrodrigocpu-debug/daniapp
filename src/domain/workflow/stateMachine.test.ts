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

describe('transições de plano de ação', () => {
  it('open -> in_progress', () => expect(canTransitionAction('open', 'in_progress').ok).toBe(true));
  it('done -> in_progress (reabertura preserva histórico §7.7)', () => expect(canTransitionAction('done', 'in_progress').ok).toBe(true));
  it('cancelled_justified é terminal', () => expect(canTransitionAction('cancelled_justified', 'open').ok).toBe(false));
});
