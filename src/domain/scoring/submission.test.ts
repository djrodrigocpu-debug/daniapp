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

  it('não exige evidência quando item é não aplicável (justificado)', () => {
    const r = canSubmit([item({ evidenceRequired: true, evidenceCount: 0, status: 'not_applicable', notApplicableReason: 'Operação não comercializa este produto.' })]);
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

describe('portão de justificativa do não aplicável (Correção B)', () => {
  const na = (reason?: string) => item({ status: 'not_applicable', notApplicableReason: reason });

  it('justificativa válida passa', () => {
    expect(canSubmit([na('O parceiro não opera este segmento.')]).ok).toBe(true);
  });

  it('vazia falha', () => {
    const r = canSubmit([na('')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('Justifique');
  });

  it('ausente falha', () => {
    expect(canSubmit([na(undefined)]).ok).toBe(false);
  });

  it('curta falha (menos de 10 caracteres úteis)', () => {
    expect(canSubmit([na('curta')]).ok).toBe(false);
  });

  it('só espaços falham', () => {
    expect(canSubmit([na('          ')]).ok).toBe(false);
  });

  it('pontuação vazia falha (pontos, hífens, sublinhados)', () => {
    expect(canSubmit([na('.......... ---- ____')]).ok).toBe(false);
  });

  it('não quebra os três portões anteriores', () => {
    expect(canSubmit([item({ status: 'not_evaluated' })]).ok).toBe(false); // completude
    expect(canSubmit([item({ evidenceRequired: true, evidenceCount: 0 })]).ok).toBe(false); // evidência
    expect(canSubmit([item({ status: 'red', hasActionPlan: false })]).ok).toBe(false); // vermelho
  });
});
