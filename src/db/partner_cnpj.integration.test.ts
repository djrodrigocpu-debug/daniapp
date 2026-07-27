/**
 * CNPJ dos Parceiros AACE (migration 0014) contra Postgres REAL (PGlite),
 * com as migrations 0001..0014 aplicadas e RLS ativa.
 *
 * FRONTEIRA provada aqui: parceiro é entidade CADASTRAL. Nada neste caminho
 * cria identidade em `auth.users`, perfil em `public.users` ou escopo em
 * `public.user_scopes` — o CNPJ nunca é credencial.
 *
 * CNPJs 100% SINTÉTICOS, gerados por `cnpjFixture` (§23).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

/** Gera um CNPJ sintético válido a partir de 12 dígitos base. */
function cnpjFixture(base12: string): string {
  const dv = (digits: string, pesos: number[]) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i += 1) soma += Number(digits[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(`${base12}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${d2}`;
}

const CNPJ_A = cnpjFixture('123456780001');
const CNPJ_B = cnpjFixture('987654320001');
const REGION2 = '00000000-0000-0000-0000-00000000b002';
const UNIT2 = '00000000-0000-0000-0000-00000000c002';
const COORD3 = '00000000-0000-0000-0000-00000000d003';

interface Dto { id: string; cnpj: string | null; warnings?: string[] }

describe('CNPJ dos Parceiros AACE (0014)', () => {
  let db: TestDb;

  const criar = (input: Record<string, unknown>) =>
    db.asUser(ID.uAdmin, (tx) => tx.query<{ r: Dto }>(
      `select public.admin_create_operation($1::jsonb) as r`, [JSON.stringify(input)]))
      .then((res) => res[0].r);

  const editar = (id: string, patch: Record<string, unknown>) =>
    db.asUser(ID.uAdmin, (tx) => tx.query<{ r: Dto }>(
      `select public.admin_update_operation($1::uuid, $2::jsonb) as r`, [id, JSON.stringify(patch)]))
      .then((res) => res[0].r);

  const base = (over: Record<string, unknown> = {}) => ({
    partnerName: 'Empresa Sintetica',
    officeName: 'Escritorio Um',
    city: 'Curitiba',
    state: 'PR',
    unitName: 'Unidade Fictícia',
    coordinationName: 'Coord 1',
    cnpj: CNPJ_A,
    active: false,
    ...over,
  });

  const cnpjNoBanco = (id: string) =>
    db.query<{ cnpj: string | null }>(`select cnpj from public.operations where id = $1`, [id]);

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db.close(); });

  beforeEach(async () => {
    await db.reset();
    await seedScenario(db);
    // Segunda unidade, para provar que o mesmo CNPJ vale em unidades distintas.
    await db.exec(`
      insert into public.regions (id, organization_id, name) values ('${REGION2}','${ID.org}','Regiao Dois Fic');
      insert into public.units (id, region_id, name) values ('${UNIT2}','${REGION2}','Unidade Dois Fic');
      insert into public.coordinations (id, region_id, name) values ('${COORD3}','${REGION2}','Coord Tres Fic');
    `);
  });

  describe('coluna, CHECK e legado', () => {
    it('1 — coluna é nullable: registros legados seguem válidos sem CNPJ', async () => {
      const legados = await db.query<{ n: number }>(
        `select count(*)::int as n from public.operations where cnpj is null`);
      expect(legados[0].n).toBeGreaterThan(0);
    });

    it('2 — CHECK recusa CNPJ inválido escrito direto na tabela', async () => {
      const invalidos = ['12345678000100', '11111111111111', '123', 'abcdefghijklmn'];
      for (const ruim of invalidos) {
        await expect(db.exec(
          `update public.operations set cnpj = '${ruim}' where id = '${ID.opA}';`,
        )).rejects.toThrow();
      }
    });

    it('3 — CHECK aceita CNPJ válido de 14 dígitos', async () => {
      await db.exec(`update public.operations set cnpj = '${CNPJ_A}' where id = '${ID.opA}';`);
      expect((await cnpjNoBanco(ID.opA))[0].cnpj).toBe(CNPJ_A);
    });

    it('4 — helpers normalizam e validam', async () => {
      const r = await db.query<{ norm: string; ok: boolean; ruim: boolean }>(
        `select app.normalize_cnpj('12.345.678/0001-95') as norm,
                app.is_valid_cnpj('${CNPJ_A}') as ok,
                app.is_valid_cnpj('11111111111111') as ruim`);
      expect(r[0].norm).toBe('12345678000195');
      expect(r[0].ok).toBe(true);
      expect(r[0].ruim).toBe(false);
    });
  });

  describe('admin_create_operation', () => {
    it('5 — exige CNPJ em parceiro novo', async () => {
      await expect(criar(base({ cnpj: '' }))).rejects.toThrow(/CNPJ e obrigatorio/i);
    });

    it('6 — recusa CNPJ inválido sem ecoar o valor recebido', async () => {
      const erro = await criar(base({ cnpj: '12.345.678/0001-00' })).catch((e: Error) => e);
      expect(String(erro)).toMatch(/CNPJ invalido/i);
      expect(String(erro)).not.toContain('12345678000100');
    });

    it('7 — persiste SOMENTE os 14 dígitos, aceitando entrada formatada', async () => {
      const formatado = `${CNPJ_A.slice(0, 2)}.${CNPJ_A.slice(2, 5)}.${CNPJ_A.slice(5, 8)}/${CNPJ_A.slice(8, 12)}-${CNPJ_A.slice(12)}`;
      const dto = await criar(base({ cnpj: formatado }));
      expect((await cnpjNoBanco(dto.id))[0].cnpj).toBe(CNPJ_A);
    });

    it('8 — mesmo CNPJ na MESMA unidade é recusado', async () => {
      await criar(base());
      await expect(criar(base({ officeName: 'Escritorio Dois' })))
        .rejects.toThrow(/CNPJ ja cadastrado nesta unidade/i);
    });

    it('9 — mesmo CNPJ em unidade DIFERENTE é aceito', async () => {
      const um = await criar(base());
      const dois = await criar(base({
        unitName: 'Unidade Dois Fic', coordinationName: 'Coord Tres Fic', officeName: 'Escritorio Dois',
      }));
      expect(um.id).not.toBe(dois.id);
      expect((await cnpjNoBanco(dois.id))[0].cnpj).toBe(CNPJ_A);
    });

    it('10 — o índice antigo (unidade + escritório) continua valendo', async () => {
      await criar(base());
      await expect(criar(base({ cnpj: CNPJ_B })))
        .rejects.toThrow(/escritorio ja cadastrado nesta unidade/i);
    });
  });

  describe('admin_update_operation', () => {
    it('11 — patch SEM a chave cnpj preserva o valor atual', async () => {
      const dto = await criar(base());
      await editar(dto.id, { city: 'Londrina' });
      expect((await cnpjNoBanco(dto.id))[0].cnpj).toBe(CNPJ_A);
    });

    it('12 — legado pode ser editado sem ganhar CNPJ, com aviso', async () => {
      const dto = await editar(ID.opA, { city: 'Maringa' });
      expect((await cnpjNoBanco(ID.opA))[0].cnpj).toBeNull();
      expect(dto.warnings).toContain('Registro legado ainda sem CNPJ.');
    });

    it('13 — legado pode receber CNPJ depois', async () => {
      await editar(ID.opA, { cnpj: CNPJ_B });
      expect((await cnpjNoBanco(ID.opA))[0].cnpj).toBe(CNPJ_B);
    });

    it('14 — campo vazio NÃO apaga um CNPJ já gravado', async () => {
      const dto = await criar(base());
      await expect(editar(dto.id, { cnpj: '' })).rejects.toThrow(/nao apaga o valor atual/i);
      expect((await cnpjNoBanco(dto.id))[0].cnpj).toBe(CNPJ_A);
    });

    it('15 — conflito de CNPJ na mesma unidade é recusado', async () => {
      const um = await criar(base());
      const dois = await criar(base({ officeName: 'Escritorio Dois', cnpj: CNPJ_B }));
      await expect(editar(dois.id, { cnpj: CNPJ_A })).rejects.toThrow(/CNPJ ja cadastrado nesta unidade/i);
      expect((await cnpjNoBanco(um.id))[0].cnpj).toBe(CNPJ_A);
    });

    it('16 — mudar de unidade revalida o conflito de CNPJ no destino', async () => {
      await criar(base({
        unitName: 'Unidade Dois Fic', coordinationName: 'Coord Tres Fic', officeName: 'Escritorio Destino',
      }));
      const movel = await criar(base({ officeName: 'Escritorio Movel' }));

      await expect(editar(movel.id, {
        unitName: 'Unidade Dois Fic', coordinationName: 'Coord Tres Fic',
      })).rejects.toThrow(/CNPJ ja cadastrado nesta unidade/i);
    });
  });

  describe('projeção e DTO', () => {
    it('17 — ui_admin_partners expõe cnpj e mantém as colunas anteriores', async () => {
      const dto = await criar(base());
      const linhas = await db.asUser(ID.uAdmin, (tx) => tx.query<Record<string, unknown>>(
        `select * from public.ui_admin_partners where "id" = $1`, [dto.id]));

      expect(linhas[0].cnpj).toBe(CNPJ_A);
      for (const antiga of ['id', 'partnerName', 'officeName', 'city', 'state', 'active', 'unitId', 'managerId']) {
        expect(Object.keys(linhas[0])).toContain(antiga);
      }
      // `cnpj` foi acrescentado no FIM, sem deslocar consumidores.
      expect(Object.keys(linhas[0]).at(-1)).toBe('cnpj');
    });

    it('18 — partner_dto devolve cnpj', async () => {
      const dto = await criar(base());
      expect(dto.cnpj).toBe(CNPJ_A);
    });
  });

  describe('fronteira: parceiro não é usuário', () => {
    it('19 — criar parceiro não escreve em auth.users, users nem user_scopes', async () => {
      const antes = await db.query<{ a: number; u: number; s: number }>(
        `select (select count(*) from auth.users)::int as a,
                (select count(*) from public.users)::int as u,
                (select count(*) from public.user_scopes)::int as s`);

      await criar(base());
      await editar((await criar(base({ officeName: 'Escritorio Tres', cnpj: CNPJ_B }))).id, { city: 'Ponta Grossa' });

      const depois = await db.query<{ a: number; u: number; s: number }>(
        `select (select count(*) from auth.users)::int as a,
                (select count(*) from public.users)::int as u,
                (select count(*) from public.user_scopes)::int as s`);

      expect(depois[0]).toEqual(antes[0]);
    });
  });
});
