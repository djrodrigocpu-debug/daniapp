import { describe, it, expect } from 'vitest';
import { resolveIdentity } from './useOperationalUser';
import { AuthenticatedSession } from '../domain/repositories';
import { User } from '../types';

const adminSession: AuthenticatedSession = {
  user: {
    id: 'remote-uuid', displayName: 'Rodrigo Souza Filho', corporateEmail: 'djrodrigocpu@gmail.com',
    status: 'active', createdAt: '', updatedAt: '',
  },
  scopes: [{
    id: 's', userId: 'remote-uuid', role: 'admin',
    regionId: null, coordinationId: null, unitId: null, operationIds: [],
    validFrom: '2020-01-01T00:00:00.000Z', validTo: null, active: true,
  }],
  roles: ['admin'],
  accessTokenExpiresAt: '2999-01-01T00:00:00.000Z',
};

// Seed local propositalmente SEM o usuário remoto (id/e-mail diferentes).
const localUsers: User[] = [
  { id: 'U01', name: 'Seed Admin', email: 'seed@aace.app', role: 'admin', region: 'PR', avatarInitials: 'SA', active: true },
];

describe('resolveIdentity — separação por modo de autenticação', () => {
  it('supabase: identidade vem da SESSÃO mesmo com localStore vazio', () => {
    const u = resolveIdentity('supabase', adminSession, []);
    expect(u).not.toBeNull();
    expect(u!.id).toBe('remote-uuid');
    expect(u!.role).toBe('admin');
  });

  it('supabase: NUNCA consulta localStore.users (usa a sessão, ignora o seed presente)', () => {
    const u = resolveIdentity('supabase', adminSession, localUsers);
    expect(u!.id).toBe('remote-uuid'); // id da sessão, não 'U01' do seed
    expect(u!.email).toBe('djrodrigocpu@gmail.com');
  });

  it('demo: resolve a partir do diretório local (seed)', () => {
    const demoSession: AuthenticatedSession = {
      ...adminSession,
      user: { ...adminSession.user, id: 'U01', corporateEmail: 'seed@aace.app' },
    };
    const u = resolveIdentity('demo', demoSession, localUsers);
    expect(u!.id).toBe('U01');
    expect(u!.name).toBe('Seed Admin');
  });

  it('demo sem correspondência no seed → null (depende do local)', () => {
    expect(resolveIdentity('demo', adminSession, [])).toBeNull();
  });

  it('unconfigured → null', () => {
    expect(resolveIdentity('unconfigured', adminSession, localUsers)).toBeNull();
  });
});
