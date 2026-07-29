import { describe, it, expect } from 'vitest';
import { LocalStore } from '../store/localStore';
import { LocalValidationsRepository, Validator } from './ValidationsRepository';
import { LocalActionsRepository } from './ActionsRepository';
import { scopeFromUser } from './OperationsRepository';
import { AppData, Evaluation, Operation, User } from '../../types';

const op = (id: string, coord: string, manager: string): Operation => ({
  id, partnerName: id, officeName: 'O', city: 'C', state: 'PR', coordinatorId: coord, managerId: manager,
  active: true, currentScore: 70, previousScore: 68, lastAudit: '2026-06-01', nextAudit: '2026-07-30', status: 'yellow', openActions: 0,
});

const submitted = (id: string, operationId: string, evaluatorId: string, score: number): Evaluation => ({
  id, operationId, cycleLabel: 'c', periodStart: '2026-07-01', periodEnd: '2026-07-07', frequency: 'weekly',
  evaluatorId, status: 'submitted', score, answers: [], submittedAt: '2026-07-05T12:00:00.000Z',
  createdAt: '2026-07-05T10:00:00.000Z', updatedAt: '2026-07-05T12:00:00.000Z',
});

function seed(): AppData {
  return {
    users: [],
    operations: [op('O1', 'U02', 'U03'), op('O2', 'U05', 'U06')],
    evaluations: [submitted('E1', 'O1', 'U03', 88), submitted('E2', 'O2', 'U06', 50)],
    actionPlans: [
      { id: 'A1', operationId: 'O1', evaluationId: 'E1', themeId: 'T1', problem: '', rootCause: '', action: '', owner: '', dueDate: '2026-08-01', priority: 'high', expectedEvidence: '', status: 'in_progress', createdBy: 'U03', createdAt: '', updatedAt: '' },
      { id: 'A2', operationId: 'O2', evaluationId: 'E2', themeId: 'T1', problem: '', rootCause: '', action: '', owner: '', dueDate: '2026-08-01', priority: 'high', expectedEvidence: '', status: 'in_progress', createdAt: '', updatedAt: '' },
    ],
    evidences: [], indicatorDefinitions: [], indicatorResults: [], visitReports: [],
  };
}

const user = (id: string, role: User['role']): User => ({ id, name: id, email: `${id}@x`, role, region: 'r', avatarInitials: id });
const coordinator: Validator = { userId: 'U02', role: 'coordinator' };

function repo(store = new LocalStore(seed())) {
  return { store, validations: new LocalValidationsRepository(store), actions: new LocalActionsRepository(store) };
}

describe('LocalValidationsRepository — fila e escopo', () => {
  it('listPending traz apenas submetidas do escopo do coordenador', async () => {
    const { validations } = repo();
    const res = await validations.listPending(scopeFromUser(user('U02', 'coordinator')));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.map((e) => e.id)).toEqual(['E1']); // E2 (O2) fora do escopo
  });
});

describe('LocalValidationsRepository — travas de validação (§14, T02)', () => {
  it('bloqueia autoaprovação (autor = validador)', async () => {
    const { validations } = repo();
    const res = await validations.validate('E1', { userId: 'U03', role: 'coordinator' }, 'approved', '');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('authz/self-approval');
  });

  it('bloqueia perfil não validador (GC)', async () => {
    const { validations } = repo();
    const res = await validations.validate('E1', { userId: 'U09', role: 'channel_manager' }, 'approved', '');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('authz/forbidden');
  });

  it('bloqueia fora do escopo', async () => {
    const { validations } = repo();
    const res = await validations.validate('E2', coordinator, 'approved', ''); // E2 é O2 (coord U05)
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('authz/out-of-scope');
  });

  it('aprovação atualiza a nota oficial e o histórico da operação', async () => {
    const { store, validations } = repo();
    const res = await validations.validate('E1', coordinator, 'approved', 'ok');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.status).toBe('approved');
    const op1 = store.getSnapshot().operations.find((o) => o.id === 'O1')!;
    expect(op1.currentScore).toBe(88); // nota da avaliação vira oficial
    expect(op1.previousScore).toBe(70);
    expect(op1.status).toBe('green'); // 88 >= 80
  });

  it('devolução marca returned sem alterar a nota oficial', async () => {
    const { store, validations } = repo();
    const res = await validations.validate('E1', coordinator, 'returned', 'corrigir');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.status).toBe('returned');
    expect(store.getSnapshot().operations.find((o) => o.id === 'O1')!.currentScore).toBe(70);
  });

  it('não valida avaliação que não está submetida (imutável)', async () => {
    const { validations } = repo();
    await validations.validate('E1', coordinator, 'approved', ''); // vira approved
    const again = await validations.validate('E1', coordinator, 'returned', '');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('integrity/immutable-record');
  });
});

const gc = { userId: 'U03', role: 'channel_manager' as const, name: 'GC Demo' };
const coordActor = { userId: 'U02', role: 'coordinator' as const, name: 'Coordenação Demo' };

describe('LocalActionsRepository — escopo e workflow (manual do GC normativo)', () => {
  it('lista apenas planos das operações visíveis', async () => {
    const { actions } = repo();
    const res = await actions.listByScope(scopeFromUser(user('U02', 'coordinator')));
    if (res.ok) expect(res.value.map((p) => p.id)).toEqual(['A1']); // A2 (O2) fora do escopo
  });

  it('transição permitida altera o status (in_progress → completed)', async () => {
    const { actions } = repo();
    const res = await actions.updateStatus('A1', 'completed', gc);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.status).toBe('completed');
  });

  it('estados de espera são distintos e persistem separadamente', async () => {
    const { actions, store } = repo();
    await actions.updateStatus('A1', 'waiting_partner', gc);
    expect(store.getSnapshot().actionPlans.find((p) => p.id === 'A1')!.status).toBe('waiting_partner');
    await actions.updateStatus('A1', 'waiting_internal', gc);
    expect(store.getSnapshot().actionPlans.find((p) => p.id === 'A1')!.status).toBe('waiting_internal');
  });

  it('transição fora da tabela é recusada (in_progress → not_started)', async () => {
    const { actions } = repo();
    const res = await actions.updateStatus('A1', 'not_started', gc);
    expect(res.ok).toBe(false);
  });

  it('vencido não é escolha manual', async () => {
    const { actions } = repo();
    const res = await actions.updateStatus('A1', 'overdue', gc);
    expect(res.ok).toBe(false);
  });

  it('GC não registra Validado', async () => {
    const { actions } = repo();
    await actions.updateStatus('A1', 'completed', gc);
    const res = await actions.updateStatus('A1', 'validated', gc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('authz/forbidden');
  });

  it('validar exige Concluído (in_progress → validated recusado)', async () => {
    const { actions } = repo();
    const res = await actions.updateStatus('A1', 'validated', coordActor);
    expect(res.ok).toBe(false);
  });

  it('coordenação valida plano concluído de outro usuário e a trilha persiste', async () => {
    const { actions, store } = repo();
    await actions.updateStatus('A1', 'completed', gc);
    const res = await actions.updateStatus('A1', 'validated', coordActor);
    expect(res.ok).toBe(true);
    const saved = store.getSnapshot().actionPlans.find((p) => p.id === 'A1')!;
    expect(saved.status).toBe('validated');
    expect(saved.validatorName).toBe('Coordenação Demo');
    expect(saved.validatedAt).toBeTruthy();
  });

  it('criador não valida o próprio plano', async () => {
    const { actions } = repo();
    await actions.updateStatus('A1', 'completed', gc);
    const res = await actions.updateStatus('A1', 'validated', { userId: 'U03', role: 'coordinator', name: 'Criador' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('authz/self-approval');
  });

  it('plano legado sem autoria tem validação bloqueada', async () => {
    const { actions } = repo();
    await actions.updateStatus('A2', 'completed', gc);
    const res = await actions.updateStatus('A2', 'validated', coordActor);
    expect(res.ok).toBe(false);
  });

  it('Validado é terminal: não reabre nem muda', async () => {
    const { actions } = repo();
    await actions.updateStatus('A1', 'completed', gc);
    await actions.updateStatus('A1', 'validated', coordActor);
    const res = await actions.updateStatus('A1', 'in_progress', coordActor);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('integrity/immutable-record');
  });

  it('Concluído reabre para Em andamento ANTES da validação', async () => {
    const { actions } = repo();
    await actions.updateStatus('A1', 'completed', gc);
    const res = await actions.updateStatus('A1', 'in_progress', gc);
    expect(res.ok).toBe(true);
  });
});
