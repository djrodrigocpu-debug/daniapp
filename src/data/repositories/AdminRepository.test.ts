import { describe, it, expect } from 'vitest';
import { LocalStore } from '../store/localStore';
import { LocalAdminUsersRepository, LocalAdminIndicatorsRepository } from './AdminRepository';
import { AdminIndicator, AppData } from '../../types';

const seedIndicators: AdminIndicator[] = [
  { id: 'IND012', code: 'IND-012', name: 'Prod', lifecycle: 'active', createdAt: '2026-01-01T00:00:00.000Z', usageCount: 8, versions: [{ id: 'v1', versionNumber: 1, unit: 'qtd', direction: 'higher_better', target: 100, yellowTolerance: 10, weight: 3, effectiveFrom: '2026-01-01' }] },
  { id: 'IND045', code: 'IND-045', name: 'Churn', lifecycle: 'active', createdAt: '2026-02-01T00:00:00.000Z', usageCount: 0, versions: [{ id: 'v2', versionNumber: 1, unit: '%', direction: 'lower_better', target: 2, yellowTolerance: 0.5, weight: 2, effectiveFrom: '2026-02-01' }] },
];

function data(): AppData {
  return {
    users: [{ id: 'U01', name: 'Reg', email: 'reg@x', role: 'regional', region: 'r', avatarInitials: 'RG' }],
    operations: [], evaluations: [], actionPlans: [], evidences: [], indicatorDefinitions: [], indicatorResults: [], visitReports: [],
    adminIndicators: seedIndicators.map((i) => ({ ...i, versions: [...i.versions] })),
  };
}

function repos(store = new LocalStore(data())) {
  return { store, users: new LocalAdminUsersRepository(store), indicators: new LocalAdminIndicatorsRepository(store) };
}

describe('LocalAdminUsersRepository', () => {
  it('cria usuário com iniciais e ativo por padrão', async () => {
    const { users } = repos();
    const res = await users.create({ name: 'Ana Souza', email: 'ANA@x.com', role: 'coordinator', region: 'PR' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.email).toBe('ana@x.com');
      expect(res.value.avatarInitials).toBe('AS');
      expect(res.value.active).toBe(true);
    }
  });

  it('rejeita e-mail duplicado', async () => {
    const { users } = repos();
    const res = await users.create({ name: 'Reg 2', email: 'reg@x', role: 'regional', region: 'r' });
    expect(res.ok).toBe(false);
  });

  it('ativa/inativa e troca papel', async () => {
    const { users } = repos();
    const off = await users.setActive('U01', false);
    if (off.ok) expect(off.value.active).toBe(false);
    const role = await users.updateRole('U01', 'admin');
    if (role.ok) expect(role.value.role).toBe('admin');
  });
});

describe('LocalAdminIndicatorsRepository — versionamento e T05', () => {
  it('cria definição com versão 1', async () => {
    const { indicators } = repos();
    const res = await indicators.createDefinition('IND-050', 'Novo', { unit: '%', direction: 'higher_better', target: 90, yellowTolerance: 5, weight: 1, effectiveFrom: '2026-07-01' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.versions[0].versionNumber).toBe(1);
  });

  it('rejeita código duplicado', async () => {
    const { indicators } = repos();
    const res = await indicators.createDefinition('IND-012', 'Dup', { unit: '%', direction: 'higher_better', target: 1, yellowTolerance: 0, weight: 1, effectiveFrom: '2026-07-01' });
    expect(res.ok).toBe(false);
  });

  it('adiciona nova versão incrementando o número', async () => {
    const { indicators } = repos();
    const res = await indicators.addVersion('IND045', { unit: '%', direction: 'lower_better', target: 1.5, yellowTolerance: 0.3, weight: 2, effectiveFrom: '2026-07-01' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.versions.map((v) => v.versionNumber)).toEqual([1, 2]);
  });

  it('inativa o indicador (preserva histórico)', async () => {
    const { indicators } = repos();
    const res = await indicators.deactivate('IND045');
    if (res.ok) expect(res.value.lifecycle).toBe('inactive');
  });

  it('BLOQUEIA exclusão de indicador em uso (T05) e permite excluir o livre', async () => {
    const { indicators, store } = repos();
    const blocked = await indicators.remove('IND012'); // usageCount 8
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('integrity/indicator-in-use');
    const removed = await indicators.remove('IND045'); // usageCount 0
    expect(removed.ok).toBe(true);
    expect((store.getSnapshot().adminIndicators ?? []).map((i) => i.id)).toEqual(['IND012']);
  });
});
