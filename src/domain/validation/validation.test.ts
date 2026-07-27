import { describe, it, expect } from 'vitest';
import { assertCanValidate, assertNoBatchApproval, ValidationRequest } from './validation';
import { AuthzSubject, ScopedOperation } from '../authz/policy';

const op: ScopedOperation = { id: 'op-A', regionId: 'reg-1', coordinationId: 'coord-1' };

function coord(userId: string): AuthzSubject {
  return { userId, roles: ['coordinator'], regionIds: [], coordinationIds: ['coord-1'], assignedOperationIds: [] };
}

describe('assertCanValidate (T02)', () => {
  it('bloqueia autoaprovação com erro crítico', () => {
    const req: ValidationRequest = {
      evaluation: { id: 'e1', authorUserId: 'u1', operation: op },
      decision: 'approved',
      reason: '',
    };
    const r = assertCanValidate(coord('u1'), req);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('authz/self-approval');
      expect(r.error.severity).toBe('critical');
    }
  });

  it('permite aprovar submissão de outro no escopo', () => {
    const req: ValidationRequest = {
      evaluation: { id: 'e1', authorUserId: 'u2', operation: op },
      decision: 'approved',
      reason: '',
    };
    expect(assertCanValidate(coord('u1'), req).ok).toBe(true);
  });

  it('devolução exige motivo estruturado', () => {
    const req: ValidationRequest = {
      evaluation: { id: 'e1', authorUserId: 'u2', operation: op },
      decision: 'returned',
      reason: 'x',
    };
    const r = assertCanValidate(coord('u1'), req);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('validation/invalid-input');
  });

  it('devolução com motivo suficiente é aceita', () => {
    const req: ValidationRequest = {
      evaluation: { id: 'e1', authorUserId: 'u2', operation: op },
      decision: 'returned',
      reason: 'Falta evidência no tema de churn.',
    };
    expect(assertCanValidate(coord('u1'), req).ok).toBe(true);
  });
});

describe('assertNoBatchApproval (§7.8 / R24)', () => {
  it('bloqueia aprovação em lote', () => {
    expect(assertNoBatchApproval(['approved', 'approved']).ok).toBe(false);
  });
  it('permite uma aprovação por vez', () => {
    expect(assertNoBatchApproval(['approved']).ok).toBe(true);
    expect(assertNoBatchApproval(['returned', 'returned']).ok).toBe(true);
  });
});
