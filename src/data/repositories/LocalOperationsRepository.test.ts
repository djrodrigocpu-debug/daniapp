import { describe, it, expect } from 'vitest';
import { LocalStore } from '../store/localStore';
import { LocalOperationsRepository } from './LocalOperationsRepository';
import { isOperationVisible, scopeFromUser } from './OperationsRepository';
import { AppData, Operation, User } from '../../types';

const op = (id: string, coordinatorId: string, managerId: string, status: Operation['status'] = 'green'): Operation => ({
  id, partnerName: `P${id}`, officeName: 'O', city: 'C', state: 'PR',
  coordinatorId, managerId, active: true, currentScore: 80, previousScore: 78,
  nextAudit: '2026-07-30', status, openActions: 0,
});

const seed: AppData = {
  users: [],
  operations: [
    op('O1', 'U02', 'U03'),
    op('O2', 'U02', 'U04'),
    op('O3', 'U05', 'U06', 'red'),
  ],
  evaluations: [],
  actionPlans: [],
  evidences: [],
  indicatorDefinitions: [],
  indicatorResults: [],
  visitReports: [],
};

const user = (id: string, role: User['role']): User => ({ id, name: id, email: `${id}@x`, role, region: 'r', avatarInitials: id });

function repo() {
  return new LocalOperationsRepository(new LocalStore(seed));
}

describe('isOperationVisible — espelho da RLS', () => {
  it('admin e regional veem tudo', () => {
    expect(isOperationVisible({ userId: 'X', role: 'admin' }, seed.operations[0])).toBe(true);
    expect(isOperationVisible({ userId: 'X', role: 'regional' }, seed.operations[2])).toBe(true);
  });
  it('coordenador vê a própria coordenadoria', () => {
    expect(isOperationVisible({ userId: 'U02', role: 'coordinator' }, seed.operations[0])).toBe(true);
    expect(isOperationVisible({ userId: 'U02', role: 'coordinator' }, seed.operations[2])).toBe(false);
  });
  it('GC vê apenas as suas', () => {
    expect(isOperationVisible({ userId: 'U03', role: 'channel_manager' }, seed.operations[0])).toBe(true);
    expect(isOperationVisible({ userId: 'U03', role: 'channel_manager' }, seed.operations[1])).toBe(false);
  });
});

describe('LocalOperationsRepository.listVisible', () => {
  it('GC recebe só as operações onde é managerId', async () => {
    const res = await repo().listVisible(scopeFromUser(user('U03', 'channel_manager')));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.map((o) => o.id)).toEqual(['O1']);
  });
  it('Coordenador recebe a coordenadoria', async () => {
    const res = await repo().listVisible(scopeFromUser(user('U02', 'coordinator')));
    if (res.ok) expect(res.value.map((o) => o.id).sort()).toEqual(['O1', 'O2']);
  });
  it('Regional recebe todas', async () => {
    const res = await repo().listVisible(scopeFromUser(user('U01', 'regional')));
    if (res.ok) expect(res.value).toHaveLength(3);
  });
});

describe('LocalOperationsRepository.getById — escopo', () => {
  it('nega operação fora do escopo (out-of-scope)', async () => {
    const res = await repo().getById(scopeFromUser(user('U03', 'channel_manager')), 'O3');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('authz/out-of-scope');
  });
  it('retorna null quando o id não existe', async () => {
    const res = await repo().getById(scopeFromUser(user('U01', 'regional')), 'ZZZ');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBeNull();
  });
});

describe('LocalOperationsRepository.getDashboard — números do escopo', () => {
  it('métricas do GC consideram apenas suas operações', async () => {
    const res = await repo().getDashboard(scopeFromUser(user('U03', 'channel_manager')), '2026-07-22T12:00:00.000Z');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.operationsCount).toBe(1);
      expect(res.value.criticalCount).toBe(0); // O3 (red) fora do escopo do GC
    }
  });
  it('métricas do regional incluem a operação crítica', async () => {
    const res = await repo().getDashboard(scopeFromUser(user('U01', 'regional')), '2026-07-22T12:00:00.000Z');
    if (res.ok) expect(res.value.criticalCount).toBe(1);
  });
});
