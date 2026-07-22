import { describe, it, expect } from 'vitest';
import { canPropose, canModerate, assertCanPublish, BestPracticeDraft } from './bestPractice';
import { AuthzSubject } from '../authz/policy';

function subject(partial: Partial<AuthzSubject>): AuthzSubject {
  return { userId: 'u1', roles: [], regionIds: [], coordinationIds: [], assignedOperationIds: [], ...partial };
}

const validDraft: BestPracticeDraft = { title: 'Golden hour', content: 'Rotina diária de prospecção com blocos protegidos.', containsPersonalData: false };

describe('boas práticas (§7.9, T27)', () => {
  it('todos os perfis podem propor', () => {
    for (const role of ['admin', 'regional', 'coordinator', 'channel_manager'] as const) {
      expect(canPropose(subject({ roles: [role] }))).toBe(true);
    }
  });

  it('somente coordenador/admin moderam', () => {
    expect(canModerate(subject({ roles: ['coordinator'] }))).toBe(true);
    expect(canModerate(subject({ roles: ['admin'] }))).toBe(true);
    expect(canModerate(subject({ roles: ['channel_manager'] }))).toBe(false);
  });

  it('GC não publica', () => {
    const r = assertCanPublish(subject({ roles: ['channel_manager'] }), validDraft);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('authz/forbidden');
  });

  it('bloqueia publicação com dado pessoal (T27)', () => {
    const r = assertCanPublish(subject({ roles: ['coordinator'] }), { ...validDraft, containsPersonalData: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('validation/invalid-input');
  });

  it('coordenador publica boa prática válida', () => {
    expect(assertCanPublish(subject({ roles: ['coordinator'] }), validDraft).ok).toBe(true);
  });
});
