/**
 * CNPJ no importador de Parceiros AACE (migration 0015) contra Postgres REAL
 * (PGlite), com 0001..0015 aplicadas e RLS ativa.
 *
 * O ponto central: dentro da unidade o parceiro passa a ter DUAS chaves naturais
 * — CNPJ e escritório. Estes testes provam que discordância entre elas vira erro
 * nominal, nunca fusão de registros nem transferência automática de CNPJ.
 *
 * CNPJs e e-mails 100% SINTÉTICOS (§23).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

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

const CNPJ_A = cnpjFixture('510000010001');
const CNPJ_B = cnpjFixture('510000020001');
const CNPJ_C = cnpjFixture('510000030001');

type Report = {
  mode: string;
  counters: { total: number; inserted: number; updated: number; errors: number };
  rows: Array<{
    index: number; officeName: string; cnpj: string | null;
    status: string; action: string; operationId: string | null;
    messages: string[]; warnings: string[];
  }>;
};

interface Row {
  index: number; organizationName: string; regionName: string; unitName: string;
  coordinationName: string; partnerName: string; officeName: string; city: string;
  state: string; coordinatorEmail: string; managerEmail: string; cnpj?: string;
}

describe('Importador de Parceiros — CNPJ (0015)', () => {
  let db: TestDb;

  const importar = (rows: Row[], commit: boolean) =>
    db.asUser(ID.uAdmin, (tx) => tx.query<{ r: Report }>(
      `select public.admin_import_partners($1::jsonb, $2) as r`,
      [JSON.stringify(rows), commit])).then((res) => res[0].r);

  /** Linha completa apontando para a estrutura do fixture (Coord 1 / uGcA). */
  const linha = (over: Partial<Row> = {}): Row => ({
    index: 1,
    organizationName: 'Org Fictícia',
    regionName: 'Região Fictícia',
    unitName: 'Unidade Fictícia',
    coordinationName: 'Coord 1',
    partnerName: 'Empresa Sintetica LTDA',
    officeName: 'PS - ESCRITORIO CNPJ - 0001',
    city: 'Curitiba',
    state: 'PR',
    coordinatorEmail: 'coord1@fic.example',
    managerEmail: 'gca@fic.example',
    cnpj: CNPJ_A,
    ...over,
  });

  const operacao = (office: string) =>
    db.query<{ id: string; cnpj: string | null; office_name: string }>(
      `select id, cnpj, office_name from public.operations
        where app.normalize_text(office_name) = app.normalize_text($1)`, [office]);

  const contagens = () =>
    db.query<{ a: number; u: number; s: number }>(
      `select (select count(*) from auth.users)::int as a,
              (select count(*) from public.users)::int as u,
              (select count(*) from public.user_scopes)::int as s`);

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.reset();
    await seedScenario(db);
    // E-mails do fixture, para que a resolução estrita de pessoas funcione.
    await db.exec(`
      update public.users set corporate_email = 'coord1@fic.example' where id = '${ID.uCoord1}';
      update public.users set corporate_email = 'gca@fic.example'    where id = '${ID.uGcA}';
    `);
  });

  describe('inserção', () => {
    it('1 — novo com CNPJ válido insere e persiste 14 dígitos', async () => {
      const r = await importar([linha()], true);
      expect(r.rows[0].status).toBe('ok');
      expect(r.rows[0].action).toBe('insert');
      expect((await operacao('PS - ESCRITORIO CNPJ - 0001'))[0].cnpj).toBe(CNPJ_A);
    });

    it('2 — CNPJ formatado na planilha é normalizado antes de gravar', async () => {
      const fmt = `${CNPJ_B.slice(0, 2)}.${CNPJ_B.slice(2, 5)}.${CNPJ_B.slice(5, 8)}/${CNPJ_B.slice(8, 12)}-${CNPJ_B.slice(12)}`;
      await importar([linha({ cnpj: fmt })], true);
      expect((await operacao('PS - ESCRITORIO CNPJ - 0001'))[0].cnpj).toBe(CNPJ_B);
    });

    it('3 — novo SEM CNPJ é erro e nada é criado', async () => {
      const r = await importar([linha({ cnpj: undefined })], true);
      expect(r.rows[0].status).toBe('error');
      expect(r.rows[0].messages.join(' ')).toMatch(/CNPJ obrigatorio para novo parceiro/i);
      expect(await operacao('PS - ESCRITORIO CNPJ - 0001')).toHaveLength(0);
    });

    it('4 — CNPJ inválido é erro e a mensagem NÃO devolve o valor recebido', async () => {
      const ruim = '12345678000100';
      const r = await importar([linha({ cnpj: ruim })], true);
      expect(r.rows[0].status).toBe('error');
      expect(r.rows[0].messages.join(' ')).toMatch(/CNPJ invalido/i);
      expect(JSON.stringify(r.rows[0])).not.toContain(ruim);
      expect(r.rows[0].cnpj).toBeNull();
    });

    it('5 — o relatório devolve o CNPJ formatado', async () => {
      const r = await importar([linha()], true);
      expect(r.rows[0].cnpj).toBe(
        `${CNPJ_A.slice(0, 2)}.${CNPJ_A.slice(2, 5)}.${CNPJ_A.slice(5, 8)}/${CNPJ_A.slice(8, 12)}-${CNPJ_A.slice(12)}`,
      );
    });
  });

  describe('resolução pelas duas chaves', () => {
    it('6 — operação achada pelo CNPJ é atualizada (escritório renomeado)', async () => {
      await importar([linha()], true);
      const r = await importar([linha({ officeName: 'PS - RENOMEADO - 0001', city: 'Londrina' })], true);

      expect(r.rows[0].action).toBe('update');
      const op = await operacao('PS - RENOMEADO - 0001');
      expect(op).toHaveLength(1);
      expect(op[0].cnpj).toBe(CNPJ_A);
      expect(await operacao('PS - ESCRITORIO CNPJ - 0001')).toHaveLength(0);
    });

    it('7 — operação achada pelo escritório recebe o CNPJ que faltava', async () => {
      await importar([linha({ cnpj: undefined, officeName: 'PS - LEGADO - 0001' })], true);
      // A linha acima é erro (novo sem CNPJ), então criamos o legado direto:
      await db.exec(`
        insert into public.operations (unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id, active)
        values ('${ID.unit}', '${ID.coord1}', 'Legado LTDA', 'PS - LEGADO - 0001', 'Curitiba', 'PR', '${ID.uGcA}', true);
      `);
      const r = await importar([linha({ officeName: 'PS - LEGADO - 0001', cnpj: CNPJ_C })], true);

      expect(r.rows[0].action).toBe('update');
      expect((await operacao('PS - LEGADO - 0001'))[0].cnpj).toBe(CNPJ_C);
    });

    it('8 — legado sem CNPJ continua atualizável, com warning e cnpj preservado', async () => {
      await db.exec(`
        insert into public.operations (unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id, active)
        values ('${ID.unit}', '${ID.coord1}', 'Legado LTDA', 'PS - LEGADO - 0002', 'Curitiba', 'PR', '${ID.uGcA}', true);
      `);
      const r = await importar([linha({ officeName: 'PS - LEGADO - 0002', cnpj: undefined, city: 'Maringa' })], true);

      expect(r.rows[0].status).toBe('duplicate');
      expect(r.rows[0].action).toBe('update');
      expect(r.rows[0].warnings).toContain('Registro legado ainda sem CNPJ.');
      expect(r.rows[0].cnpj).toBeNull();
      expect((await operacao('PS - LEGADO - 0002'))[0].cnpj).toBeNull();
    });

    it('9 — as duas chaves apontando para a MESMA operação atualizam normalmente', async () => {
      await importar([linha()], true);
      const r = await importar([linha({ city: 'Cascavel' })], true);
      expect(r.rows[0].action).toBe('update');
      expect(r.counters.errors).toBe(0);
    });
  });

  describe('conflitos — nunca fundir, nunca mover CNPJ', () => {
    it('10 — chaves apontando para operações DIFERENTES é erro, sem escrita', async () => {
      await importar([linha({ officeName: 'PS - UM - 0001', cnpj: CNPJ_A })], true);
      await importar([linha({ officeName: 'PS - DOIS - 0002', cnpj: CNPJ_B })], true);

      // CNPJ_A pertence a "UM"; escritório "DOIS" pertence a outra operação.
      const r = await importar([linha({ officeName: 'PS - DOIS - 0002', cnpj: CNPJ_A })], true);

      expect(r.rows[0].status).toBe('error');
      expect(r.rows[0].messages.join(' ')).toMatch(/apontam para parceiros diferentes/i);
      expect((await operacao('PS - UM - 0001'))[0].cnpj).toBe(CNPJ_A);
      expect((await operacao('PS - DOIS - 0002'))[0].cnpj).toBe(CNPJ_B);
    });

    it('11 — escritório já cadastrado com OUTRO CNPJ é erro (sem sobrescrever)', async () => {
      await importar([linha({ officeName: 'PS - FIXO - 0001', cnpj: CNPJ_A })], true);
      const r = await importar([linha({ officeName: 'PS - FIXO - 0001', cnpj: CNPJ_C })], true);

      expect(r.rows[0].status).toBe('error');
      expect(r.rows[0].messages.join(' ')).toMatch(/ja esta cadastrado com outro CNPJ/i);
      expect((await operacao('PS - FIXO - 0001'))[0].cnpj).toBe(CNPJ_A);
    });

    it('12 — CNPJ repetido dentro do MESMO lote é erro na segunda linha', async () => {
      const r = await importar([
        linha({ index: 1, officeName: 'PS - LOTE A - 0001', cnpj: CNPJ_A }),
        linha({ index: 2, officeName: 'PS - LOTE B - 0002', cnpj: CNPJ_A }),
      ], true);

      expect(r.rows[0].status).toBe('ok');
      expect(r.rows[1].status).toBe('error');
      expect(r.rows[1].messages.join(' ')).toMatch(/CNPJ duplicado na planilha/i);
    });

    it('13 — erro numa linha não desfaz a linha válida (isolamento preservado)', async () => {
      const r = await importar([
        linha({ index: 1, officeName: 'PS - VALIDA - 0001', cnpj: CNPJ_A }),
        linha({ index: 2, officeName: 'PS - INVALIDA - 0002', cnpj: undefined }),
      ], true);

      expect(r.rows[0].status).toBe('ok');
      expect(r.rows[1].status).toBe('error');
      expect(await operacao('PS - VALIDA - 0001')).toHaveLength(1);
      expect(await operacao('PS - INVALIDA - 0002')).toHaveLength(0);
    });
  });

  describe('simulação e fronteira', () => {
    it('14 — simulação NÃO grava nada', async () => {
      const r = await importar([linha()], false);
      expect(r.mode).toBe('simulate');
      expect(await operacao('PS - ESCRITORIO CNPJ - 0001')).toHaveLength(0);
    });

    it('15 — simulação já reporta o erro de CNPJ ausente', async () => {
      const r = await importar([linha({ cnpj: undefined })], false);
      expect(r.rows[0].status).toBe('error');
      expect(r.counters.errors).toBe(1);
    });

    it('16 — importar parceiro não toca auth.users, users nem user_scopes', async () => {
      const antes = await contagens();
      await importar([
        linha({ index: 1, officeName: 'PS - FRONTEIRA - 0001', cnpj: CNPJ_A }),
        linha({ index: 2, officeName: 'PS - FRONTEIRA - 0002', cnpj: CNPJ_B }),
      ], true);
      expect((await contagens())[0]).toEqual(antes[0]);
    });

    it('17 — ui_admin_partners e o DTO expõem o CNPJ importado', async () => {
      await importar([linha()], true);
      const vista = await db.asUser(ID.uAdmin, (tx) => tx.query<{ cnpj: string | null }>(
        `select "cnpj" from public.ui_admin_partners where "officeName" = $1`,
        ['PS - ESCRITORIO CNPJ - 0001']));
      expect(vista[0].cnpj).toBe(CNPJ_A);
    });
  });
});
