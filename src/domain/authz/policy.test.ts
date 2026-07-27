import { describe, it, expect } from 'vitest';
import {
  AuthzSubject,
  ScopedOperation,
  canAccessOperation,
  canValidate,
  canManageIndicators,
  canSeeNominalRanking,
  exportScope,
  canCreateVisit,
} from './policy';

function subject(partial: Partial<AuthzSubject>): AuthzSubject {
  return {
    userId: 'u-self',
    roles: [],
    regionIds: [],
    coordinationIds: [],
    assignedOperationIds: [],
    ...partial,
  };
}

const opA: ScopedOperation = { id: 'op-A', regionId: 'reg-1', coordinationId: 'coord-1' };
const opB: ScopedOperation = { id: 'op-B', regionId: 'reg-2', coordinationId: 'coord-2' };

describe('canAccessOperation (T01 — isolamento de carteira)', () => {
  it('GC vê apenas operações atribuídas', () => {
    const gc = subject({ roles: ['channel_manager'], assignedOperationIds: ['op-A'] });
    expect(canAccessOperation(gc, opA)).toBe(true);
    expect(canAccessOperation(gc, opB)).toBe(false); // outra carteira: negado
  });

  it('coordenador vê apenas sua coordenadoria', () => {
    const coord = subject({ roles: ['coordinator'], coordinationIds: ['coord-1'] });
    expect(canAccessOperation(coord, opA)).toBe(true);
    expect(canAccessOperation(coord, opB)).toBe(false);
  });

  it('regional vê apenas sua região', () => {
    const reg = subject({ roles: ['regional'], regionIds: ['reg-1'] });
    expect(canAccessOperation(reg, opA)).toBe(true);
    expect(canAccessOperation(reg, opB)).toBe(false);
  });

  it('admin acessa qualquer operação', () => {
    const admin = subject({ roles: ['admin'] });
    expect(canAccessOperation(admin, opA)).toBe(true);
    expect(canAccessOperation(admin, opB)).toBe(true);
  });
});

describe('canValidate (T02 — sem autoaprovação)', () => {
  it('coordenador NÃO valida a própria submissão', () => {
    const coord = subject({ userId: 'u1', roles: ['coordinator'], coordinationIds: ['coord-1'] });
    expect(canValidate(coord, { authorUserId: 'u1', operation: opA })).toBe(false);
  });
  it('coordenador valida submissão de outro no seu escopo', () => {
    const coord = subject({ userId: 'u1', roles: ['coordinator'], coordinationIds: ['coord-1'] });
    expect(canValidate(coord, { authorUserId: 'u2', operation: opA })).toBe(true);
  });
  it('GC não valida', () => {
    const gc = subject({ userId: 'u3', roles: ['channel_manager'], assignedOperationIds: ['op-A'] });
    expect(canValidate(gc, { authorUserId: 'u2', operation: opA })).toBe(false);
  });
});

describe('gestão de indicadores (D-05)', () => {
  it('somente admin gerencia indicadores', () => {
    expect(canManageIndicators(subject({ roles: ['admin'] }))).toBe(true);
    expect(canManageIndicators(subject({ roles: ['regional'] }))).toBe(false);
    expect(canManageIndicators(subject({ roles: ['coordinator'] }))).toBe(false);
    expect(canManageIndicators(subject({ roles: ['channel_manager'] }))).toBe(false);
  });
});

describe('ranking nominal (T28 — trava ética)', () => {
  it('proibido para todos os perfis no piloto', () => {
    for (const role of ['admin', 'regional', 'coordinator', 'channel_manager'] as const) {
      expect(canSeeNominalRanking(subject({ roles: [role] }))).toBe(false);
    }
  });
});

describe('exportScope (T16)', () => {
  it('cada perfil exporta apenas seu escopo', () => {
    expect(exportScope(subject({ roles: ['admin'] }))).toEqual({ kind: 'all' });
    expect(exportScope(subject({ roles: ['regional'], regionIds: ['reg-1'] }))).toEqual({ kind: 'regions', ids: ['reg-1'] });
    expect(exportScope(subject({ roles: ['coordinator'], coordinationIds: ['coord-1'] }))).toEqual({ kind: 'coordinations', ids: ['coord-1'] });
    expect(exportScope(subject({ roles: ['channel_manager'], assignedOperationIds: ['op-A'] }))).toEqual({ kind: 'operations', ids: ['op-A'] });
    expect(exportScope(subject({}))).toEqual({ kind: 'none' });
  });
});

describe('canCreateVisit (P04 configurável)', () => {
  it('GC cria visita na operação atribuída', () => {
    const gc = subject({ roles: ['channel_manager'], assignedOperationIds: ['op-A'] });
    expect(canCreateVisit(gc, opA, false)).toBe(true);
  });
  it('coordenador só cria se autorizado (flag P04)', () => {
    const coord = subject({ roles: ['coordinator'], coordinationIds: ['coord-1'] });
    expect(canCreateVisit(coord, opA, false)).toBe(false);
    expect(canCreateVisit(coord, opA, true)).toBe(true);
  });
});
