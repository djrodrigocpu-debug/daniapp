/**
 * Troca obrigatória da senha temporária e bootstrap de parceiros sem CNPJ
 * (migration 0016), contra Postgres REAL (PGlite) com 0001..0016 e RLS ativa.
 *
 * Depois da 0017 o banco NÃO opina sobre senha: ele registra quem precisa
 * trocar e quem já trocou. A prova da troca é do GoTrue, na Edge Function
 * `initial-password-change` — comparar hash bcrypt aqui seria inútil, porque o
 * salt é aleatório e a mesma senha produz hash diferente.
 *
 * A conclusão é EXCLUSIVA do servidor (`service_role`): `authenticated` não
 * pode encerrar o próprio gate por RPC.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

const AUTH = {
  a: '00000000-0000-0000-0000-0000000060a1',
  b: '00000000-0000-0000-0000-0000000060a2',
} as const;

const EMAIL = {
  a: 'onboarding.a@sint.example',
  b: 'onboarding.b@sint.example',
} as const;


describe('onboarding de senha e bootstrap de parceiros (0016)', () => {
  let db: TestDb;

  const comoAdmin = <T>(sql: string, params: unknown[] = []) =>
    db.asUser(ID.uAdmin, (tx) => tx.query<T>(sql, params));

  const exigirTroca = (ids: string[]) =>
    comoAdmin<{ r: { marked: number; missingIdentity: number } }>(
      `select public.admin_require_password_change($1::uuid[]) as r`, [ids],
    ).then((r) => r[0].r);

  const statusDe = (userId: string) =>
    db.asUser(userId, (tx) => tx.query<{ r: { required: boolean } }>(
      `select public.password_change_status() as r`)).then((r) => r[0].r);

  /** Conclusão pelo SERVIDOR, como a Edge Function faz (uuid vindo do JWT). */
  const concluirPeloServidor = (userId: string) =>
    db.query<{ r: { required: boolean; changed: boolean } }>(
      `select public.service_complete_initial_password_change($1::uuid) as r`, [userId],
    ).then((r) => r[0].r);

  const criarIdentidade = (id: string, email: string) =>
    db.exec(`insert into auth.users (id, email, email_confirmed_at)
             values ('${id}','${email}', now())
             on conflict (id) do nothing;`);

  const criarPerfil = (id: string, email: string) =>
    db.exec(`insert into public.users (id, display_name, corporate_email, status)
             values ('${id}','Pessoa Sintetica','${email}','active')
             on conflict (id) do nothing;`);

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await db.reset(); await seedScenario(db); });

  describe('marcação administrativa', () => {
    it('1 — admin marca a identidade e a resposta nao carrega nada sensivel', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a);
      const r = await exigirTroca([AUTH.a]);

      expect(r.marked).toBe(1);
      expect(JSON.stringify(r)).not.toMatch(/hash|senha|password/i);
      expect(Object.keys(r).sort()).toEqual(['marked', 'missingIdentity']);
    });

    it('2 — identidade inexistente é contada à parte, sem derrubar o lote', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a);
      const r = await exigirTroca([AUTH.a, '00000000-0000-0000-0000-0000000060ff']);
      expect(r).toEqual({ marked: 1, missingIdentity: 1 });
    });

    it('3 — é idempotente: remarcar reinicia o estado sem duplicar', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a);
      await exigirTroca([AUTH.a]);
      await exigirTroca([AUTH.a]);

      const linhas = await db.query<{ n: number }>(
        `select count(*)::int as n from app.user_password_onboarding where user_id = $1`, [AUTH.a]);
      expect(linhas[0].n).toBe(1);
    });

    it('4 — não-administrador é recusado', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a);
      await expect(db.asUser(ID.uGcA, (tx) => tx.query(
        `select public.admin_require_password_change($1::uuid[])`, [[AUTH.a]],
      ))).rejects.toThrow(/apenas administrador/i);
    });
  });

  describe('estado do próprio usuário', () => {
    it('5 — conta ANTIGA, nunca marcada, não precisa trocar', async () => {
      expect(await statusDe(ID.uGcA)).toEqual({ required: false });
    });

    it('6 — conta marcada fica presa no gate', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a);
      await criarPerfil(AUTH.a, EMAIL.a);
      await exigirTroca([AUTH.a]);
      expect(await statusDe(AUTH.a)).toEqual({ required: true });
    });

    it('7 — o status é sempre o de auth.uid(), nunca o de outro usuário', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a);
      await criarPerfil(AUTH.a, EMAIL.a);
      await criarIdentidade(AUTH.b, EMAIL.b);
      await criarPerfil(AUTH.b, EMAIL.b);
      await exigirTroca([AUTH.a]);

      expect(await statusDe(AUTH.a)).toEqual({ required: true });
      expect(await statusDe(AUTH.b)).toEqual({ required: false });
    });
  });

  describe('conclusão da troca', () => {
    beforeEach(async () => {
      await criarIdentidade(AUTH.a, EMAIL.a);
      await criarPerfil(AUTH.a, EMAIL.a);
      await exigirTroca([AUTH.a]);
    });

    it('8 — a conclusão libera o gate e é registrada', async () => {
      expect(await concluirPeloServidor(AUTH.a)).toEqual({ required: false, changed: true });
      expect(await statusDe(AUTH.a)).toEqual({ required: false });
    });

    it('9 — concluir de novo é idempotente (permite repetir após falha de rede)', async () => {
      await concluirPeloServidor(AUTH.a);
      expect(await concluirPeloServidor(AUTH.a)).toEqual({ required: false, changed: false });
    });

    it('10 — concluir NÃO altera papel, escopo nem status do perfil', async () => {
      const ler = () => db.query(
        `select u.status::text as status,
                (select count(*)::int from public.user_scopes s where s.user_id = u.id and s.active) as escopos
           from public.users u where u.id = $1`, [AUTH.a]);
      const antes = await ler();
      await concluirPeloServidor(AUTH.a);
      expect((await ler())[0]).toEqual(antes[0]);
    });

    it('11 — concluir um usuário não mexe no gate de OUTRO', async () => {
      await criarIdentidade(AUTH.b, EMAIL.b);
      await criarPerfil(AUTH.b, EMAIL.b);
      await exigirTroca([AUTH.b]);

      await concluirPeloServidor(AUTH.b);
      expect(await statusDe(AUTH.b)).toEqual({ required: false });
      expect(await statusDe(AUTH.a)).toEqual({ required: true });
    });

    it('12 — authenticated NAO executa a conclusão: a porta é só do servidor', async () => {
      // Se  pudesse chamar, qualquer pessoa logada encerraria o
      // proprio gate sem trocar senha alguma — que e o defeito que a 0017 fecha.
      await expect(db.asUser(AUTH.a, (tx) => tx.query(
        `select public.service_complete_initial_password_change($1::uuid)`, [AUTH.a],
      ))).rejects.toThrow();
      expect(await statusDe(AUTH.a)).toEqual({ required: true });
    });

    it('13 — a RPC antiga do proprio usuario nao existe mais', async () => {
      await expect(db.asUser(AUTH.a, (tx) => tx.query(
        `select public.complete_initial_password_change()`,
      ))).rejects.toThrow();
    });
  });
  describe('proteção da tabela', () => {
    it('14 — authenticated NÃO consegue ler a tabela de onboarding', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a);
      await criarPerfil(AUTH.a, EMAIL.a);
      await exigirTroca([AUTH.a]);

      await expect(db.asUser(AUTH.a, (tx) => tx.query(
        `select * from app.user_password_onboarding`,
      ))).rejects.toThrow();
      await expect(db.asUser(ID.uAdmin, (tx) => tx.query(
        `select initial_password_hash from app.user_password_onboarding`,
      ))).rejects.toThrow();
    });
  });

  describe('bootstrap de parceiros sem CNPJ', () => {
    const linha = (over: Record<string, unknown> = {}) => ({
      index: 1,
      organizationName: 'Org Fictícia',
      regionName: 'Região Fictícia',
      unitName: 'Unidade Fictícia',
      coordinationName: 'Coord 1',
      partnerName: 'Empresa Sintetica LTDA',
      officeName: 'PS - BOOTSTRAP - 0001',
      city: '0',
      state: 'PR',
      coordinatorEmail: 'coord1@fic.example',
      managerEmail: 'gca@fic.example',
      sourceCode: 'A1B2',
      ddd: '41',
      ...over,
    });

    const bootstrap = (rows: unknown[], commit: boolean) =>
      comoAdmin<{ r: { counters: { errors: number }; rows: Array<{ status: string; cnpj: string | null; sourceCode: string | null; ddd: string | null; warnings: string[] }> } }>(
        `select public.admin_bootstrap_partners($1::jsonb, $2) as r`, [JSON.stringify(rows), commit],
      ).then((r) => r[0].r);

    const normal = (rows: unknown[], commit: boolean) =>
      comoAdmin<{ r: { counters: { errors: number }; rows: Array<{ status: string; messages: string[] }> } }>(
        `select public.admin_import_partners($1::jsonb, $2) as r`, [JSON.stringify(rows), commit],
      ).then((r) => r[0].r);

    beforeEach(async () => {
      await db.exec(`
        update public.users set corporate_email = 'coord1@fic.example' where id = '${ID.uCoord1}';
        update public.users set corporate_email = 'gca@fic.example'    where id = '${ID.uGcA}';
      `);
    });

    it('14 — bootstrap aceita CNPJ ausente, grava NULL e avisa', async () => {
      const r = await bootstrap([linha()], true);

      expect(r.counters.errors).toBe(0);
      expect(r.rows[0].status).toBe('ok');
      expect(r.rows[0].cnpj).toBeNull();
      expect(r.rows[0].warnings).toContain('Cadastro inicial sem CNPJ; preenchimento administrativo pendente.');

      const op = await db.query<{ cnpj: string | null; source_code: string; ddd: string; city: string }>(
        `select cnpj, source_code, ddd, city from public.operations
          where app.normalize_text(office_name) = app.normalize_text('PS - BOOTSTRAP - 0001')`);
      expect(op[0].cnpj).toBeNull();
      expect(op[0].source_code).toBe('A1B2');
      expect(op[0].ddd).toBe('41');
      expect(op[0].city).toBe('0');
    });

    it('15 — NENHUM valor artificial é gravado no lugar do CNPJ', async () => {
      await bootstrap([linha()], true);
      const op = await db.query<{ cnpj: string | null }>(
        `select cnpj from public.operations
          where app.normalize_text(office_name) = app.normalize_text('PS - BOOTSTRAP - 0001')`);
      expect(op[0].cnpj).toBeNull();
      for (const falso of ['00000000000000', '00000000000014', '0', '']) {
        expect(op[0].cnpj).not.toBe(falso);
      }
    });

    it('16 — o importador NORMAL continua exigindo CNPJ para parceiro novo', async () => {
      const r = await normal([linha({ officeName: 'PS - NORMAL - 0002' })], true);
      expect(r.rows[0].status).toBe('error');
      expect(r.rows[0].messages.join(' ')).toMatch(/CNPJ obrigatorio para novo parceiro/i);
    });

    it('17 — reexecutar o bootstrap não duplica o parceiro', async () => {
      await bootstrap([linha()], true);
      const r = await bootstrap([linha({ city: '0' })], true);
      expect(r.rows[0].status).toBe('duplicate');

      const n = await db.query<{ n: number }>(
        `select count(*)::int as n from public.operations
          where app.normalize_text(office_name) = app.normalize_text('PS - BOOTSTRAP - 0001')`);
      expect(n[0].n).toBe(1);
    });

    it('18 — o admin completa o CNPJ depois, pela chave unidade + escritório', async () => {
      await bootstrap([linha()], true);
      // CNPJ sintético válido.
      const dv = (d: string, p: number[]) => {
        let s = 0; for (let i = 0; i < p.length; i += 1) s += Number(d[i]) * p[i];
        const r = s % 11; return r < 2 ? 0 : 11 - r;
      };
      const base = '990000010001';
      const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      const cnpj = `${base}${d1}${dv(`${base}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`;

      const r = await normal([linha({ cnpj })], true);
      expect(r.counters.errors).toBe(0);

      const op = await db.query<{ cnpj: string | null; n: number }>(
        `select cnpj, (select count(*)::int from public.operations) as n
           from public.operations
          where app.normalize_text(office_name) = app.normalize_text('PS - BOOTSTRAP - 0001')`);
      expect(op[0].cnpj).toBe(cnpj);
    });

    it('19 — DDD fora do formato é erro da linha', async () => {
      const r = await bootstrap([linha({ ddd: '415', officeName: 'PS - DDD RUIM - 0003' })], true);
      expect(r.rows[0].status).toBe('error');
    });

    it('20 — bootstrap não cria identidade, perfil nem escopo', async () => {
      const antes = await db.query<{ a: number; u: number; s: number }>(
        `select (select count(*) from auth.users)::int as a,
                (select count(*) from public.users)::int as u,
                (select count(*) from public.user_scopes)::int as s`);
      await bootstrap([linha()], true);
      const depois = await db.query<{ a: number; u: number; s: number }>(
        `select (select count(*) from auth.users)::int as a,
                (select count(*) from public.users)::int as u,
                (select count(*) from public.user_scopes)::int as s`);
      expect(depois[0]).toEqual(antes[0]);
    });

    it('21 — simulação do bootstrap não grava', async () => {
      const r = await bootstrap([linha({ officeName: 'PS - SIMULA - 0004' })], false);
      expect(r.rows[0].status).toBe('ok');
      const n = await db.query<{ n: number }>(
        `select count(*)::int as n from public.operations
          where app.normalize_text(office_name) = app.normalize_text('PS - SIMULA - 0004')`);
      expect(n[0].n).toBe(0);
    });
  });
});
