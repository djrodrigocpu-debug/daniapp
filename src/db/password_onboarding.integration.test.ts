/**
 * Troca obrigatória da senha temporária e bootstrap de parceiros sem CNPJ
 * (migration 0016), contra Postgres REAL (PGlite) com 0001..0016 e RLS ativa.
 *
 * O ponto central: o gate só é liberado quando a senha REALMENTE mudou. A prova
 * é o `encrypted_password` da identidade ter deixado de ser igual ao hash
 * guardado — nunca a palavra do cliente.
 *
 * Nenhuma senha real é usada; os "hashes" são strings sintéticas (§23).
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

/** Valores sintéticos que fazem o papel do bcrypt do GoTrue. */
const HASH_TEMP = '$fic$hash-temporario-sintetico';
const HASH_NOVO = '$fic$hash-depois-da-troca';

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

  const concluirComo = (userId: string) =>
    db.asUser(userId, (tx) => tx.query<{ r: { required: boolean; changed: boolean } }>(
      `select public.complete_initial_password_change() as r`)).then((r) => r[0].r);

  const criarIdentidade = (id: string, email: string, hash: string) =>
    db.exec(`insert into auth.users (id, email, email_confirmed_at, encrypted_password)
             values ('${id}','${email}', now(), '${hash}')
             on conflict (id) do nothing;`);

  /** Simula a troca real de senha feita por supabase.auth.updateUser. */
  const trocarSenhaNoAuth = (id: string, hash: string) =>
    db.exec(`update auth.users set encrypted_password = '${hash}' where id = '${id}';`);

  const criarPerfil = (id: string, email: string) =>
    db.exec(`insert into public.users (id, display_name, corporate_email, status)
             values ('${id}','Pessoa Sintetica','${email}','active')
             on conflict (id) do nothing;`);

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await db.reset(); await seedScenario(db); });

  describe('marcação administrativa', () => {
    it('1 — admin marca a identidade e o hash inicial NÃO é devolvido', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a, HASH_TEMP);
      const r = await exigirTroca([AUTH.a]);

      expect(r.marked).toBe(1);
      expect(JSON.stringify(r)).not.toContain(HASH_TEMP);
      expect(Object.keys(r).sort()).toEqual(['marked', 'missingIdentity']);
    });

    it('2 — identidade inexistente é contada à parte, sem derrubar o lote', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a, HASH_TEMP);
      const r = await exigirTroca([AUTH.a, '00000000-0000-0000-0000-0000000060ff']);
      expect(r).toEqual({ marked: 1, missingIdentity: 1 });
    });

    it('3 — é idempotente: remarcar reinicia o estado sem duplicar', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a, HASH_TEMP);
      await exigirTroca([AUTH.a]);
      await exigirTroca([AUTH.a]);

      const linhas = await db.query<{ n: number }>(
        `select count(*)::int as n from app.user_password_onboarding where user_id = $1`, [AUTH.a]);
      expect(linhas[0].n).toBe(1);
    });

    it('4 — não-administrador é recusado', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a, HASH_TEMP);
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
      await criarIdentidade(AUTH.a, EMAIL.a, HASH_TEMP);
      await criarPerfil(AUTH.a, EMAIL.a);
      await exigirTroca([AUTH.a]);
      expect(await statusDe(AUTH.a)).toEqual({ required: true });
    });

    it('7 — o status é sempre o de auth.uid(), nunca o de outro usuário', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a, HASH_TEMP);
      await criarPerfil(AUTH.a, EMAIL.a);
      await criarIdentidade(AUTH.b, EMAIL.b, HASH_TEMP);
      await criarPerfil(AUTH.b, EMAIL.b);
      await exigirTroca([AUTH.a]);

      expect(await statusDe(AUTH.a)).toEqual({ required: true });
      expect(await statusDe(AUTH.b)).toEqual({ required: false });
    });
  });

  describe('conclusão da troca', () => {
    beforeEach(async () => {
      await criarIdentidade(AUTH.a, EMAIL.a, HASH_TEMP);
      await criarPerfil(AUTH.a, EMAIL.a);
      await exigirTroca([AUTH.a]);
    });

    it('8 — RECUSA concluir enquanto a senha temporária não mudou', async () => {
      await expect(concluirComo(AUTH.a)).rejects.toThrow(/senha temporaria ainda nao foi alterada/i);
      expect(await statusDe(AUTH.a)).toEqual({ required: true });
    });

    it('9 — troca real no Auth libera a conclusão', async () => {
      await trocarSenhaNoAuth(AUTH.a, HASH_NOVO);
      expect(await concluirComo(AUTH.a)).toEqual({ required: false, changed: true });
      expect(await statusDe(AUTH.a)).toEqual({ required: false });
    });

    it('10 — concluir de novo é idempotente (permite repetir após falha de rede)', async () => {
      await trocarSenhaNoAuth(AUTH.a, HASH_NOVO);
      await concluirComo(AUTH.a);
      expect(await concluirComo(AUTH.a)).toEqual({ required: false, changed: false });
    });

    it('11 — concluir NÃO altera papel, escopo nem status do perfil', async () => {
      const antes = await db.query<{ status: string; escopos: number }>(
        `select u.status::text as status,
                (select count(*)::int from public.user_scopes s where s.user_id = u.id and s.active) as escopos
           from public.users u where u.id = $1`, [AUTH.a]);
      await trocarSenhaNoAuth(AUTH.a, HASH_NOVO);
      await concluirComo(AUTH.a);
      const depois = await db.query<{ status: string; escopos: number }>(
        `select u.status::text as status,
                (select count(*)::int from public.user_scopes s where s.user_id = u.id and s.active) as escopos
           from public.users u where u.id = $1`, [AUTH.a]);
      expect(depois[0]).toEqual(antes[0]);
    });

    it('12 — um usuário não conclui o onboarding de OUTRO', async () => {
      await criarIdentidade(AUTH.b, EMAIL.b, HASH_TEMP);
      await criarPerfil(AUTH.b, EMAIL.b);
      // A ordem importa: marcar guarda o hash VIGENTE. Marcar depois da troca
      // gravaria o hash novo como inicial e a conclusão nunca passaria.
      await exigirTroca([AUTH.b]);
      await trocarSenhaNoAuth(AUTH.b, HASH_NOVO);

      // B conclui o dele; o de A continua exigido.
      await concluirComo(AUTH.b);
      expect(await statusDe(AUTH.a)).toEqual({ required: true });
    });
  });

  describe('proteção da tabela', () => {
    it('13 — authenticated NÃO consegue ler o onboarding nem os hashes', async () => {
      await criarIdentidade(AUTH.a, EMAIL.a, HASH_TEMP);
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
