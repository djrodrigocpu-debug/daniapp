/**
 * Semântica do campo `active` em public.admin_import_users (migration 0013),
 * contra Postgres REAL (PGlite) com as migrations 0001..0013 aplicadas e RLS ativa.
 *
 * DEFEITO QUE ISTO TRAVA: até a 0012 a RPC ignorava `active` — inseria sempre
 * `status='invited'` e sempre criava escopo vigente. Com o provisionamento por
 * senha (identidade já confirmada), `admin_activate_confirmed_users` promovia o
 * perfil em seguida, e uma planilha com "Ativo = Não" produzia usuário ATIVO com
 * escopo ATIVO. Estes testes provam o estado final das TABELAS, não do parser.
 *
 * Dados 100% FICTÍCIOS (§23).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

const AUTH = {
  a: '00000000-0000-0000-0000-0000000030a1',
  b: '00000000-0000-0000-0000-0000000030a2',
  c: '00000000-0000-0000-0000-0000000030a3',
} as const;

const EMAIL = {
  a: 'ativo.sintetico@sint.example',
  b: 'inativo.sintetico@sint.example',
  c: 'terceiro.sintetico@sint.example',
} as const;

type Report = {
  mode: string;
  applied: boolean;
  counters: { total: number; inserted: number; updated: number; errors: number; pendingAuth: number };
  pendingAuth: string[];
  rows: Array<{
    index: number; email: string; status: string; action: string;
    requestedActive: boolean | null; finalStatus: string | null; messages: string[];
  }>;
};

interface Row {
  index: number; name: string; email: string; role: string; region: string;
  authUserId?: string; active?: boolean | string;
}

describe('admin_import_users — semântica de ativação (0013)', () => {
  let db: TestDb;

  const importAs = (userId: string, rows: Row[], commit: boolean) =>
    db.asUser(userId, (tx) =>
      tx.query<{ r: Report }>(`select public.admin_import_users($1::jsonb, $2) as r`,
        [JSON.stringify(rows), commit])).then((res) => res[0].r);

  /** 1.3.2: a ativação exige alvo nomeado — não existe mais "ativar todos". */
  const ativarConfirmados = (ids: string[]) =>
    db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ r: { promoted: number } }>(
        `select public.admin_activate_confirmed_users($1::uuid[]) as r`, [ids]))
      .then((res) => res[0].r);

  /** Identidade Auth criada pela Edge Function (createUser). */
  const criarIdentidade = (id: string, email: string, confirmada = false) =>
    db.exec(`insert into auth.users (id, email${confirmada ? ', email_confirmed_at' : ''})
             values ('${id}','${email}'${confirmada ? ', now()' : ''})
             on conflict (id) do nothing;`);

  const perfil = (email: string) =>
    db.query<{ id: string; status: string }>(
      `select id, status::text as status from public.users where corporate_email = $1`, [email]);

  const escoposAtivos = (email: string) =>
    db.query<{ n: number }>(
      `select count(*)::int as n from public.user_scopes s
        join public.users u on u.id = s.user_id
       where u.corporate_email = $1 and s.active`, [email]);

  const escoposTotais = (email: string) =>
    db.query<{ n: number }>(
      `select count(*)::int as n from public.user_scopes s
        join public.users u on u.id = s.user_id
       where u.corporate_email = $1`, [email]);

  const linhaGc = (email: string, active?: boolean | string, authUserId?: string): Row => ({
    index: 1, name: 'Pessoa Sintetica', email, role: 'channel_manager', region: 'Coord 1',
    ...(authUserId ? { authUserId } : {}),
    ...(active === undefined ? {} : { active }),
  });

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db.close(); });

  beforeEach(async () => {
    await db.reset();
    await seedScenario(db);
  });

  it('1 — `active` ausente equivale a true (planilha antiga continua válida)', async () => {
    await criarIdentidade(AUTH.a, EMAIL.a);
    const r = await importAs(ID.uAdmin, [linhaGc(EMAIL.a, undefined, AUTH.a)], true);

    expect(r.applied).toBe(true);
    expect(r.rows[0].requestedActive).toBe(true);
    expect(r.rows[0].finalStatus).toBe('invited');
    expect((await perfil(EMAIL.a))[0].status).toBe('invited');
    expect((await escoposAtivos(EMAIL.a))[0].n).toBe(1);
  });

  it('2 — novo com active=true: invited + escopo ativo; confirmado vira active', async () => {
    await criarIdentidade(AUTH.a, EMAIL.a);
    await importAs(ID.uAdmin, [linhaGc(EMAIL.a, true, AUTH.a)], true);

    expect((await perfil(EMAIL.a))[0].status).toBe('invited');
    expect((await escoposAtivos(EMAIL.a))[0].n).toBe(1);

    // Sem e-mail confirmado, a ativação não promove.
    await ativarConfirmados([AUTH.a]);
    expect((await perfil(EMAIL.a))[0].status).toBe('invited');

    // Com identidade confirmada (é o que createUser + email_confirm produz):
    await db.exec(`update auth.users set email_confirmed_at = now() where id = '${AUTH.a}';`);
    const promo = await ativarConfirmados([AUTH.a]);
    expect(promo.promoted).toBe(1);
    expect((await perfil(EMAIL.a))[0].status).toBe('active');
  });

  it('3 — novo com active=false: inactive, ZERO escopo ativo, e ativação não promove', async () => {
    // Identidade JÁ confirmada — exatamente o cenário que antes virava 'active'.
    await criarIdentidade(AUTH.b, EMAIL.b, true);
    const r = await importAs(ID.uAdmin, [linhaGc(EMAIL.b, false, AUTH.b)], true);

    expect(r.rows[0].requestedActive).toBe(false);
    expect(r.rows[0].finalStatus).toBe('inactive');
    expect((await perfil(EMAIL.b))[0].status).toBe('inactive');
    expect((await escoposAtivos(EMAIL.b))[0].n).toBe(0);
    expect((await escoposTotais(EMAIL.b))[0].n).toBe(0);

    const promo = await ativarConfirmados([AUTH.b]);
    expect(promo.promoted).toBe(0);
    expect((await perfil(EMAIL.b))[0].status).toBe('inactive');
  });

  it('4 — existente active → inactive: escopo encerrado e nenhum novo', async () => {
    await criarIdentidade(AUTH.a, EMAIL.a, true);
    await importAs(ID.uAdmin, [linhaGc(EMAIL.a, true, AUTH.a)], true);
    await ativarConfirmados([AUTH.a]);
    expect((await perfil(EMAIL.a))[0].status).toBe('active');
    expect((await escoposAtivos(EMAIL.a))[0].n).toBe(1);

    await importAs(ID.uAdmin, [linhaGc(EMAIL.a, false)], true);

    expect((await perfil(EMAIL.a))[0].status).toBe('inactive');
    expect((await escoposAtivos(EMAIL.a))[0].n).toBe(0);
    // O escopo antigo continua no histórico, encerrado — não é apagado.
    expect((await escoposTotais(EMAIL.a))[0].n).toBe(1);
    const encerrado = await db.query<{ valid_to: string | null }>(
      `select s.valid_to from public.user_scopes s join public.users u on u.id = s.user_id
        where u.corporate_email = $1`, [EMAIL.a]);
    expect(encerrado[0].valid_to).not.toBeNull();
  });

  it('5 — existente inactive → active: só termina active com identidade confirmada', async () => {
    await criarIdentidade(AUTH.b, EMAIL.b, true);
    await importAs(ID.uAdmin, [linhaGc(EMAIL.b, false, AUTH.b)], true);
    expect((await perfil(EMAIL.b))[0].status).toBe('inactive');

    const r = await importAs(ID.uAdmin, [linhaGc(EMAIL.b, true)], true);
    expect(r.rows[0].finalStatus).toBe('invited');
    // A RPC NUNCA promove sozinha: passa por 'invited'.
    expect((await perfil(EMAIL.b))[0].status).toBe('invited');
    expect((await escoposAtivos(EMAIL.b))[0].n).toBe(1);

    await ativarConfirmados([AUTH.b]);
    expect((await perfil(EMAIL.b))[0].status).toBe('active');
  });

  it('6 — suspended + active=true: ERRO e nada é alterado', async () => {
    await criarIdentidade(AUTH.a, EMAIL.a, true);
    await importAs(ID.uAdmin, [linhaGc(EMAIL.a, true, AUTH.a)], true);
    await db.exec(`update public.users set status = 'suspended' where corporate_email = '${EMAIL.a}';`);
    const escoposAntes = (await escoposAtivos(EMAIL.a))[0].n;

    const r = await importAs(ID.uAdmin, [linhaGc(EMAIL.a, true)], true);

    expect(r.applied).toBe(false);
    expect(r.counters.errors).toBe(1);
    expect(r.rows[0].messages.join(' ')).toMatch(/suspenso nao pode ser reativado/i);
    expect((await perfil(EMAIL.a))[0].status).toBe('suspended');
    expect((await escoposAtivos(EMAIL.a))[0].n).toBe(escoposAntes);
  });

  it('7 — suspended + active=false: permanece suspended e encerra escopos', async () => {
    await criarIdentidade(AUTH.a, EMAIL.a, true);
    await importAs(ID.uAdmin, [linhaGc(EMAIL.a, true, AUTH.a)], true);
    await db.exec(`update public.users set status = 'suspended' where corporate_email = '${EMAIL.a}';`);

    const r = await importAs(ID.uAdmin, [linhaGc(EMAIL.a, false)], true);

    expect(r.applied).toBe(true);
    expect(r.rows[0].finalStatus).toBe('suspended');
    expect((await perfil(EMAIL.a))[0].status).toBe('suspended');
    expect((await escoposAtivos(EMAIL.a))[0].n).toBe(0);
  });

  it('8 — erro numa linha impede TODAS as escritas do lote', async () => {
    await criarIdentidade(AUTH.a, EMAIL.a);
    await criarIdentidade(AUTH.c, EMAIL.c);
    const r = await importAs(ID.uAdmin, [
      linhaGc(EMAIL.a, true, AUTH.a),
      { ...linhaGc(EMAIL.c, 'talvez', AUTH.c), index: 2 },
    ], true);

    expect(r.applied).toBe(false);
    expect(r.counters.errors).toBe(1);
    expect(r.rows[1].messages.join(' ')).toMatch(/invalido em ativo/i);
    expect(await perfil(EMAIL.a)).toHaveLength(0);
    expect(await perfil(EMAIL.c)).toHaveLength(0);
  });

  it('9 — simulação não grava nada', async () => {
    await criarIdentidade(AUTH.b, EMAIL.b, true);
    const r = await importAs(ID.uAdmin, [linhaGc(EMAIL.b, false, AUTH.b)], false);

    expect(r.mode).toBe('simulate');
    expect(r.applied).toBe(false);
    expect(r.rows[0].requestedActive).toBe(false);
    expect(r.rows[0].finalStatus).toBe('inactive');
    expect(await perfil(EMAIL.b)).toHaveLength(0);
  });

  it('10 — `active` textual normalizado também é aceito', async () => {
    await criarIdentidade(AUTH.b, EMAIL.b, true);
    await importAs(ID.uAdmin, [linhaGc(EMAIL.b, 'nao', AUTH.b)], true);
    expect((await perfil(EMAIL.b))[0].status).toBe('inactive');
    expect((await escoposAtivos(EMAIL.b))[0].n).toBe(0);
  });

  it('11 — admin com active=false fica inactive e sem escopo, sem exigir área', async () => {
    await criarIdentidade(AUTH.c, EMAIL.c, true);
    const r = await importAs(ID.uAdmin, [{
      index: 1, name: 'Admin Sintetico', email: EMAIL.c, role: 'admin', region: '',
      authUserId: AUTH.c, active: false,
    }], true);

    expect(r.applied).toBe(true);
    expect((await perfil(EMAIL.c))[0].status).toBe('inactive');
    expect((await escoposAtivos(EMAIL.c))[0].n).toBe(0);
  });

  it('12 — usuário inativo não consegue montar sessão (status recusado)', async () => {
    await criarIdentidade(AUTH.b, EMAIL.b, true);
    await importAs(ID.uAdmin, [linhaGc(EMAIL.b, false, AUTH.b)], true);

    // `ui_users` é a projeção que o app usa para montar a sessão; o repositório
    // recusa qualquer status diferente de 'active'.
    const [u] = await perfil(EMAIL.b);
    const visao = await db.asUser(ID.uAdmin, (tx) => tx.query<{ status: string }>(
      `select "status" from public.ui_users where "id" = $1`, [u.id]));
    expect(visao[0].status).not.toBe('active');
    expect(visao[0].status).toBe('inactive');
  });
});
