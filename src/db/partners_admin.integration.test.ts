/**
 * Parceiros AACE — CRUD administrativo em banco REAL (migration 0009).
 *
 * Prova, sob RLS e ACL de verdade:
 *   - admin cria/edita parceiro via RPC (teste obrigatório 1);
 *   - mínimo privilégio (E1): só as 3 RPCs são executáveis por authenticated,
 *     helpers app.* negam EXECUTE, e o grant de app.normalize_text é
 *     tecnicamente indispensável (índice por expressão em DML direto);
 *   - parceiro ativo exige GC até em insert direto de admin (E5 — CHECK);
 *   - unidade/coordenação de regiões diferentes é rejeitada (E3);
 *   - operation_assignments fica em sincronia com o GC (visibilidade RLS);
 *   - índice único rejeita escritório duplicado na unidade com variação de
 *     caixa/acento/espaços (teste obrigatório 12, camada constraint).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

const R2 = {
  region: '00000000-0000-0000-0000-00000000b902',
  coord: '00000000-0000-0000-0000-00000000d902',
};

describe('Parceiros AACE — RPCs administrativas (banco real)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    // Segunda região (mesma org) com coordenadoria própria — cenário E3.
    await db.exec(`
      insert into public.regions (id, organization_id, name) values
        ('${R2.region}','${ID.org}','Regiao Dois Fic');
      insert into public.coordinations (id, region_id, name) values
        ('${R2.coord}','${R2.region}','Coord R2 Fic');
    `);
  }, 30_000);
  afterAll(async () => { await db.close(); });

  // ---- Teste obrigatório 1: admin cria e edita Parceiro AACE ----
  it('Admin cria parceiro via RPC com GC vinculado e assignment sincronizado', async () => {
    const dto = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: any }>(
        `select public.admin_create_operation($1::jsonb) as dto`,
        [JSON.stringify({
          partnerName: '  Empresa   Sintetica LTDA  ',
          officeName: 'PS - ESCRITORIO SINTETICO - 0001',
          city: 'Curitiba',
          state: 'pr',
          unitName: 'Unidade Fictícia',
          coordinationName: 'Coord 1',
          managerEmail: 'GCA@fic.example',
        })]);
      return rows[0].dto;
    });
    expect(dto.partnerName).toBe('Empresa Sintetica LTDA'); // trim + colapso
    expect(dto.state).toBe('PR');
    expect(dto.managerId).toBe(ID.uGcA); // e-mail resolvido em lowercase
    expect(dto.active).toBe(true);
    expect(dto.managerMissing).toBe(false);
    expect(dto.warnings).toEqual([]);

    const assign = await db.query<{ user_id: string; active: boolean }>(
      `select user_id, active from public.operation_assignments where operation_id = '${dto.id}'`);
    expect(assign).toEqual([{ user_id: ID.uGcA, active: true }]);
  });

  it('Admin edita parceiro: cidade, troca de GC (re-sync) e inativação sem delete', async () => {
    const created = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: any }>(
        `select public.admin_create_operation($1::jsonb) as dto`,
        [JSON.stringify({
          partnerName: 'Empresa Edicao LTDA',
          officeName: 'PS - ESCRITORIO SINTETICO - 0002',
          city: 'Londrina',
          state: 'PR',
          unitName: 'Unidade Fictícia',
          coordinationName: 'Coord 1',
          managerEmail: 'gca@fic.example',
        })]);
      return rows[0].dto;
    });

    const updated = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: any }>(
        `select public.admin_update_operation($1::uuid, $2::jsonb) as dto`,
        [created.id, JSON.stringify({ city: 'Maringá', managerEmail: 'gcb@fic.example' })]);
      return rows[0].dto;
    });
    expect(updated.city).toBe('Maringá');
    expect(updated.managerId).toBe(ID.uGcB);

    // Assignment antigo desativado com valid_to; novo ativo (RLS do GC depende disto).
    const assigns = await db.query<{ user_id: string; active: boolean; has_end: boolean }>(
      `select user_id, active, (valid_to is not null) as has_end
         from public.operation_assignments where operation_id = '${created.id}' order by user_id`);
    expect(assigns).toEqual([
      { user_id: ID.uGcA, active: false, has_end: true },
      { user_id: ID.uGcB, active: true, has_end: false },
    ]);

    // GC B passa a ver o parceiro; GC A deixa de ver.
    const visB = await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select id from public.operations where id='${created.id}'`));
    expect(visB).toHaveLength(1);
    const visA = await db.asUser(ID.uGcA, (tx) =>
      tx.query(`select id from public.operations where id='${created.id}'`));
    expect(visA).toEqual([]);

    // Inativação: active=false, sem exclusão física.
    const inactivated = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: any }>(
        `select public.admin_update_operation($1::uuid, $2::jsonb) as dto`,
        [created.id, JSON.stringify({ active: false })]);
      return rows[0].dto;
    });
    expect(inactivated.active).toBe(false);
    const still = await db.query(`select id from public.operations where id='${created.id}'`);
    expect(still).toHaveLength(1);
  });

  // ---- E5: parceiro ativo exige GC ----
  it('Criar sem GC salva como INATIVO com aviso; ativar sem GC é rejeitado', async () => {
    const dto = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: any }>(
        `select public.admin_create_operation($1::jsonb) as dto`,
        [JSON.stringify({
          partnerName: 'Empresa Sem GC LTDA',
          officeName: 'PS - ESCRITORIO SINTETICO - 0003',
          city: 'Cascavel',
          state: 'PR',
          unitName: 'Unidade Fictícia',
          coordinationName: 'Coord 1',
        })]);
      return rows[0].dto;
    });
    expect(dto.active).toBe(false);
    expect(dto.managerMissing).toBe(true);
    expect(dto.warnings).toEqual(['Sem GC vinculado: parceiro salvo como inativo']);

    const e = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(
        `select public.admin_update_operation('${dto.id}'::uuid, '{"active": true}'::jsonb)`));
    expect(String(e.message)).toMatch(/parceiro ativo exige GC/i);
  });

  it('Nem insert direto de ADMIN cria parceiro ativo sem GC (CHECK no banco)', async () => {
    const e = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(
        `insert into public.operations (unit_id, coordination_id, partner_name, office_name, city, state, active)
         values ('${ID.unit}','${ID.coord1}','X','PS - CHECK - 0001','Curitiba','PR',true)`));
    expect(String(e.message)).toMatch(/operations_active_requires_gc|check/i);
  });

  // ---- E1: mínimo privilégio comprovado em banco ----
  it('Não-admin e anônimo NÃO executam as RPCs', async () => {
    for (const call of [
      `select public.admin_create_operation('{}'::jsonb)`,
      `select public.admin_update_operation('${ID.opA}'::uuid, '{}'::jsonb)`,
      `select public.admin_import_partners('[]'::jsonb, false)`,
    ]) {
      const asGc = await db.asUser(ID.uGcA, (tx) => tx.expectError(call));
      expect(String(asGc.message)).toMatch(/apenas administrador|insufficient_privilege/i);
      const asAnon = await db.asAnon((tx) => tx.expectError(call));
      expect(String(asAnon.message)).toMatch(/permission denied/i);
    }
  });

  it('Helpers internos app.* negam EXECUTE até para admin autenticado', async () => {
    const dtoErr = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select app.partner_dto('${ID.opA}'::uuid)`));
    expect(String(dtoErr.message)).toMatch(/permission denied for function partner_dto/i);

    const syncErr = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select app.sync_operation_assignment('${ID.opA}'::uuid, null)`));
    expect(String(syncErr.message)).toMatch(/permission denied for function sync_operation_assignment/i);

    const resolveErr = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(
        `select * from app.resolve_scoped_user('x@y.z','channel_manager'::app.role_code,'GC',null,null,null)`));
    expect(String(resolveErr.message)).toMatch(/permission denied for function resolve_scoped_user/i);
  });

  it('Grant de app.normalize_text é indispensável: DML direto de admin funciona', async () => {
    // O índice único por expressão avalia app.normalize_text com os privilégios
    // do caller. Sem o grant, este insert falharia com "permission denied for
    // function normalize_text" — provado durante o desenvolvimento da 0009.
    const rows = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.operations (unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id, active)
         values ('${ID.unit}','${ID.coord1}','Direto Ltda','PS - DML DIRETO - 0001','Curitiba','PR','${ID.uGcA}',true)
         returning id`));
    expect(rows).toHaveLength(1);
  });

  // ---- RLS da nova superfície ----
  it('ui_admin_partners herda a RLS: GC A vê apenas os próprios parceiros', async () => {
    const rows = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ id: string }>(`select "id" from public.ui_admin_partners order by "id"`));
    const idsA = rows.map((r) => r.id);
    expect(idsA).toContain(ID.opA);
    expect(idsA).not.toContain(ID.opB);
  });

  it('Escrita direta em operations por não-admin continua bloqueada (policy intocada)', async () => {
    // UPDATE: a policy admin-only filtra o USING — atinge 0 linhas (sem erro,
    // mas nada muda). INSERT: viola o WITH CHECK e lança.
    await db.asUser(ID.uGcA, (tx) =>
      tx.query(`update public.operations set city = 'Hack' where id = '${ID.opA}'`));
    const kept = await db.query<{ city: string }>(
      `select city from public.operations where id = '${ID.opA}'`);
    expect(kept[0].city).toBe('Curitiba');

    const e = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(
        `insert into public.operations (unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id, active)
         values ('${ID.unit}','${ID.coord1}','Hack Ltda','PS - HACK - 0001','Curitiba','PR','${ID.uGcA}',true)`));
    expect(String(e.message)).toMatch(/row-level security|policy|permission/i);
  });

  // ---- Teste obrigatório 12 (camada constraint) ----
  it('Escritório duplicado na mesma unidade é rejeitado mesmo variando caixa/acento/espaços', async () => {
    for (const office of ['loja a', 'LOJA  A', 'Lója A', ' Loja   A ']) {
      const e = await db.asUser(ID.uAdmin, (tx) =>
        tx.expectError(
          `insert into public.operations (unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id, active)
           values ('${ID.unit}','${ID.coord1}','Dup Ltda','${office}','Curitiba','PR','${ID.uGcA}',true)`));
      expect(String(e.message)).toMatch(/duplicate key|operations_unit_office_norm_uidx/i);
    }
  });

  it('RPC de criação também rejeita escritório duplicado com mensagem clara', async () => {
    const e = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(
        `select public.admin_create_operation('${JSON.stringify({
          partnerName: 'Dup Ltda',
          officeName: 'LOJA  Á',
          city: 'Curitiba',
          state: 'PR',
          unitName: 'Unidade Fictícia',
          coordinationName: 'Coord 1',
          managerEmail: 'gca@fic.example',
        }).replace(/'/g, "''")}'::jsonb)`));
    expect(String(e.message)).toMatch(/escritorio ja cadastrado nesta unidade/i);
  });

  // ---- E3: consistência hierárquica ----
  it('Unidade e coordenação de regiões diferentes são rejeitadas (criação e edição)', async () => {
    const eCreate = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(
        `select public.admin_create_operation('${JSON.stringify({
          partnerName: 'Cross Ltda',
          officeName: 'PS - CROSS - 0001',
          city: 'Curitiba',
          state: 'PR',
          unitName: 'Unidade Fictícia',
          coordinationId: R2.coord,
          managerEmail: 'gca@fic.example',
        })}'::jsonb)`));
    expect(String(eCreate.message)).toMatch(/regioes diferentes/i);

    const eUpdate = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(
        `select public.admin_update_operation('${ID.opA}'::uuid, '${JSON.stringify({
          coordinationId: R2.coord,
        })}'::jsonb)`));
    expect(String(eUpdate.message)).toMatch(/regioes diferentes/i);
  });

  // ---- E2: validação de papel/escopo no cadastro manual ----
  it('GC com papel errado ou inexistente é rejeitado nominalmente no cadastro', async () => {
    const eWrongRole = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(
        `select public.admin_create_operation('${JSON.stringify({
          partnerName: 'Papel Errado Ltda',
          officeName: 'PS - PAPEL - 0001',
          city: 'Curitiba',
          state: 'PR',
          unitName: 'Unidade Fictícia',
          coordinationName: 'Coord 1',
          managerEmail: 'coord1@fic.example', // coordenador, não GC
        })}'::jsonb)`));
    expect(String(eWrongRole.message)).toMatch(/nao tem papel de GC ativo: coord1@fic\.example/i);

    const eUnknown = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(
        `select public.admin_create_operation('${JSON.stringify({
          partnerName: 'Desconhecido Ltda',
          officeName: 'PS - DESC - 0001',
          city: 'Curitiba',
          state: 'PR',
          unitName: 'Unidade Fictícia',
          coordinationName: 'Coord 1',
          managerEmail: 'naoexiste@fic.example',
        })}'::jsonb)`));
    expect(String(eUnknown.message)).toMatch(/GC nao encontrado: naoexiste@fic\.example/i);
  });
});
