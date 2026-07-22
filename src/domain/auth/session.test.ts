import { describe, it, expect } from 'vitest';
import { activeScopes, rolesFromScopes, subjectFromSession, isSessionExpired } from './session';
import { UserScope } from '../model';

function scope(partial: Partial<UserScope>): UserScope {
  return {
    id: 's1', userId: 'u1', role: 'channel_manager',
    regionId: null, coordinationId: null, unitId: null, operationIds: [],
    validFrom: '2026-01-01T00:00:00Z', validTo: null, active: true, ...partial,
  };
}

const NOW = '2026-07-22T12:00:00Z';

describe('activeScopes (§5.4)', () => {
  it('ignora escopos inativos ou vencidos', () => {
    const scopes = [
      scope({ id: 'a', active: true }),
      scope({ id: 'b', active: false }),
      scope({ id: 'c', validTo: '2026-06-01T00:00:00Z' }), // vencido
      scope({ id: 'd', validFrom: '2027-01-01T00:00:00Z' }), // futuro
    ];
    const ids = activeScopes(scopes, NOW).map((s) => s.id);
    expect(ids).toEqual(['a']);
  });
});

describe('rolesFromScopes', () => {
  it('deriva papéis únicos dos escopos ativos', () => {
    const scopes = [
      scope({ role: 'coordinator', coordinationId: 'coord-1' }),
      scope({ role: 'channel_manager', operationIds: ['op-A'] }),
    ];
    expect(rolesFromScopes(scopes, NOW).sort()).toEqual(['channel_manager', 'coordinator']);
  });
});

describe('subjectFromSession', () => {
  it('achata regiões, coordenadorias e operações atribuídas', () => {
    const subject = subjectFromSession({
      userId: 'u1',
      accessTokenExpiresAt: '2026-07-22T13:00:00Z',
      scopes: [
        scope({ role: 'regional', regionId: 'reg-1' }),
        scope({ role: 'coordinator', coordinationId: 'coord-1' }),
        scope({ role: 'channel_manager', operationIds: ['op-A', 'op-B'] }),
      ],
    }, NOW);
    expect(subject.regionIds).toEqual(['reg-1']);
    expect(subject.coordinationIds).toEqual(['coord-1']);
    expect(subject.assignedOperationIds).toEqual(['op-A', 'op-B']);
    expect(subject.roles.sort()).toEqual(['channel_manager', 'coordinator', 'regional']);
  });
});

describe('isSessionExpired (T10)', () => {
  it('detecta token vencido', () => {
    expect(isSessionExpired({ accessTokenExpiresAt: '2026-07-22T11:00:00Z' }, NOW)).toBe(true);
  });
  it('sessão válida não está expirada', () => {
    expect(isSessionExpired({ accessTokenExpiresAt: '2026-07-22T13:00:00Z' }, NOW)).toBe(false);
  });
});
