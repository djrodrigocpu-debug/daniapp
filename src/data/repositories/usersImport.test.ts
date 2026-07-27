/**
 * Importação de Usuários + cadastro de Parceiros AACE na sequência real da
 * implantação: primeiro a planilha de usuários, depois a de parceiros, que
 * depende dos GCs e coordenadores criados no passo anterior.
 * Dados 100% SINTÉTICOS (§23).
 */
import { describe, it, expect } from 'vitest';
import { LocalStore } from '../store/localStore';
import { LocalAdminUsersRepository, linkManagersToCoordinators } from './AdminRepository';
import { LocalAdminPartnersRepository } from './PartnersRepository';
import { UserImportRow } from '../../domain/users/types';
import { ImportRow } from '../../domain/partners/types';
import { AppData, User } from '../../types';

/** Base VAZIA — como fica uma implantação nova, sem seed de demonstração. */
function emptyData(): AppData {
  return {
    users: [], operations: [], evaluations: [], actionPlans: [], evidences: [],
    indicatorDefinitions: [], indicatorResults: [], visitReports: [], adminIndicators: [],
  };
}

const USER_ROWS: UserImportRow[] = [
  { index: 1, name: 'Ana Sintetica', email: 'ana@sint.example', role: 'admin', region: 'RPS' },
  { index: 2, name: 'Bia Sintetica', email: 'bia@sint.example', role: 'coordinator', region: 'COORD NORTE' },
  { index: 3, name: 'Caio Sintetico', email: 'caio@sint.example', role: 'coordinator', region: 'COORD SUL' },
  { index: 4, name: 'Davi Sintetico', email: 'davi@sint.example', role: 'channel_manager', region: 'COORD NORTE' },
  { index: 5, name: 'Elis Sintetica', email: 'elis@sint.example', role: 'channel_manager', region: 'COORD SUL' },
];

const PARTNER_ROWS: ImportRow[] = [
  {
    index: 1, unitName: 'RPS', coordinationName: 'COORD NORTE', partnerName: 'ALFA SINT LTDA',
    officeName: 'PS - ALFA - 0001', city: 'Cidade N', state: 'PR', managerEmail: 'davi@sint.example',
  },
  {
    index: 2, unitName: 'RPS', coordinationName: 'COORD SUL', partnerName: 'BETA SINT LTDA',
    officeName: 'PS - BETA - 0002', city: 'Cidade S', state: 'SC', managerEmail: 'elis@sint.example',
  },
];

function repos(store = new LocalStore(emptyData(), '@test-users-import')) {
  return {
    store,
    users: new LocalAdminUsersRepository(store),
    partners: new LocalAdminPartnersRepository(store),
  };
}

describe('LocalAdminUsersRepository.importUsers', () => {
  it('simulação não grava nada', async () => {
    const { store, users } = repos();
    const res = await users.importUsers(USER_ROWS, false);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.mode).toBe('simulate');
      expect(res.value.counters).toEqual({ total: 5, inserted: 5, updated: 0, errors: 0 });
    }
    expect(store.getSnapshot().users).toEqual([]);
  });

  it('confirmação grava e vincula cada GC ao coordenador da mesma área', async () => {
    const { store, users } = repos();
    const res = await users.importUsers(USER_ROWS, true);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.mode).toBe('commit');

    const saved = store.getSnapshot().users;
    expect(saved).toHaveLength(5);
    const bia = saved.find((u) => u.email === 'bia@sint.example')!;
    const davi = saved.find((u) => u.email === 'davi@sint.example')!;
    const elis = saved.find((u) => u.email === 'elis@sint.example')!;
    expect(davi.coordinatorId).toBe(bia.id);
    expect(elis.coordinatorId).toBe(saved.find((u) => u.email === 'caio@sint.example')!.id);
    expect(davi.avatarInitials).toBe('DS');
    expect(davi.active).toBe(true);
  });

  it('reimportar a mesma planilha atualiza em vez de duplicar (idempotente)', async () => {
    const { store, users } = repos();
    await users.importUsers(USER_ROWS, true);
    const again = await users.importUsers(USER_ROWS, true);
    expect(store.getSnapshot().users).toHaveLength(5);
    if (again.ok) {
      expect(again.value.counters).toEqual({ total: 5, inserted: 0, updated: 5, errors: 0 });
      expect(again.value.rows.every((r) => r.action === 'update')).toBe(true);
    }
  });

  it('e-mail já cadastrado com outro perfil é atualizado e o relatório avisa', async () => {
    const { store, users } = repos();
    await users.importUsers(USER_ROWS, true);
    const promoted: UserImportRow[] = [{ ...USER_ROWS[3], role: 'coordinator', region: 'COORD OESTE' }];
    const res = await users.importUsers(promoted, true);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.rows[0].warnings).toContain('Perfil alterado de channel_manager para coordinator');
    }
    expect(store.getSnapshot().users.find((u) => u.email === 'davi@sint.example')!.role).toBe('coordinator');
  });

  it('GC sem coordenador na área entra sem vínculo e é reportado', async () => {
    const { users } = repos();
    const orphan: UserImportRow[] = [
      { index: 1, name: 'Orfao Sintetico', email: 'orfao@sint.example', role: 'channel_manager', region: 'COORD SEM DONO' },
    ];
    const res = await users.importUsers(orphan, true);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.coordinationsWithoutCoordinator).toEqual(['COORD SEM DONO']);
      expect(res.value.rows[0].warnings).toContain('Sem coordenador ativo para a área "COORD SEM DONO"');
    }
  });
});

describe('linkManagersToCoordinators', () => {
  it('não escolhe nenhum quando há dois coordenadores ativos na mesma área', () => {
    const users: User[] = [
      { id: 'C1', name: 'C1', email: 'c1@x', role: 'coordinator', region: 'NORTE', avatarInitials: 'C1' },
      { id: 'C2', name: 'C2', email: 'c2@x', role: 'coordinator', region: 'NORTE', avatarInitials: 'C2' },
      { id: 'G1', name: 'G1', email: 'g1@x', role: 'channel_manager', region: 'NORTE', avatarInitials: 'G1' },
    ];
    const { users: linked, unlinkedRegions } = linkManagersToCoordinators(users);
    expect(linked.find((u) => u.id === 'G1')!.coordinatorId).toBeUndefined();
    expect(unlinkedRegions).toEqual(['NORTE']);
  });

  it('ignora coordenador inativo', () => {
    const users: User[] = [
      { id: 'C1', name: 'C1', email: 'c1@x', role: 'coordinator', region: 'NORTE', avatarInitials: 'C1', active: false },
      { id: 'G1', name: 'G1', email: 'g1@x', role: 'channel_manager', region: 'NORTE', avatarInitials: 'G1' },
    ];
    const { users: linked, unlinkedRegions } = linkManagersToCoordinators(users);
    expect(linked.find((u) => u.id === 'G1')!.coordinatorId).toBeUndefined();
    expect(unlinkedRegions).toEqual(['NORTE']);
  });
});

describe('sequência real: usuários e depois Parceiros AACE', () => {
  it('importa parceiros resolvendo o coordenador pela coordenação (sem coluna de e-mail)', async () => {
    const { store, users, partners } = repos();
    await users.importUsers(USER_ROWS, true);

    const sim = await partners.importPartners(PARTNER_ROWS, false);
    expect(sim.ok).toBe(true);
    if (sim.ok) {
      expect(sim.value.counters).toMatchObject({ total: 2, inserted: 2, errors: 0 });
      expect(sim.value.rows[0].warnings[0]).toMatch(/Coordenador Bia Sintetica resolvido pela coordenação "COORD NORTE"/);
    }
    expect(store.getSnapshot().operations).toEqual([]); // simulação não grava

    const commit = await partners.importPartners(PARTNER_ROWS, true);
    expect(commit.ok).toBe(true);
    const ops = store.getSnapshot().operations;
    expect(ops).toHaveLength(2);

    const saved = store.getSnapshot().users;
    const bia = saved.find((u) => u.email === 'bia@sint.example')!;
    const davi = saved.find((u) => u.email === 'davi@sint.example')!;
    expect(ops[0].coordinatorId).toBe(bia.id);
    expect(ops[0].managerId).toBe(davi.id);
    expect(ops.every((o) => o.active)).toBe(true);

    const listed = await partners.listAll();
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.filter((p) => p.managerMissing || p.coordinatorMissing)).toEqual([]);
    }
  });

  it('sem os usuários importados antes, o parceiro é recusado com mensagem acionável', async () => {
    const { partners } = repos();
    const res = await partners.importPartners(PARTNER_ROWS, false);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.counters.errors).toBe(2);
      expect(res.value.rows[0].messages.join(' ')).toMatch(
        /Coordenador nao encontrado para a coordenacao "COORD NORTE": cadastre um usuario com perfil Coordenacao/,
      );
    }
  });
});
