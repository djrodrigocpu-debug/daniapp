/**
 * Testes da ponte de identidade demo → sessão corporativa (§8, §9.3).
 * Garante que o login corporativo (mesmo em modo demo) resolve o `User`
 * operacional e o escopo correto, sem atalho demonstrativo.
 */
import { describe, it, expect } from 'vitest';
import {
  buildOperationalDemoDirectory,
  operationalDemoDirectory,
  resolveOperationalUser,
} from './demoDirectory';
import { rolesFromScopes } from '../domain/auth/session';
import { subjectFromSession } from '../domain/auth/session';
import { canAccessOperation, canManageUsers, isAdmin } from '../domain/authz/policy';
import { initialData } from './mock';
import { Operation, User } from '../types';

const users: User[] = [
  { id: 'U00', name: 'Admin', email: 'admin@aace.app', role: 'admin', region: 'BR', avatarInitials: 'AD' },
  { id: 'U02', name: 'Coord', email: 'coord@aace.app', role: 'coordinator', region: 'PR', avatarInitials: 'CO' },
  { id: 'U03', name: 'GC', email: 'gc@aace.app', role: 'channel_manager', coordinatorId: 'U02', region: 'CWB', avatarInitials: 'GC' },
];
const operations: Operation[] = [
  { id: 'O01', partnerName: 'Alpha', officeName: 'A', city: 'CWB', state: 'PR', coordinatorId: 'U02', managerId: 'U03', active: true, currentScore: 80, previousScore: 78, nextAudit: '2026-07-10', status: 'green', openActions: 0 },
  { id: 'O02', partnerName: 'Beta', officeName: 'B', city: 'CWB', state: 'PR', coordinatorId: 'U02', managerId: 'U99', active: true, currentScore: 70, previousScore: 71, nextAudit: '2026-07-11', status: 'yellow', openActions: 1 },
];

describe('buildOperationalDemoDirectory — alinhamento de identidade e escopo', () => {
  const dir = buildOperationalDemoDirectory(users, operations);

  it('cria uma conta por usuário, com id e e-mail idênticos ao seed operacional', () => {
    expect(dir).toHaveLength(3);
    const admin = dir.find((p) => p.user.id === 'U00');
    expect(admin?.user.corporateEmail).toBe('admin@aace.app');
    expect(admin?.user.status).toBe('active');
  });

  it('deriva os papéis corporativos a partir do papel operacional', () => {
    for (const profile of dir) {
      const roles = rolesFromScopes(profile.scopes, '2026-07-22T12:00:00.000Z');
      const opUser = users.find((u) => u.id === profile.user.id)!;
      expect(roles).toContain(opUser.role);
    }
  });

  it('vincula o GC apenas às operações onde é managerId', () => {
    const gc = dir.find((p) => p.user.id === 'U03')!;
    expect(gc.scopes[0].operationIds).toEqual(['O01']);
  });

  it('vincula o Coordenador à própria coordenadoria (id do coordenador)', () => {
    const coord = dir.find((p) => p.user.id === 'U02')!;
    expect(coord.scopes[0].role).toBe('coordinator');
    expect(coord.scopes[0].coordinationId).toBe('U02');
  });

  it('o Administrador é reconhecido pela política de autorização', () => {
    const admin = dir.find((p) => p.user.id === 'U00')!;
    const subject = subjectFromSession(
      { userId: admin.user.id, scopes: admin.scopes, accessTokenExpiresAt: '2999-01-01T00:00:00.000Z' },
      '2026-07-22T12:00:00.000Z',
    );
    expect(isAdmin(subject)).toBe(true);
    expect(canManageUsers(subject)).toBe(true);
  });

  it('o GC só acessa a operação atribuída (escopo real, não papel apenas)', () => {
    const gc = dir.find((p) => p.user.id === 'U03')!;
    const subject = subjectFromSession(
      { userId: gc.user.id, scopes: gc.scopes, accessTokenExpiresAt: '2999-01-01T00:00:00.000Z' },
      '2026-07-22T12:00:00.000Z',
    );
    expect(canAccessOperation(subject, { id: 'O01', regionId: 'r', coordinationId: 'U02' })).toBe(true);
    expect(canAccessOperation(subject, { id: 'O02', regionId: 'r', coordinationId: 'U02' })).toBe(false);
  });
});

describe('resolveOperationalUser — sessão corporativa → identidade operacional', () => {
  it('resolve por id', () => {
    const u = resolveOperationalUser({ user: { id: 'U02', corporateEmail: 'x@x' } }, users);
    expect(u?.id).toBe('U02');
  });

  it('cai para o e-mail corporativo quando o id não bate', () => {
    const u = resolveOperationalUser({ user: { id: 'unknown', corporateEmail: 'GC@AACE.APP' } }, users);
    expect(u?.id).toBe('U03');
  });

  it('retorna null quando não há vínculo operacional (perfil sem escopo)', () => {
    const u = resolveOperationalUser({ user: { id: 'zzz', corporateEmail: 'nobody@aace.app' } }, users);
    expect(u).toBeNull();
  });

  it('sessão anônima ⇒ null', () => {
    expect(resolveOperationalUser(null, users)).toBeNull();
  });
});

describe('operationalDemoDirectory — diretório efetivo do app', () => {
  it('cobre todos os usuários do seed, incluindo o Administrador', () => {
    expect(operationalDemoDirectory).toHaveLength(initialData.users.length);
    expect(operationalDemoDirectory.some((p) => p.user.corporateEmail === 'admin@aace.app')).toBe(true);
  });

  it('cada perfil do diretório resolve de volta para um User operacional', () => {
    for (const profile of operationalDemoDirectory) {
      const resolved = resolveOperationalUser(profile, initialData.users);
      expect(resolved).not.toBeNull();
      expect(resolved!.id).toBe(profile.user.id);
    }
  });
});
