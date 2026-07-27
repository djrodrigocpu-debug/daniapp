import { describe, it, expect } from 'vitest';
import { canSubmit, SubmissionItem } from './submission';

function item(partial: Partial<SubmissionItem>): SubmissionItem {
  return {
    itemId: 'T01',
    title: 'Tema',
    required: true,
    evidenceRequired: false,
    status: 'green',
    evidenceCount: 0,
    hasActionPlan: false,
    ...partial,
  };
}

describe('canSubmit (§6.1, §7.4)', () => {
  it('permite quando tudo está completo e conforme', () => {
    const r = canSubmit([item({ status: 'green' }), item({ itemId: 'T02', status: 'yellow' })]);
    expect(r.ok).toBe(true);
  });

  it('bloqueia item obrigatório não avaliado (completude)', () => {
    const r = canSubmit([item({ status: 'not_evaluated' })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('validation/incomplete');
  });

  it('bloqueia sem evidência obrigatória (T14)', () => {
    const r = canSubmit([item({ evidenceRequired: true, evidenceCount: 0, status: 'green' })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('validation/missing-evidence');
  });

  it('não exige evidência quando item é não aplicável', () => {
    const r = canSubmit([item({ evidenceRequired: true, evidenceCount: 0, status: 'not_applicable' })]);
    expect(r.ok).toBe(true);
  });

  it('bloqueia item vermelho sem plano de ação (T13)', () => {
    const r = canSubmit([item({ status: 'red', hasActionPlan: false })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('validation/missing-action-plan');
  });

  it('permite item vermelho com plano de ação', () => {
    const r = canSubmit([item({ status: 'red', hasActionPlan: true })]);
    expect(r.ok).toBe(true);
  });

  it('bloqueia avaliação sem itens', () => {
    expect(canSubmit([]).ok).toBe(false);
  });
});
