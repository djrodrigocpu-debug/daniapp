/**
 * public.admin_bootstrap_organizational_structure (migration 0018) contra
 * Postgres REAL (PGlite), com as migrations 0001..0018 aplicadas e RLS ativa.
 *
 * PROVA A QUEBRA DO CICLO confirmado em runtime contra o staging real:
 *   - admin_import_users (0010) recusa usuário regional/coordinator/
 *     channel_manager sem região/coordenação já existente;
 *   - import_partners_core (0016) só cria região/coordenação depois de
 *     resolver Coordenador e GC como public.users já existentes.
 * Num banco vazio, nenhum dos dois consegue começar. Esta suíte prova que a
 * 0018 quebra o ciclo (cria SÓ a estrutura, sem usuário nenhum) e que os dois
 * fluxos originais, DEPOIS do bootstrap, funcionam sem qualquer alteração.
 *
 * Dados 100% FICTÍCIOS (§23) — os nomes "AACE"/"RPS"/"PR CAPITAL" etc. são os
 * mesmos rótulos genéricos da carga real, sem e-mail, nome ou senha reais.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

interface StructureRow {
  index?: number;
  organization: string;
  region: string;
  unit: string;
  coordination: string;
  active?: boolean;
}

interface StructureReportRow {
  index: number;
  organization: string;
  region: string;
  unit: string;
  coordination: string;
  status: string;
  action: string;
  messages: string[];
}

interface StructureReport {
  mode: 'simulate' | 'commit';
  counters: { total: number; created: number; reused: number; errors: number };
  toCreate: { organizations: string[]; regions: string[]; units: string[]; coordinations: string[] };
  rows: StructureReportRow[];
}

/** As 3 linhas reais da carga: mesma organização/região, 3 unidades+coordenações. */
const TRES_LINHAS: StructureRow[] = [
  { index: 1, organization: 'AACE', region: 'RPS', unit: 'PR CAPITAL', coordination: 'PR CAPITAL' },
  { index: 2, organization: 'AACE', region: 'RPS', unit: 'PR INTERIOR', coordination: 'PR INTERIOR' },
  { index: 3, organization: 'AACE', region: 'RPS', unit: 'SANTA CATARINA', coordination: 'SANTA CATARINA' },
];

describe('admin_bootstrap_organizational_structure (0018)', () => {
  let db: TestDb;

  const bootstrap = (userId: string, rows: StructureRow[], commit: boolean) =>
    db.asUser(userId, (tx) => tx.query<{ r: StructureReport }>(
      `select public.admin_bootstrap_organizational_structure($1::jsonb, $2) as r`,
      [JSON.stringify(rows), commit])).then((res) => res[0].r);

  const contagens = () => db.query<{
    orgs: number; regions: number; units: number; coordinations: number;
    authUsers: number; users: number; scopes: number; onboarding: number; operations: number;
  }>(`select
        (select count(*)::int from public.organizations) as "orgs",
        (select count(*)::int from public.regions) as "regions",
        (select count(*)::int from public.units) as "units",
        (select count(*)::int from public.coordinations) as "coordinations",
        (select count(*)::int from auth.users) as "authUsers",
        (select count(*)::int from public.users) as "users",
        (select count(*)::int from public.user_scopes) as "scopes",
        (select count(*)::int from app.user_password_onboarding) as "onboarding",
        (select count(*)::int from public.operations) as "operations"
     `).then((r) => r[0]);

  interface UserRow {
    index: number; name: string; email: string; role: string; region: string; authUserId?: string;
  }
  interface UserReport {
    applied: boolean;
    counters: { total: number; inserted: number; updated: number; errors: number };
    rows: Array<{ index: number; status: string; action: string; messages: string[] }>;
  }
  const importUsers = (rows: UserRow[], commit: boolean) =>
    db.asUser(ID.uAdmin, (tx) => tx.query<{ r: UserReport }>(
      `select public.admin_import_users($1::jsonb, $2) as r`,
      [JSON.stringify(rows), commit])).then((res) => res[0].r);
  const criarIdentidade = (id: string, email: string) =>
    db.exec(`insert into auth.users (id, email) values ('${id}','${email}') on conflict (id) do nothing;`);
  const confirmarEmail = (id: string) =>
    db.exec(`update auth.users set email_confirmed_at = now() where id = '${id}';`);
  const ativarConfirmados = () =>
    db.asUser(ID.uAdmin, (tx) => tx.query(`select public.admin_activate_confirmed_users()`));

  interface PartnerReport {
    counters: { total: number; inserted: number; updated: number; errors: number };
    rows: Array<{ index: number; status: string; action: string; messages: string[] }>;
  }
  const bootstrapPartners = (rows: Record<string, unknown>[], commit: boolean) =>
    db.asUser(ID.uAdmin, (tx) => tx.query<{ r: PartnerReport }>(
      `select public.admin_bootstrap_partners($1::jsonb, $2) as r`,
      [JSON.stringify(rows), commit])).then((res) => res[0].r);

  const AUTH_REGIONAL = '00000000-0000-0000-0000-0000000030a1';
  const AUTH_COORD = '00000000-0000-0000-0000-0000000030a2';
  const AUTH_GC = '00000000-0000-0000-0000-0000000030a3';

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db.close(); });

  beforeEach(async () => {
    await db.reset();
    await seedScenario(db);
  });

  describe('autorização', () => {
    it('1 — não-admin não executa', async () => {
      await db.asUser(ID.uReg, (tx) =>
        tx.expectError(`select public.admin_bootstrap_organizational_structure($1::jsonb, false)`,
          [JSON.stringify(TRES_LINHAS)]));
    });

    it('2 — anon não executa', async () => {
      await db.asAnon((tx) =>
        tx.expectError(`select public.admin_bootstrap_organizational_structure($1::jsonb, false)`,
          [JSON.stringify(TRES_LINHAS)]));
    });
  });

  describe('dry-run e commit', () => {
    it('3 — dry-run (p_commit=false) não escreve', async () => {
      const antes = await contagens();
      const r = await bootstrap(ID.uAdmin, TRES_LINHAS, false);
      const depois = await contagens();
      expect(r.mode).toBe('simulate');
      expect(r.counters.errors).toBe(0);
      expect(depois).toEqual(antes);
    });

    it('4 — commit cria a estrutura mínima: 1 organization, 1 region, 3 units, 3 coordinations', async () => {
      const antes = await contagens();
      const r = await bootstrap(ID.uAdmin, TRES_LINHAS, true);
      const depois = await contagens();
      expect(r.mode).toBe('commit');
      expect(r.counters.errors).toBe(0);
      expect(depois.orgs).toBe(antes.orgs + 1);
      expect(depois.regions).toBe(antes.regions + 1);
      expect(depois.units).toBe(antes.units + 3);
      expect(depois.coordinations).toBe(antes.coordinations + 3);
    });
  });

  describe('não duplica nenhum nível', () => {
    it('5 — organization não duplica', async () => {
      await bootstrap(ID.uAdmin, TRES_LINHAS, true);
      const antes = await contagens();
      await bootstrap(ID.uAdmin, [{ organization: 'AACE', region: 'RPS OUTRA', unit: 'U9', coordination: 'C9' }], true);
      const depois = await contagens();
      expect(depois.orgs).toBe(antes.orgs); // mesma organização "AACE" reaproveitada
      expect(depois.regions).toBe(antes.regions + 1); // região nova
    });

    it('6 — region não duplica', async () => {
      await bootstrap(ID.uAdmin, TRES_LINHAS, true);
      const antes = await contagens();
      await bootstrap(ID.uAdmin, [{ organization: 'AACE', region: 'RPS', unit: 'U9', coordination: 'C9' }], true);
      const depois = await contagens();
      expect(depois.regions).toBe(antes.regions); // mesma região "RPS" reaproveitada
      expect(depois.units).toBe(antes.units + 1);
    });

    it('7 — unit não duplica', async () => {
      await bootstrap(ID.uAdmin, TRES_LINHAS, true);
      const antes = await contagens();
      await bootstrap(ID.uAdmin, [{ organization: 'AACE', region: 'RPS', unit: 'PR CAPITAL', coordination: 'C9' }], true);
      const depois = await contagens();
      expect(depois.units).toBe(antes.units); // mesma unidade "PR CAPITAL" reaproveitada
      expect(depois.coordinations).toBe(antes.coordinations + 1);
    });

    it('8 — coordination não duplica', async () => {
      await bootstrap(ID.uAdmin, TRES_LINHAS, true);
      const antes = await contagens();
      const r = await bootstrap(ID.uAdmin, TRES_LINHAS, true);
      const depois = await contagens();
      expect(depois.coordinations).toBe(antes.coordinations);
      expect(r.rows.every((row) => row.status === 'reused')).toBe(true);
    });
  });

  it('9 — reexecução integral é idempotente', async () => {
    await bootstrap(ID.uAdmin, TRES_LINHAS, true);
    const antes = await contagens();
    const r2 = await bootstrap(ID.uAdmin, TRES_LINHAS, true);
    const depois = await contagens();
    expect(depois).toEqual(antes);
    expect(r2.counters.created).toBe(0);
    expect(r2.counters.reused).toBe(3);
    expect(r2.counters.errors).toBe(0);
  });

  it('10 — coordinator_user_id nasce NULL', async () => {
    await bootstrap(ID.uAdmin, TRES_LINHAS, true);
    const rows = await db.query<{ coordinator: string | null }>(
      `select coordinator_user_id as coordinator from public.coordinations
        where name in ('PR CAPITAL','PR INTERIOR','SANTA CATARINA')`);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.coordinator === null)).toBe(true);
  });

  describe('fronteira: nada além de organization/region/unit/coordination', () => {
    it('11/12/13/14/15 — nenhum auth.users, public.users, escopo, onboarding ou parceiro é criado', async () => {
      const antes = await contagens();
      await bootstrap(ID.uAdmin, TRES_LINHAS, true);
      const depois = await contagens();
      expect(depois.authUsers).toBe(antes.authUsers);
      expect(depois.users).toBe(antes.users);
      expect(depois.scopes).toBe(antes.scopes);
      expect(depois.onboarding).toBe(antes.onboarding);
      expect(depois.operations).toBe(antes.operations);
    });
  });

  it('16 — conflito estrutural (linha duplicada no mesmo lote) é recusado, nada é gravado da linha', async () => {
    const antes = await contagens();
    const r = await bootstrap(ID.uAdmin, [
      { index: 1, organization: 'AACE', region: 'RPS', unit: 'PR CAPITAL', coordination: 'PR CAPITAL' },
      { index: 2, organization: 'AACE', region: 'RPS', unit: 'PR CAPITAL', coordination: 'PR CAPITAL' },
    ], true);
    const depois = await contagens();
    expect(r.rows[1].status).toBe('error');
    expect(r.rows[1].messages.join(' ')).toMatch(/duplicada/i);
    // A primeira linha (não-duplicada) segue válida e é gravada normalmente —
    // só a linha conflitante é recusada.
    expect(r.rows[0].status).not.toBe('error');
    expect(depois.units).toBe(antes.units + 1);
    expect(depois.coordinations).toBe(antes.coordinations + 1);
  });

  it('17 — normalização (acento/caixa/espaço) reconhece a mesma estrutura já criada', async () => {
    await bootstrap(ID.uAdmin, TRES_LINHAS, true);
    const antes = await contagens();
    const r = await bootstrap(ID.uAdmin, [
      { organization: '  aace  ', region: 'Rps', unit: 'pr capital', coordination: 'PR   Capital' },
    ], true);
    const depois = await contagens();
    expect(depois).toEqual(antes);
    expect(r.rows[0].status).toBe('reused');
  });

  it('18 — import de usuários funciona depois do bootstrap (zero erro de região/coordenação)', async () => {
    await bootstrap(ID.uAdmin, TRES_LINHAS, true);
    await criarIdentidade(AUTH_REGIONAL, 'regional.novo@fic.example');
    await criarIdentidade(AUTH_COORD, 'coord.novo@fic.example');
    await criarIdentidade(AUTH_GC, 'gc.novo@fic.example');

    const r = await importUsers([
      { index: 1, name: 'Regional Novo', email: 'regional.novo@fic.example', role: 'regional', region: 'RPS', authUserId: AUTH_REGIONAL },
      { index: 2, name: 'Coord Novo', email: 'coord.novo@fic.example', role: 'coordinator', region: 'PR CAPITAL', authUserId: AUTH_COORD },
      { index: 3, name: 'GC Novo', email: 'gc.novo@fic.example', role: 'channel_manager', region: 'PR CAPITAL', authUserId: AUTH_GC },
    ], true);

    expect(r.counters.errors).toBe(0);
    expect(r.rows.every((row) => !row.messages.some((m) => /inexistente/i.test(m)))).toBe(true);
    expect(r.applied).toBe(true);
  });

  it('19/20 — import de parceiros REUTILIZA a estrutura e RECONCILIA coordinator_user_id/GC', async () => {
    await bootstrap(ID.uAdmin, TRES_LINHAS, true);
    await criarIdentidade(AUTH_COORD, 'coord.novo@fic.example');
    await criarIdentidade(AUTH_GC, 'gc.novo@fic.example');
    await importUsers([
      { index: 1, name: 'Coord Novo', email: 'coord.novo@fic.example', role: 'coordinator', region: 'PR CAPITAL', authUserId: AUTH_COORD },
      { index: 2, name: 'GC Novo', email: 'gc.novo@fic.example', role: 'channel_manager', region: 'PR CAPITAL', authUserId: AUTH_GC },
    ], true);
    // Ativação exige e-mail confirmado — sem isto, resolve_scoped_user recusa
    // com "nao esta ativo", como qualquer conta 'invited' recusaria.
    await confirmarEmail(AUTH_COORD);
    await confirmarEmail(AUTH_GC);
    await ativarConfirmados();

    const antesEstrutura = await contagens();
    const r = await bootstrapPartners([{
      index: 1,
      organizationName: 'AACE', regionName: 'RPS', unitName: 'PR CAPITAL', coordinationName: 'PR CAPITAL',
      partnerName: 'Parceiro Fic', officeName: 'Escritorio Fic', city: '0', state: 'PR',
      coordinatorEmail: 'coord.novo@fic.example', managerEmail: 'gc.novo@fic.example',
    }], true);
    const depoisEstrutura = await contagens();

    expect(r.counters.errors).toBe(0);
    // 19 — reutiliza: nenhuma organization/region/unit/coordination nova.
    expect(depoisEstrutura.orgs).toBe(antesEstrutura.orgs);
    expect(depoisEstrutura.regions).toBe(antesEstrutura.regions);
    expect(depoisEstrutura.units).toBe(antesEstrutura.units);
    expect(depoisEstrutura.coordinations).toBe(antesEstrutura.coordinations);

    // 20 — reconcilia: a coordenação criada com coordinator_user_id NULL agora
    // aponta para o coordenador de verdade; o parceiro tem o GC certo.
    const coord = await db.query<{ coordinator: string | null }>(
      `select coordinator_user_id as coordinator from public.coordinations where name = 'PR CAPITAL'`);
    const coordId = await db.query<{ id: string }>(
      `select id from public.users where corporate_email = 'coord.novo@fic.example'`);
    const gcId = await db.query<{ id: string }>(
      `select id from public.users where corporate_email = 'gc.novo@fic.example'`);
    expect(coord[0].coordinator).toBe(coordId[0].id);

    const op = await db.query<{ manager: string | null }>(
      `select channel_manager_user_id as manager from public.operations where office_name = 'Escritorio Fic'`);
    expect(op[0].manager).toBe(gcId[0].id);
  });

  it('21 — fim a fim: bootstrap → usuários → parceiros, sem depender de escrita manual', async () => {
    const simEstrutura = await bootstrap(ID.uAdmin, TRES_LINHAS, false);
    expect(simEstrutura.counters.errors).toBe(0);
    await bootstrap(ID.uAdmin, TRES_LINHAS, true);

    await criarIdentidade(AUTH_COORD, 'coord.e2e@fic.example');
    await criarIdentidade(AUTH_GC, 'gc.e2e@fic.example');
    const simUsuarios = await importUsers([
      { index: 1, name: 'Coord E2E', email: 'coord.e2e@fic.example', role: 'coordinator', region: 'PR INTERIOR', authUserId: AUTH_COORD },
      { index: 2, name: 'GC E2E', email: 'gc.e2e@fic.example', role: 'channel_manager', region: 'PR INTERIOR', authUserId: AUTH_GC },
    ], false);
    expect(simUsuarios.counters.errors).toBe(0);
    await importUsers([
      { index: 1, name: 'Coord E2E', email: 'coord.e2e@fic.example', role: 'coordinator', region: 'PR INTERIOR', authUserId: AUTH_COORD },
      { index: 2, name: 'GC E2E', email: 'gc.e2e@fic.example', role: 'channel_manager', region: 'PR INTERIOR', authUserId: AUTH_GC },
    ], true);
    await confirmarEmail(AUTH_COORD);
    await confirmarEmail(AUTH_GC);
    await ativarConfirmados();

    const simParceiro = await bootstrapPartners([{
      index: 1,
      organizationName: 'AACE', regionName: 'RPS', unitName: 'PR INTERIOR', coordinationName: 'PR INTERIOR',
      partnerName: 'Parceiro E2E', officeName: 'Escritorio E2E', city: '0', state: 'PR',
      coordinatorEmail: 'coord.e2e@fic.example', managerEmail: 'gc.e2e@fic.example',
    }], false);
    expect(simParceiro.counters.errors).toBe(0);
    const commitParceiro = await bootstrapPartners([{
      index: 1,
      organizationName: 'AACE', regionName: 'RPS', unitName: 'PR INTERIOR', coordinationName: 'PR INTERIOR',
      partnerName: 'Parceiro E2E', officeName: 'Escritorio E2E', city: '0', state: 'PR',
      coordinatorEmail: 'coord.e2e@fic.example', managerEmail: 'gc.e2e@fic.example',
    }], true);
    expect(commitParceiro.counters.errors).toBe(0);
    expect(commitParceiro.counters.inserted).toBe(1);
  });
});
