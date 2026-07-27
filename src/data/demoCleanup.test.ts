/**
 * Limpeza dos dados de demonstração antes da carga real (§23). Verifica que a
 * remoção é cirúrgica: leva o seed e o que dependia dele, e nada mais.
 */
import { describe, it, expect } from 'vitest';
import {
  canRemoveDemoSeedData,
  countDemoSeedData,
  isDemoSeedOperation,
  isDemoSeedUser,
  removeDemoSeedData,
} from './demoCleanup';
import { initialData } from './mock';
import { AppData, Operation, User } from '../types';

const realUser: User = {
  id: 'U_real_1', name: 'Pessoa Sintetica', email: 'pessoa@sint.example',
  role: 'coordinator', region: 'COORD SINT', avatarInitials: 'PS',
};

const realOperation: Operation = {
  id: 'O_real_1', partnerName: 'ALFA SINT LTDA', officeName: 'PS - ALFA - 0001',
  city: 'Cidade', state: 'PR', coordinatorId: 'U_real_1', managerId: 'U_real_2',
  active: true, currentScore: 0, previousScore: 0, nextAudit: '2026-08-01',
  status: 'not_evaluated', openActions: 0,
};

function mixed(): AppData {
  return {
    ...initialData,
    users: [...initialData.users, realUser],
    operations: [...initialData.operations, realOperation],
    evaluations: [...initialData.evaluations],
    actionPlans: [...initialData.actionPlans],
  };
}

describe('demoCleanup', () => {
  it('conta os registros de demonstração presentes', () => {
    expect(countDemoSeedData(mixed())).toBe(
      initialData.users.length + initialData.operations.length,
    );
    expect(countDemoSeedData(removeDemoSeedData(mixed()))).toBe(0);
  });

  it('remove o seed e preserva integralmente os dados reais', () => {
    const cleaned = removeDemoSeedData(mixed());
    expect(cleaned.users).toEqual([realUser]);
    expect(cleaned.operations).toEqual([realOperation]);
  });

  it('remove avaliações e planos que dependiam das operações fictícias', () => {
    const cleaned = removeDemoSeedData(mixed());
    expect(cleaned.evaluations).toEqual([]);
    expect(cleaned.actionPlans).toEqual([]);
    expect(cleaned.indicatorResults.every((r) => r.operationId === realOperation.id)).toBe(true);
  });

  it('preserva um registro que reusa o id do seed mas foi editado (identidade diferente)', () => {
    const edited: User = { ...initialData.users[0], email: 'editado@sint.example' };
    expect(isDemoSeedUser(edited)).toBe(false);
    const cleaned = removeDemoSeedData({ ...mixed(), users: [edited] });
    expect(cleaned.users).toEqual([edited]);
  });

  it('reconhece a identidade exata do seed', () => {
    expect(isDemoSeedUser(initialData.users[0])).toBe(true);
    expect(isDemoSeedOperation(initialData.operations[0])).toBe(true);
    expect(isDemoSeedUser(realUser)).toBe(false);
    expect(isDemoSeedOperation(realOperation)).toBe(false);
  });

  it('é idempotente — rodar de novo numa base limpa não muda nada', () => {
    const once = removeDemoSeedData(mixed());
    expect(removeDemoSeedData(once)).toEqual(once);
  });

  it('recusa a limpeza que deixaria a base sem Administrador (auto-bloqueio)', () => {
    const guard = canRemoveDemoSeedData(mixed()); // só o admin do seed existe
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.reason).toMatch(/Importe primeiro a planilha de Usuários/);
  });

  it('libera a limpeza quando já existe um Administrador real e ativo', () => {
    const realAdmin: User = { ...realUser, id: 'U_real_adm', email: 'adm@sint.example', role: 'admin' };
    expect(canRemoveDemoSeedData({ ...mixed(), users: [...mixed().users, realAdmin] }).ok).toBe(true);
  });

  it('revincula os GCs que estavam ambíguos por causa dos coordenadores fictícios', () => {
    // 'PR Capital' do seed (U02) e 'PR CAPITAL' importada disputam a mesma área.
    const realCoordinator: User = {
      id: 'U_real_c', name: 'Coord Real', email: 'coord@sint.example',
      role: 'coordinator', region: 'PR CAPITAL', avatarInitials: 'CR',
    };
    const realManager: User = {
      id: 'U_real_g', name: 'GC Real', email: 'gc@sint.example',
      role: 'channel_manager', region: 'PR CAPITAL', avatarInitials: 'GR',
    };
    const realAdmin: User = { ...realUser, id: 'U_real_adm', email: 'adm@sint.example', role: 'admin' };
    const data: AppData = { ...mixed(), users: [...initialData.users, realCoordinator, realManager, realAdmin] };

    const cleaned = removeDemoSeedData(data);
    expect(cleaned.users.find((u) => u.id === 'U_real_g')!.coordinatorId).toBe('U_real_c');
  });
});
