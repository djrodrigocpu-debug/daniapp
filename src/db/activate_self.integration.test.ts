/**
 * public.activate_self (migration 0012) contra Postgres REAL (PGlite), com as
 * migrations 0001..0012 aplicadas e RLS ativa.
 *
 * Prova que o convidado consegue concluir o próprio onboarding SEM ser
 * administrador, e que nada além disso é permitido. Dados fictícios (§23).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

const AUTH_CONVIDADO = '00000000-0000-0000-0000-0000000030a1';
const AUTH_SEM_PERFIL = '00000000-0000-0000-0000-0000000030a2';

describe('activate_self — auto-ativação do convidado (0012)', () => {
  let db: TestDb;

  const ativarComo = (uid: string) =>
    db.asUser(uid, (tx) => tx.query<{ r: { status: string; changed: boolean } }>(
      `select public.activate_self() as r`)).then((r) => r[0].r);

  const erroAoAtivar = (uid: string) =>
    db.asUser(uid, (tx) => tx.expectError(`select public.activate_self()`));

  const statusDe = (uid: string) => db.query<{ status: string }>(
    `select status::text from public.users where id = $1`, [uid]).then((r) => r[0]?.status);

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db.close(); });

  beforeEach(async () => {
    await db.reset();
    await seedScenario(db);
    // Convidado: identidade confirmada + perfil 'invited' + escopo de GC.
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at)
        values ('${AUTH_CONVIDADO}','convidado@fic.example', now());
      insert into public.users (id, display_name, corporate_email, status)
        values ('${AUTH_CONVIDADO}','Convidado Fic','convidado@fic.example','invited');
      insert into public.user_scopes (user_id, role, coordination_id)
        values ('${AUTH_CONVIDADO}','channel_manager','${ID.coord1}');
      insert into auth.users (id, email, email_confirmed_at)
        values ('${AUTH_SEM_PERFIL}','sem.perfil@fic.example', now());
    `);
  });

  it('1 — convidado com e-mail confirmado se ativa sozinho, sem ser admin', async () => {
    expect(await statusDe(AUTH_CONVIDADO)).toBe('invited');
    const r = await ativarComo(AUTH_CONVIDADO);
    expect(r).toEqual({ status: 'active', changed: true });
    expect(await statusDe(AUTH_CONVIDADO)).toBe('active');
  });

  it('2 — sem e-mail confirmado a ativação é recusada', async () => {
    await db.exec(`update auth.users set email_confirmed_at = null where id = '${AUTH_CONVIDADO}';`);
    const erro = await erroAoAtivar(AUTH_CONVIDADO);
    expect(erro.message).toMatch(/nao confirmado/i);
    expect(await statusDe(AUTH_CONVIDADO)).toBe('invited');
  });

  it('3 — já ativo é idempotente: sucesso sem escrita', async () => {
    await ativarComo(AUTH_CONVIDADO);
    const r = await ativarComo(AUTH_CONVIDADO);
    expect(r).toEqual({ status: 'active', changed: false });
  });

  it('4 — suspenso NÃO consegue se reativar (decisão é administrativa)', async () => {
    await db.exec(`update public.users set status = 'suspended' where id = '${AUTH_CONVIDADO}';`);
    const erro = await erroAoAtivar(AUTH_CONVIDADO);
    expect(erro.message).toMatch(/nao pode se autoativar/i);
    expect(await statusDe(AUTH_CONVIDADO)).toBe('suspended');
  });

  it('4b — inativo também não se reativa', async () => {
    await db.exec(`update public.users set status = 'inactive' where id = '${AUTH_CONVIDADO}';`);
    await erroAoAtivar(AUTH_CONVIDADO);
    expect(await statusDe(AUTH_CONVIDADO)).toBe('inactive');
  });

  it('5 — não existe como ativar TERCEIRO: a função só olha auth.uid()', async () => {
    // A função não recebe parâmetro algum: quem chama só pode agir sobre si.
    // O GC A (já ativo) chama e o convidado permanece intocado.
    await db.exec(`update auth.users set email_confirmed_at = now() where id = '${ID.uGcA}';`);
    expect(await ativarComo(ID.uGcA)).toEqual({ status: 'active', changed: false });
    expect(await statusDe(AUTH_CONVIDADO)).toBe('invited');

    // E a assinatura não aceita alvo: passar um uuid é erro de função inexistente.
    const erro = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.activate_self($1)`, [AUTH_CONVIDADO]));
    expect(erro.message).toMatch(/does not exist|nao existe/i);
    expect(await statusDe(AUTH_CONVIDADO)).toBe('invited');
  });

  it('6 — identidade Auth sem perfil correspondente é recusada', async () => {
    const erro = await erroAoAtivar(AUTH_SEM_PERFIL);
    expect(erro.message).toMatch(/perfil corporativo inexistente/i);
  });

  it('7 — anônimo (sem sessão) não ativa nada', async () => {
    const erro = await db.asAnon((tx) => tx.expectError(`select public.activate_self()`));
    expect(erro.message).toBeTruthy();
    expect(await statusDe(AUTH_CONVIDADO)).toBe('invited');
  });

  it('8 — a ativação NÃO altera papel, escopo, região ou coordenação', async () => {
    const antes = await db.query<{ role: string; region_id: string | null; coordination_id: string | null; n: number }>(
      `select role::text, region_id, coordination_id, (select count(*)::int from public.user_scopes where user_id = $1) as n
         from public.user_scopes where user_id = $1 and active`, [AUTH_CONVIDADO]);
    await ativarComo(AUTH_CONVIDADO);
    const depois = await db.query<{ role: string; region_id: string | null; coordination_id: string | null; n: number }>(
      `select role::text, region_id, coordination_id, (select count(*)::int from public.user_scopes where user_id = $1) as n
         from public.user_scopes where user_id = $1 and active`, [AUTH_CONVIDADO]);
    expect(depois).toEqual(antes);
  });

  it('9 — depois de ativo, o GC é aceito na importação de Parceiros AACE', async () => {
    await ativarComo(AUTH_CONVIDADO);
    const rel = await db.asUser(ID.uAdmin, (tx) => tx.query<{ r: { counters: { errors: number; inserted: number } } }>(
      `select public.admin_import_partners($1::jsonb, true) as r`,
      [JSON.stringify([{
        index: 1, organizationName: 'Org Fictícia', regionName: 'Região Fictícia',
        unitName: 'Unidade Fictícia', coordinationName: 'Coord 1',
        partnerName: 'Parceiro Convite Fic', officeName: 'Loja Convite Fic',
        city: 'Curitiba', state: 'PR',
        coordinatorEmail: 'coord1@fic.example', managerEmail: 'convidado@fic.example',
      }])]));
    expect(rel[0].r.counters).toMatchObject({ errors: 0, inserted: 1 });
  });

  it('10 — antes de ativar, o MESMO GC é recusado na importação', async () => {
    const rel = await db.asUser(ID.uAdmin, (tx) => tx.query<{ r: { counters: { errors: number }; rows: Array<{ messages: string[] }> } }>(
      `select public.admin_import_partners($1::jsonb, true) as r`,
      [JSON.stringify([{
        index: 1, organizationName: 'Org Fictícia', regionName: 'Região Fictícia',
        unitName: 'Unidade Fictícia', coordinationName: 'Coord 1',
        partnerName: 'Parceiro Convite Fic', officeName: 'Loja Convite Fic',
        city: 'Curitiba', state: 'PR',
        coordinatorEmail: 'coord1@fic.example', managerEmail: 'convidado@fic.example',
      }])]));
    expect(rel[0].r.counters.errors).toBe(1);
    expect(rel[0].r.rows[0].messages.join(' ')).toMatch(/GC nao esta ativo/);
  });
});
