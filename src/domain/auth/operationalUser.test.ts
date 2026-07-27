import { describe, it, expect } from 'vitest';
import { operationalUserFromSession, primaryRole } from './operationalUser';
import { AuthenticatedSession } from '../repositories';
import { Role, UserScope, UserStatus } from '../model';

function scope(role: Role, over: Partial<UserScope> = {}): UserScope {
  return {
    id: `sc_${role}`, userId: 'u1', role,
    regionId: null, coordinationId: null, unitId: null, operationIds: [],
    validFrom: '2020-01-01T00:00:00.000Z', validTo: null, active: true, ...over,
  };
}

function session(over: Partial<AuthenticatedSession> = {}): AuthenticatedSession {
  return {
    user: {
      id: 'u1', displayName: 'Rodrigo Souza Filho', corporateEmail: 'rodrigo@corp.example',
      status: 'active' as UserStatus, createdAt: '', updatedAt: '',
    },
    scopes: [], roles: [], accessTokenExpiresAt: '2999-01-01T00:00:00.000Z', ...over,
  };
}

describe('operationalUserFromSession (identidade da sessão corporativa)', () => {
  it('admin com TODOS os IDs hierárquicos nulos é identidade válida (role=admin)', () => {
    const u = operationalUserFromSession(session({ roles: ['admin'], scopes: [scope('admin')] }));
    expect(u).not.toBeNull();
    expect(u!.role).toBe('admin');
    expect(u!.id).toBe('u1');
    expect(u!.name).toBe('Rodrigo Souza Filho');
    expect(u!.email).toBe('rodrigo@corp.example');
    expect(u!.avatarInitials).toBe('RS');
    expect(u!.active).toBe(true);
  });

  it('admin NÃO cai em "Perfil sem vínculo" (não retorna null)', () => {
    expect(operationalUserFromSession(session({ roles: ['admin'], scopes: [scope('admin')] }))).not.toBeNull();
  });

  it('coordinator com coordinationId → User coordinator (coordinatorId preenchido)', () => {
    const u = operationalUserFromSession(
      session({ roles: ['coordinator'], scopes: [scope('coordinator', { coordinationId: 'coord-123' })] }),
    );
    expect(u!.role).toBe('coordinator');
    expect(u!.coordinatorId).toBe('coord-123');
  });

  it('regional com regionId → User regional; região é rótulo neutro (sem UUID)', () => {
    const u = operationalUserFromSession(
      session({ roles: ['regional'], scopes: [scope('regional', { regionId: 'reg-9' })] }),
    );
    expect(u!.role).toBe('regional');
    expect(u!.region).toBe('Gerência Regional');
    expect(u!.region).not.toContain('reg-9');
  });

  it('sessão sem papéis/escopos ativos → null', () => {
    expect(operationalUserFromSession(session({ roles: [], scopes: [] }))).toBeNull();
  });

  it('sessão nula → null', () => {
    expect(operationalUserFromSession(null)).toBeNull();
  });

  it('múltiplos papéis: prioridade escolhe admin', () => {
    const u = operationalUserFromSession(session({
      roles: ['channel_manager', 'coordinator', 'admin'],
      scopes: [scope('channel_manager'), scope('coordinator'), scope('admin')],
    }));
    expect(u!.role).toBe('admin');
  });

  it('status != active reflete active=false na identidade', () => {
    const u = operationalUserFromSession(session({
      roles: ['admin'], scopes: [scope('admin')],
      user: { id: 'u1', displayName: 'X Y', corporateEmail: 'x@y.z', status: 'suspended', createdAt: '', updatedAt: '' },
    }));
    expect(u!.active).toBe(false);
  });
});

describe('primaryRole', () => {
  it('respeita admin > regional > coordinator > channel_manager', () => {
    expect(primaryRole(['coordinator', 'regional'])).toBe('regional');
    expect(primaryRole(['channel_manager', 'admin'])).toBe('admin');
    expect(primaryRole(['channel_manager'])).toBe('channel_manager');
    expect(primaryRole([])).toBeNull();
  });
});
