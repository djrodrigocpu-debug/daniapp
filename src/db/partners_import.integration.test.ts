/**
 * Importador de Parceiros AACE — admin_import_partners em banco REAL (0009).
 *
 * Payload 100% SINTÉTICO espelhando a topologia da planilha real (14 registros,
 * 4 empresas, 3 coordenações, 3 coordenadores, 9 GCs, espaço final em um
 * partner_name, e-mail com maiúsculas, escritório com acentos) — NENHUM dado
 * real de produção neste repositório (§23).
 *
 * Cobre os testes obrigatórios 9, 10, 11, 12, 13, 14 e 15, além das emendas:
 * E2 (papel/escopo/ativo), E4 (conflito de coordenador = erro), E6 (auto-criação
 * idempotente), E8 (limite de lote + isolamento por linha).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

const ORG = 'ORG SINTETICA';
const REGION = 'REGIAO SINTETICA';
const UNIT = 'UNIDADE SINTETICA';
const COORDINATIONS = ['COORD NORTE', 'COORD SUL', 'COORD OESTE'] as const;
const COORD_EMAILS = ['coordn@sint.example', 'coords@sint.example', 'coordo@sint.example'] as const;
const GC_EMAILS = [
  'gc1@sint.example', 'gc2@sint.example', 'gc3@sint.example', 'gc4@sint.example',
  'gc5.maiusculo@sint.example', 'gc6@sint.example', 'gc7@sint.example',
  'gc8@sint.example', 'gc9@sint.example',
] as const;

interface ImportRowJson {
  index: number;
  organizationName: string;
  regionName: string;
  unitName: string;
  coordinationName: string;
  partnerName: string;
  officeName: string;
  city: string;
  state: string;
  coordinatorEmail: string;
  managerEmail: string;
}

/** 14 linhas: coordenação NORTE (1-4), SUL (5-8), OESTE (9-14). */
function buildRows(): ImportRowJson[] {
  const partners = [
    'ALFA SINTETICA LTDA', 'ALFA SINTETICA LTDA', 'ALFA SINTETICA LTDA',
    'BETA SINTETICA LTDA ', // espaço final proposital (como na planilha real)
    'BETA SINTETICA LTDA ', 'BETA SINTETICA LTDA ',
    'GAMA SINTETICA LTDA', 'GAMA SINTETICA LTDA',
    'ALFA SINTETICA LTDA', 'ALFA SINTETICA LTDA',
    'BETA SINTETICA LTDA ', 'BETA SINTETICA LTDA ', 'BETA SINTETICA LTDA ',
    'DELTA SINTETICA LTDA',
  ];
  return partners.map((partnerName, i) => {
    const n = i + 1;
    const group = n <= 4 ? 0 : n <= 8 ? 1 : 2;
    return {
      index: n,
      organizationName: ORG,
      regionName: REGION,
      unitName: UNIT,
      coordinationName: COORDINATIONS[group],
      partnerName,
      officeName: n === 7
        ? 'PS - ALIANÇA SINTÉTICA - 0007'
        : `PS - ESCRITORIO SINT - ${String(n).padStart(4, '0')}`,
      city: n % 2 === 0 ? 'Curitiba' : 'Joinville',
      state: n <= 10 ? 'PR' : 'SC',
      // Maiúsculas propositalmente (normalização obrigatória — teste 11).
      coordinatorEmail: n === 1 ? 'CoordN@Sint.Example' : COORD_EMAILS[group],
      managerEmail: n === 5 ? 'GC5.Maiusculo@Sint.Example' : GC_EMAILS[(n - 1) % 9],
    };
  });
}

describe('Importador de Parceiros AACE (banco real)', () => {
  let db: TestDb;
  let gcIds: Record<string, string> = {};
  let coordIds: Record<string, string> = {};

  const runImport = (rows: unknown[], commit: boolean) =>
    db.asUser(ID.uAdmin, async (tx) => {
      const r = await tx.query<{ report: any }>(
        `select public.admin_import_partners($1::jsonb, $2::boolean) as report`,
        [JSON.stringify(rows), commit]);
      return r[0].report;
    });

  const counts = async () => {
    const [row] = await db.query<{ ops: number; orgs: number; regs: number; units: number; coords: number }>(`
      select (select count(*)::int from public.operations) ops,
             (select count(*)::int from public.organizations) orgs,
             (select count(*)::int from public.regions) regs,
             (select count(*)::int from public.units) units,
             (select count(*)::int from public.coordinations) coords`);
    return row;
  };

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);

    // Pessoas sintéticas: 3 coordenadores + 9 GCs ativos com papel correto,
    // 1 GC "invited" (não-ativo) e 1 coordenador avulso para o cenário E4.
    const people: Array<{ id: string; email: string; role: string; status: string }> = [];
    COORD_EMAILS.forEach((email, i) => people.push({
      id: `00000000-0000-0000-0000-0000000021${String(i).padStart(2, '0')}`,
      email, role: 'coordinator', status: 'active',
    }));
    GC_EMAILS.forEach((email, i) => people.push({
      id: `00000000-0000-0000-0000-0000000022${String(i).padStart(2, '0')}`,
      email, role: 'channel_manager', status: 'active',
    }));
    people.push({ id: '00000000-0000-0000-0000-000000002300', email: 'gcx@sint.example', role: 'channel_manager', status: 'invited' });
    people.push({ id: '00000000-0000-0000-0000-000000002301', email: 'coordx@sint.example', role: 'coordinator', status: 'active' });

    for (const p of people) {
      await db.exec(`
        insert into auth.users (id, email) values ('${p.id}','${p.email}');
        insert into public.users (id, display_name, corporate_email, status)
          values ('${p.id}','Sintetico ${p.email}','${p.email}','${p.status}');
        insert into public.user_scopes (user_id, role) values ('${p.id}','${p.role}');
      `);
      if (p.role === 'channel_manager') gcIds[p.email] = p.id;
      else coordIds[p.email] = p.id;
    }
  }, 30_000);
  afterAll(async () => { await db.close(); });

  // ---- Testes obrigatórios 9 e 14: 14 registros reconhecidos, simulação não grava ----
  it('Simulação reconhece os 14 registros, lista estruturas a criar e NÃO grava nada', async () => {
    const before = await counts();
    const report = await runImport(buildRows(), false);

    expect(report.mode).toBe('simulate');
    expect(report.counters.total).toBe(14);
    expect(report.counters.inserted).toBe(14);
    expect(report.counters.errors).toBe(0);
    expect(report.counters.createdEntities).toBe(6); // 1 org + 1 região + 1 unidade + 3 coordenações
    expect(report.toCreate.organizations).toEqual([ORG]);
    expect(report.toCreate.regions).toEqual([REGION]);
    expect(report.toCreate.units).toEqual([UNIT]);
    expect([...report.toCreate.coordinations].sort()).toEqual([...COORDINATIONS].sort());
    expect(report.rows).toHaveLength(14);
    expect(report.rows.every((r: any) => r.status === 'ok' && r.action === 'insert')).toBe(true);

    expect(await counts()).toEqual(before); // simulação: zero escrita
  });

  // ---- Teste obrigatório 11 + commit ----
  it('Confirmação grava os 14 com normalizações: trim, e-mail lowercase, acentos preservados', async () => {
    const before = await counts();
    const report = await runImport(buildRows(), true);

    expect(report.mode).toBe('commit');
    expect(report.counters.inserted).toBe(14);
    expect(report.counters.errors).toBe(0);
    expect(report.counters.createdEntities).toBe(6);

    const after = await counts();
    expect(after.ops).toBe(before.ops + 14);
    expect(after.orgs).toBe(before.orgs + 1);
    expect(after.regs).toBe(before.regs + 1);
    expect(after.units).toBe(before.units + 1);
    expect(after.coords).toBe(before.coords + 3);

    // Espaço final removido do partner_name (nenhum termina em espaço).
    const trailing = await db.query<{ n: number }>(
      `select count(*)::int n from public.operations where partner_name like '% '`);
    expect(trailing[0].n).toBe(0);
    const beta = await db.query<{ n: number }>(
      `select count(*)::int n from public.operations where partner_name = 'BETA SINTETICA LTDA'`);
    expect(beta[0].n).toBe(6);

    // Acentos preservados no nome exibido do escritório.
    const accented = await db.query<{ id: string }>(
      `select id from public.operations where office_name = 'PS - ALIANÇA SINTÉTICA - 0007'`);
    expect(accented).toHaveLength(1);

    // E-mail em maiúsculas resolvido (teste 11): GC da linha 5 é gc5.maiusculo.
    const op5 = await db.query<{ channel_manager_user_id: string }>(
      `select channel_manager_user_id from public.operations where office_name = 'PS - ESCRITORIO SINT - 0005'`);
    expect(op5[0].channel_manager_user_id).toBe(gcIds['gc5.maiusculo@sint.example']);

    // Assignment sincronizado (visibilidade RLS do GC).
    const assign = await db.query<{ active: boolean }>(
      `select a.active from public.operation_assignments a
        join public.operations o on o.id = a.operation_id
       where o.office_name = 'PS - ESCRITORIO SINT - 0005'
         and a.user_id = '${gcIds['gc5.maiusculo@sint.example']}'`);
    expect(assign).toEqual([{ active: true }]);

    // Coordenação criada com coordenador vinculado (resolvido por e-mail).
    const coordN = await db.query<{ coordinator_user_id: string }>(
      `select coordinator_user_id from public.coordinations where name = 'COORD NORTE'`);
    expect(coordN[0].coordinator_user_id).toBe(coordIds['coordn@sint.example']);

    // Parceiros importados nascem ativos e com GC (CHECK satisfeito por construção).
    const inactive = await db.query<{ n: number }>(
      `select count(*)::int n from public.operations o
        join public.units u on u.id = o.unit_id
       where u.name = '${UNIT}' and (not o.active or o.channel_manager_user_id is null)`);
    expect(inactive[0].n).toBe(0);
  });

  // ---- Teste obrigatório 10: reimportação não duplica ----
  it('Reimportação é idempotente: tudo vira duplicate/update, nada é criado', async () => {
    const before = await counts();
    const report = await runImport(buildRows(), true);

    expect(report.counters.inserted).toBe(0);
    expect(report.counters.updated).toBe(14);
    expect(report.counters.errors).toBe(0);
    expect(report.counters.createdEntities).toBe(0);
    expect(report.rows.every((r: any) => r.status === 'duplicate' && r.action === 'update')).toBe(true);
    expect(await counts()).toEqual(before);
  });

  it('Variação de caixa/acento/espaços no escritório ainda casa como duplicate', async () => {
    const rows = buildRows().slice(6, 7); // linha 7: PS - ALIANÇA SINTÉTICA - 0007
    rows[0] = { ...rows[0], officeName: '  ps - alianca  sintetica - 0007 ' };
    const before = await counts();
    const report = await runImport(rows, true);
    expect(report.rows[0].status).toBe('duplicate');
    expect(report.counters.updated).toBe(1);
    expect(await counts()).toEqual(before);
  });

  // ---- Teste obrigatório 12: duplicidade dentro do próprio lote ----
  it('Escritório duplicado no mesmo lote: segunda linha vira erro e só uma grava', async () => {
    const base = buildRows()[0];
    const rows = [
      { ...base, index: 1, officeName: 'PS - LOTE DUP - 0001' },
      { ...base, index: 2, officeName: 'ps - lote  dup - 0001' }, // mesmo escritório normalizado
    ];
    const before = await counts();
    const report = await runImport(rows, true);

    expect(report.rows[0].status).toBe('ok');
    expect(report.rows[1].status).toBe('error');
    expect(JSON.stringify(report.rows[1].messages)).toMatch(/Escritorio duplicado na planilha/);
    expect(report.counters.inserted).toBe(1);
    expect(report.counters.errors).toBe(1);
    expect((await counts()).ops).toBe(before.ops + 1);
  });

  // ---- Teste obrigatório 13 ----
  it('partner_name repetido com office_name diferente é permitido', async () => {
    const base = buildRows()[0];
    const rows = [
      { ...base, index: 1, partnerName: 'REPETIDO LTDA', officeName: 'PS - REPETIDO - 0001' },
      { ...base, index: 2, partnerName: 'REPETIDO LTDA', officeName: 'PS - REPETIDO - 0002' },
    ];
    const report = await runImport(rows, true);
    expect(report.counters.inserted).toBe(2);
    expect(report.counters.errors).toBe(0);
  });

  // ---- Teste obrigatório 15 + E8 (isolamento por linha) ----
  it('GC/coordenador não encontrados: erro nominal por linha, válidas seguem', async () => {
    const base = buildRows()[0];
    const rows = [
      { ...base, index: 1, officeName: 'PS - VALIDA - 0001' },
      { ...base, index: 2, officeName: 'PS - SEM GC - 0001', managerEmail: 'naoexiste@sint.example' },
      { ...base, index: 3, officeName: 'PS - SEM COORD - 0001', coordinatorEmail: 'tambemnao@sint.example' },
    ];
    const before = await counts();
    const report = await runImport(rows, true);

    expect(report.rows[0].status).toBe('ok');
    expect(report.rows[1].status).toBe('error');
    expect(JSON.stringify(report.rows[1].messages)).toMatch(/GC nao encontrado: naoexiste@sint\.example/);
    expect(report.rows[2].status).toBe('error');
    expect(JSON.stringify(report.rows[2].messages)).toMatch(/Coordenador nao encontrado: tambemnao@sint\.example/);
    expect(report.counters.inserted).toBe(1);
    expect(report.counters.errors).toBe(2);
    expect((await counts()).ops).toBe(before.ops + 1);
  });

  // ---- E2: papel errado e usuário não-ativo ----
  it('Papel errado ou usuário não-ativo geram erro nominal (E2)', async () => {
    const base = buildRows()[0];
    const rows = [
      { ...base, index: 1, officeName: 'PS - PAPEL ERRADO - 0001', managerEmail: 'coordn@sint.example' },
      { ...base, index: 2, officeName: 'PS - INATIVO - 0001', managerEmail: 'gcx@sint.example' },
    ];
    const report = await runImport(rows, true);
    expect(report.rows[0].status).toBe('error');
    expect(JSON.stringify(report.rows[0].messages)).toMatch(/nao tem papel de GC ativo: coordn@sint\.example/);
    expect(report.rows[1].status).toBe('error');
    expect(JSON.stringify(report.rows[1].messages)).toMatch(/GC nao esta ativo: gcx@sint\.example/);
    expect(report.counters.errors).toBe(2);
  });

  // ---- E4: conflito de coordenador é ERRO e não altera o existente ----
  it('Coordenação com coordenador divergente: linha não importa e nada muda (E4)', async () => {
    const rows = [{
      index: 1,
      organizationName: 'Org Fictícia',
      regionName: 'Região Fictícia',
      unitName: 'Unidade Fictícia',
      coordinationName: 'Coord 1', // coordenador atual: uCoord1
      partnerName: 'CONFLITO LTDA',
      officeName: 'PS - CONFLITO - 0001',
      city: 'Curitiba',
      state: 'PR',
      coordinatorEmail: 'coordx@sint.example', // divergente do atual
      managerEmail: 'gca@fic.example',
    }];
    const before = await counts();
    const report = await runImport(rows, true);

    expect(report.rows[0].status).toBe('error');
    expect(JSON.stringify(report.rows[0].messages))
      .toMatch(/Coordenacao Coord 1 ja possui coordenador diferente de coordx@sint\.example/);
    expect(report.counters.errors).toBe(1);
    expect(await counts()).toEqual(before);

    const keeper = await db.query<{ coordinator_user_id: string }>(
      `select coordinator_user_id from public.coordinations where id = '${ID.coord1}'`);
    expect(keeper[0].coordinator_user_id).toBe(ID.uCoord1); // intocado
  });

  // ---- E8: limite de lote ----
  it('Lote acima de 200 linhas é rejeitado globalmente antes de processar', async () => {
    const base = buildRows()[0];
    const rows = Array.from({ length: 201 }, (_, i) => ({
      ...base, index: i + 1, officeName: `PS - LIMITE - ${String(i + 1).padStart(4, '0')}`,
    }));
    const e = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(
        `select public.admin_import_partners($1::jsonb, false)`,
        [JSON.stringify(rows)]));
    expect(String(e.message)).toMatch(/lote excede o limite de 200 linhas/i);
  });

  // ---- Autorização ----
  it('Não-admin e anônimo não importam', async () => {
    const asCoord = await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`select public.admin_import_partners('[]'::jsonb, true)`));
    expect(String(asCoord.message)).toMatch(/apenas administrador|insufficient_privilege/i);

    const asAnon = await db.asAnon((tx) =>
      tx.expectError(`select public.admin_import_partners('[]'::jsonb, true)`));
    expect(String(asAnon.message)).toMatch(/permission denied/i);
  });
});
