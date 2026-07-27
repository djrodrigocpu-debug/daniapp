/**
 * LocalAdminPartnersRepository — paridade do modo demonstração com as regras
 * do servidor (0009): fonte única em data.operations (E7), escritório único
 * por unidade com chave normalizada, ativo exige GC (E5), resolução por
 * e-mail com papel/ativo (E2), importação simular/confirmar idempotente.
 * Dados 100% sintéticos.
 */
import { describe, it, expect } from 'vitest';
import { LocalStore } from '../store/localStore';
import { LocalAdminPartnersRepository } from './PartnersRepository';
import { AppData, Operation, User } from '../../types';
import { ImportRow } from '../../domain/partners/types';

const gc: User = { id: 'U10', name: 'GC Sint', email: 'gc@sint.example', role: 'channel_manager', coordinatorId: 'U11', region: 'Curitiba', avatarInitials: 'GS' };
const gc2: User = { id: 'U12', name: 'GC Dois', email: 'gc2@sint.example', role: 'channel_manager', coordinatorId: 'U11', region: 'Londrina', avatarInitials: 'GD' };
const coord: User = { id: 'U11', name: 'Coord Sint', email: 'coord@sint.example', role: 'coordinator', region: 'PR Capital', avatarInitials: 'CS' };
const gcInativo: User = { id: 'U13', name: 'GC Inativo', email: 'gcx@sint.example', role: 'channel_manager', region: 'Curitiba', avatarInitials: 'GI', active: false };

const opSeed: Operation = {
  id: 'O90', partnerName: 'Existente LTDA', officeName: 'PS - EXISTENTE - 0001', city: 'Curitiba', state: 'PR',
  coordinatorId: 'U11', managerId: 'U10', active: true, currentScore: 0, previousScore: 0,
  nextAudit: '2026-07-23', status: 'not_evaluated', openActions: 0, coordinationName: 'COORD SINT',
};

function data(): AppData {
  return {
    users: [gc, gc2, coord, gcInativo],
    operations: [{ ...opSeed }],
    evaluations: [], actionPlans: [], evidences: [], indicatorDefinitions: [], indicatorResults: [], visitReports: [],
  };
}

function repo(store = new LocalStore(data())) {
  return { store, partners: new LocalAdminPartnersRepository(store) };
}

const importRow = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  index: 1,
  organizationName: 'ORG SINT',
  regionName: 'PR/SC',
  unitName: 'Unidade Piloto',
  coordinationName: 'COORD SINT',
  partnerName: 'Importada LTDA',
  officeName: 'PS - IMPORTADA - 0001',
  city: 'Curitiba',
  state: 'PR',
  coordinatorEmail: 'coord@sint.example',
  managerEmail: 'gc@sint.example',
  ...overrides,
});

describe('LocalAdminPartnersRepository — CRUD (teste 1, modo demo)', () => {
  it('cria parceiro com GC resolvido por e-mail (case-insensitive) e deriva de data.operations (E7)', async () => {
    const { store, partners } = repo();
    const res = await partners.create({
      partnerName: '  Nova   Empresa LTDA ',
      officeName: 'PS - NOVA - 0001',
      city: 'Curitiba',
      state: 'PR',
      managerEmail: 'GC@Sint.Example',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.partner.partnerName).toBe('Nova Empresa LTDA');
      expect(res.value.partner.managerId).toBe('U10');
      expect(res.value.partner.active).toBe(true);
      expect(res.value.warnings).toEqual([]);
    }
    // Fonte única: a operação entrou em data.operations (sem coleção paralela).
    expect(store.getSnapshot().operations.some((o) => o.officeName === 'PS - NOVA - 0001')).toBe(true);
    expect((store.getSnapshot() as unknown as Record<string, unknown>).adminPartners).toBeUndefined();
  });

  it('sem GC salva inativo com aviso; ativar sem GC é rejeitado (E5)', async () => {
    const { partners } = repo();
    const res = await partners.create({
      partnerName: 'Sem GC LTDA', officeName: 'PS - SEMGC - 0001', city: 'Curitiba', state: 'PR',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.partner.active).toBe(false);
    expect(res.value.warnings).toEqual(['Sem GC vinculado: parceiro salvo como inativo']);

    const activate = await partners.update(res.value.partner.id, { active: true });
    expect(activate.ok).toBe(false);
    if (!activate.ok) expect(activate.error.message).toMatch(/ativo exige GC/i);
  });

  it('GC inexistente, com papel errado ou inativo é rejeitado nominalmente (E2)', async () => {
    const { partners } = repo();
    const cases: Array<[string, RegExp]> = [
      ['naoexiste@sint.example', /GC nao encontrado/],
      ['coord@sint.example', /nao tem papel de GC ativo/],
      ['gcx@sint.example', /GC nao esta ativo/],
    ];
    for (const [email, msg] of cases) {
      const res = await partners.create({
        partnerName: 'X LTDA', officeName: `PS - E2 - ${email}`, city: 'Curitiba', state: 'PR', managerEmail: email,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toMatch(msg);
    }
  });

  it('escritório duplicado na unidade é rejeitado com variação de caixa/acento/espaços (teste 12)', async () => {
    const { partners } = repo();
    for (const office of ['ps - existente - 0001', ' PS -  EXISTENTE - 0001 ', 'PS - EXISTÊNTE - 0001']) {
      const res = await partners.create({
        partnerName: 'Dup LTDA', officeName: office, city: 'Curitiba', state: 'PR', managerEmail: 'gc@sint.example',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toMatch(/já cadastrado nesta unidade/i);
    }
  });

  it('edita cidade e GC; inativa sem excluir (teste 1)', async () => {
    const { store, partners } = repo();
    const upd = await partners.update('O90', { city: 'Maringá', managerEmail: 'gc2@sint.example' });
    expect(upd.ok).toBe(true);
    if (upd.ok) {
      expect(upd.value.partner.city).toBe('Maringá');
      expect(upd.value.partner.managerId).toBe('U12');
    }
    const off = await partners.update('O90', { active: false });
    expect(off.ok).toBe(true);
    expect(store.getSnapshot().operations).toHaveLength(1); // sem exclusão física
    expect(store.getSnapshot().operations[0].active).toBe(false);
  });
});

describe('LocalAdminPartnersRepository — importação (modo demo)', () => {
  it('simulação não grava nada (teste 14)', async () => {
    const { store, partners } = repo();
    const before = JSON.stringify(store.getSnapshot().operations);
    const res = await partners.importPartners([importRow()], false);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.mode).toBe('simulate');
      expect(res.value.counters.inserted).toBe(1);
    }
    expect(JSON.stringify(store.getSnapshot().operations)).toBe(before);
  });

  it('confirmação grava e reimportação não duplica (teste 10)', async () => {
    const { store, partners } = repo();
    const first = await partners.importPartners([importRow()], true);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.counters.inserted).toBe(1);
    expect(store.getSnapshot().operations).toHaveLength(2);

    const again = await partners.importPartners(
      [importRow({ officeName: ' ps - importada  - 0001 ' })], true);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.counters.inserted).toBe(0);
      expect(again.value.counters.updated).toBe(1);
      expect(again.value.rows[0].status).toBe('duplicate');
    }
    expect(store.getSnapshot().operations).toHaveLength(2); // idempotente
  });

  it('partner_name repetido com office diferente é permitido (teste 13)', async () => {
    const { partners } = repo();
    const res = await partners.importPartners([
      importRow({ index: 1, partnerName: 'REPETIDO LTDA', officeName: 'PS - R - 0001' }),
      importRow({ index: 2, partnerName: 'REPETIDO LTDA', officeName: 'PS - R - 0002' }),
    ], true);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.counters.inserted).toBe(2);
  });

  it('duplicado no lote e GC ausente viram erro nominal sem bloquear as válidas (testes 12/15, E8)', async () => {
    const { store, partners } = repo();
    const res = await partners.importPartners([
      importRow({ index: 1, officeName: 'PS - LOTE - 0001' }),
      importRow({ index: 2, officeName: 'ps - lote - 0001' }),
      importRow({ index: 3, officeName: 'PS - LOTE - 0003', managerEmail: 'naoexiste@sint.example' }),
    ], true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.rows[0].status).toBe('ok');
    expect(res.value.rows[1].status).toBe('error');
    expect(res.value.rows[1].messages.join(' ')).toMatch(/Escritorio duplicado na planilha/);
    expect(res.value.rows[2].status).toBe('error');
    expect(res.value.rows[2].messages.join(' ')).toMatch(/GC nao encontrado: naoexiste@sint\.example/);
    expect(res.value.counters).toMatchObject({ inserted: 1, errors: 2 });
    expect(store.getSnapshot().operations).toHaveLength(2); // seed + 1 válida
  });

  it('lote acima do limite é rejeitado (E8)', async () => {
    const { partners } = repo();
    const rows = Array.from({ length: 201 }, (_, i) => importRow({ index: i + 1, officeName: `PS - L - ${i}` }));
    const res = await partners.importPartners(rows, false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/limite de 200/i);
  });
});
