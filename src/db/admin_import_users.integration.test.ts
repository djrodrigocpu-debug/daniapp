/**
 * public.admin_import_users (migration 0010) contra Postgres REAL (PGlite),
 * com as migrations 0001..0010 aplicadas e RLS ativa.
 *
 * Prova o corretivo dos bloqueios P0-A/B/D:
 *   - área de atuação resolvida contra regions OU coordinations, por papel;
 *   - region_id e coordination_id gravados como CHAVES, não texto;
 *   - lote validado por inteiro: erro ⇒ NADA é gravado;
 *   - usuário novo sem identidade Auth vira `pendingAuth`, nunca perfil órfão;
 *   - ativação só por confirmação de e-mail no Auth (P0-C fica na Edge Function).
 *
 * Dados 100% FICTÍCIOS (§23). A identidade Auth é inserida pelo teste como o
 * Edge Function faria — nenhuma fixture cria usuário já ativo com escopo pronto.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

const REGION2 = '00000000-0000-0000-0000-00000000b002';
const COORD3 = '00000000-0000-0000-0000-00000000d003';

/** ids de identidade Auth criados pelo "convite" (fase 2 do onboarding). */
const AUTH = {
  novoAdmin: '00000000-0000-0000-0000-0000000020a1',
  novoReg: '00000000-0000-0000-0000-0000000020a2',
  novoCoord: '00000000-0000-0000-0000-0000000020a3',
  novoGc: '00000000-0000-0000-0000-0000000020a4',
  outro: '00000000-0000-0000-0000-0000000020a5',
} as const;

type Report = {
  mode: string;
  applied: boolean;
  counters: { total: number; inserted: number; updated: number; errors: number; pendingAuth: number };
  pendingAuth: string[];
  rows: Array<{ index: number; email: string; status: string; action: string; messages: string[] }>;
};

interface Row {
  index: number; name: string; email: string; role: string; region: string; authUserId?: string;
}

describe('admin_import_users — onboarding transacional (0010)', () => {
  let db: TestDb;

  const importAs = (userId: string, rows: Row[], commit: boolean) =>
    db.asUser(userId, (tx) =>
      tx.query<{ r: Report }>(`select public.admin_import_users($1::jsonb, $2) as r`,
        [JSON.stringify(rows), commit])).then((res) => res[0].r);

  /** Simula a fase 2 (Edge Function): cria a identidade Auth, sem confirmar. */
  const criarIdentidade = (id: string, email: string) =>
    db.exec(`insert into auth.users (id, email) values ('${id}','${email}')
             on conflict (id) do nothing;`);

  const confirmarEmail = (id: string) =>
    db.exec(`update auth.users set email_confirmed_at = now() where id = '${id}';`);

  /**
   * Importa um Parceiro AACE usando o e-mail informado como GC. É o caminho
   * REAL que consome app.resolve_scoped_user — prova o estado do usuário sem
   * chamar a função interna (que, corretamente, não é exposta a authenticated).
   */
  const importarParceiroCom = (managerEmail: string) =>
    db.asUser(ID.uAdmin, (tx) => tx.query<{ r: Report }>(
      `select public.admin_import_partners($1::jsonb, true) as r`,
      [JSON.stringify([{
        index: 1,
        organizationName: 'Org Fictícia',
        regionName: 'Região Fictícia',
        unitName: 'Unidade Fictícia',
        coordinationName: 'Coord 1',
        partnerName: 'Parceiro Novo Fic',
        officeName: 'Loja Nova Fic',
        city: 'Curitiba',
        state: 'PR',
        coordinatorEmail: 'coord1@fic.example',
        managerEmail,
      }])])).then((r) => r[0].r);

  const perfil = (email: string) => db.asUser(ID.uAdmin, (tx) => tx.query<{
    id: string; status: string; name: string; role: string | null;
    regionId: string | null; coordinationId: string | null;
  }>(`select u.id, u.status, u.display_name as name,
             v."role", v."regionId", v."coordinationId"
        from public.users u join public.ui_users v on v."id" = u.id
       where lower(u.corporate_email) = lower($1)`, [email])).then((r) => r[0]);

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => { await db.close(); });

  beforeEach(async () => {
    await db.reset();
    await seedScenario(db);
    // Segunda região com coordenação própria: prova que a coordenação carrega a
    // SUA região, sem chance de casar com a região errada.
    await db.exec(`
      insert into public.regions (id, organization_id, name) values ('${REGION2}','${ID.org}','Regiao Dois Fic');
      insert into public.coordinations (id, region_id, name) values ('${COORD3}','${REGION2}','Coord Tres Fic');
    `);
  });

  // ---- 1..5: lote válido cobrindo os quatro papéis ------------------------
  it('1/2/3/4/5 — lote válido grava admin, regional, coordenador e GC com escopo correto', async () => {
    await criarIdentidade(AUTH.novoAdmin, 'novo.admin@fic.example');
    await criarIdentidade(AUTH.novoReg, 'novo.reg@fic.example');
    await criarIdentidade(AUTH.novoCoord, 'novo.coord@fic.example');
    await criarIdentidade(AUTH.novoGc, 'novo.gc@fic.example');

    const rows: Row[] = [
      { index: 1, name: 'Novo Admin Fic', email: 'novo.admin@fic.example', role: 'admin', region: 'Unidade Fictícia', authUserId: AUTH.novoAdmin },
      { index: 2, name: 'Novo Reg Fic', email: 'novo.reg@fic.example', role: 'regional', region: 'Região Fictícia', authUserId: AUTH.novoReg },
      { index: 3, name: 'Novo Coord Fic', email: 'novo.coord@fic.example', role: 'coordinator', region: 'Coord Tres Fic', authUserId: AUTH.novoCoord },
      { index: 4, name: 'Novo Gc Fic', email: 'novo.gc@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.novoGc },
    ];

    const report = await importAs(ID.uAdmin, rows, true);
    expect(report.applied).toBe(true);
    expect(report.counters).toMatchObject({ total: 4, inserted: 4, updated: 0, errors: 0, pendingAuth: 0 });

    // 2 — Administrador: sem região e sem coordenação (papel global).
    const admin = await perfil('novo.admin@fic.example');
    expect(admin.role).toBe('admin');
    expect(admin.regionId).toBeNull();
    expect(admin.coordinationId).toBeNull();

    // 3 — Gerência Regional: region_id preenchido, coordenação nula.
    const regional = await perfil('novo.reg@fic.example');
    expect(regional.role).toBe('regional');
    expect(regional.regionId).toBe(ID.region);
    expect(regional.coordinationId).toBeNull();

    // 4 — Coordenador: coordination_id preenchido.
    const coord = await perfil('novo.coord@fic.example');
    expect(coord.role).toBe('coordinator');
    expect(coord.coordinationId).toBe(COORD3);

    // 5 — GC: coordination_id preenchido (acesso à operação vem do assignment).
    const gc = await perfil('novo.gc@fic.example');
    expect(gc.role).toBe('channel_manager');
    expect(gc.coordinationId).toBe(ID.coord1);
  });

  // ---- 6/7: área inexistente ---------------------------------------------
  it('6 — região inexistente para Gerência Regional é erro nominal, sem gravar', async () => {
    await criarIdentidade(AUTH.novoReg, 'novo.reg@fic.example');
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Novo Reg Fic', email: 'novo.reg@fic.example', role: 'regional', region: 'Regiao Que Nao Existe', authUserId: AUTH.novoReg },
    ], true);

    expect(report.applied).toBe(false);
    expect(report.counters.errors).toBe(1);
    expect(report.rows[0].messages.join(' ')).toMatch(/Regiao inexistente: Regiao Que Nao Existe/);
    expect(await perfil('novo.reg@fic.example')).toBeUndefined();
  });

  it('7 — coordenação inexistente para GC é erro nominal, sem gravar', async () => {
    await criarIdentidade(AUTH.novoGc, 'novo.gc@fic.example');
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Novo Gc Fic', email: 'novo.gc@fic.example', role: 'channel_manager', region: 'Coord Inexistente', authUserId: AUTH.novoGc },
    ], true);

    expect(report.applied).toBe(false);
    expect(report.rows[0].messages.join(' ')).toMatch(/Coordenacao inexistente: Coord Inexistente/);
    expect(await perfil('novo.gc@fic.example')).toBeUndefined();
  });

  // ---- 8: coordenação leva a SUA região, não outra -----------------------
  it('8 — a coordenação define a região do escopo; não é possível casar com a região errada', async () => {
    await criarIdentidade(AUTH.novoCoord, 'novo.coord@fic.example');
    // "Coord Tres Fic" pertence à REGION2, não à região do restante do cenário.
    await importAs(ID.uAdmin, [
      { index: 1, name: 'Novo Coord Fic', email: 'novo.coord@fic.example', role: 'coordinator', region: 'Coord Tres Fic', authUserId: AUTH.novoCoord },
    ], true);

    const scope = await db.asUser(ID.uAdmin, (tx) => tx.query<{ region_id: string; coordination_id: string }>(
      `select s.region_id, s.coordination_id from public.user_scopes s
        where s.user_id = $1 and s.active`, [AUTH.novoCoord]));
    expect(scope[0].coordination_id).toBe(COORD3);
    expect(scope[0].region_id).toBe(REGION2);      // região DA coordenação
    expect(scope[0].region_id).not.toBe(ID.region); // nunca a região do lote anterior
  });

  // ---- 9/10: colisões de e-mail ------------------------------------------
  it('9 — e-mail repetido no lote é erro determinístico e derruba o lote inteiro', async () => {
    await criarIdentidade(AUTH.novoGc, 'novo.gc@fic.example');
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Um Fic', email: 'novo.gc@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.novoGc },
      { index: 2, name: 'Dois Fic', email: 'NOVO.GC@fic.example', role: 'channel_manager', region: 'Coord 2', authUserId: AUTH.novoGc },
    ], true);

    expect(report.applied).toBe(false);
    expect(report.rows[1].messages.join(' ')).toMatch(/E-mail repetido no lote.*ja usado no registro 1/);
    expect(await perfil('novo.gc@fic.example')).toBeUndefined();
  });

  it('10 — e-mail já existente vira UPDATE, sem exigir nova identidade Auth', async () => {
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Coord Um Renomeado', email: 'coord1@fic.example', role: 'coordinator', region: 'Coord 1' },
    ], true);

    expect(report.applied).toBe(true);
    expect(report.counters).toMatchObject({ inserted: 0, updated: 1, errors: 0, pendingAuth: 0 });
    expect(report.rows[0].action).toBe('update');
    const p = await perfil('coord1@fic.example');
    expect(p.name).toBe('Coord Um Renomeado');   // nome REALMENTE atualizado
    expect(p.id).toBe(ID.uCoord1);               // mesma identidade
  });

  // ---- 11: mudança de papel ----------------------------------------------
  it('11 — mudança de papel encerra o escopo anterior e grava o novo', async () => {
    // Coord Tres Fic ainda não tem titular — promover o GC a coordenador dela
    // é legítimo (assumir coordenação alheia é coberto no caso 16).
    await importAs(ID.uAdmin, [
      { index: 1, name: 'GC A Fic', email: 'gca@fic.example', role: 'coordinator', region: 'Coord Tres Fic' },
    ], true);

    const p = await perfil('gca@fic.example');
    expect(p.role).toBe('coordinator');
    expect(p.coordinationId).toBe(COORD3);

    const ativos = await db.asUser(ID.uAdmin, (tx) => tx.query<{ n: number }>(
      `select count(*)::int n from public.user_scopes where user_id = $1 and active`, [ID.uGcA]));
    expect(ativos[0].n).toBe(1); // exatamente um escopo vigente
  });

  // ---- 12: idempotência ---------------------------------------------------
  it('12 — reimportar o mesmo lote não duplica usuário nem escopo', async () => {
    await criarIdentidade(AUTH.novoGc, 'novo.gc@fic.example');
    const rows: Row[] = [
      { index: 1, name: 'Novo Gc Fic', email: 'novo.gc@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.novoGc },
    ];
    await importAs(ID.uAdmin, rows, true);
    const segunda = await importAs(ID.uAdmin, rows, true);

    expect(segunda.applied).toBe(true);
    expect(segunda.counters).toMatchObject({ inserted: 0, updated: 1 });

    const contagem = await db.asUser(ID.uAdmin, (tx) => tx.query<{ u: number; s: number }>(
      `select (select count(*)::int from public.users where corporate_email = 'novo.gc@fic.example') u,
              (select count(*)::int from public.user_scopes where user_id = $1 and active) s`, [AUTH.novoGc]));
    expect(contagem[0]).toEqual({ u: 1, s: 1 });
  });

  // ---- 13/14: convidado x ativo ------------------------------------------
  it('13 — usuário importado nasce CONVIDADO e é recusado como GC/Coordenador', async () => {
    await criarIdentidade(AUTH.novoGc, 'novo.gc@fic.example');
    await importAs(ID.uAdmin, [
      { index: 1, name: 'Novo Gc Fic', email: 'novo.gc@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.novoGc },
    ], true);

    expect((await perfil('novo.gc@fic.example')).status).toBe('invited');

    // Prova pelo caminho REAL: a importação de parceiros recusa o GC convidado.
    const rel = await importarParceiroCom('novo.gc@fic.example');
    expect(rel.counters.errors).toBe(1);
    expect(rel.rows[0].messages.join(' ')).toMatch(/GC nao esta ativo/);
  });

  it('14 — só vira ATIVO quando a identidade Auth confirma o e-mail; aí é aceito como GC', async () => {
    await criarIdentidade(AUTH.novoGc, 'novo.gc@fic.example');
    await importAs(ID.uAdmin, [
      { index: 1, name: 'Novo Gc Fic', email: 'novo.gc@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.novoGc },
    ], true);

    // Sem confirmação, a ativação não promove ninguém.
    const semConfirmar = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ r: { promoted: number } }>(`select public.admin_activate_confirmed_users() as r`));
    expect(semConfirmar[0].r.promoted).toBe(0);
    expect((await perfil('novo.gc@fic.example')).status).toBe('invited');

    await confirmarEmail(AUTH.novoGc);
    const depois = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ r: { promoted: number } }>(`select public.admin_activate_confirmed_users() as r`));
    expect(depois[0].r.promoted).toBe(1);
    expect((await perfil('novo.gc@fic.example')).status).toBe('active');

    // Agora o MESMO parceiro que foi recusado no caso 13 é aceito.
    const rel = await importarParceiroCom('novo.gc@fic.example');
    expect(rel.counters.errors).toBe(0);
    expect(rel.counters.inserted).toBe(1);
  });

  // ---- 15/16: vínculos ----------------------------------------------------
  it('15 — GC fica ligado à coordenação e ui_users expõe o coordenador titular', async () => {
    await criarIdentidade(AUTH.novoGc, 'novo.gc@fic.example');
    await importAs(ID.uAdmin, [
      { index: 1, name: 'Novo Gc Fic', email: 'novo.gc@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.novoGc },
    ], true);

    const v = await db.asUser(ID.uAdmin, (tx) => tx.query<{ coordinationId: string; coordinatorId: string; region: string }>(
      `select "coordinationId", "coordinatorId", "region" from public.ui_users where "id" = $1`, [AUTH.novoGc]));
    expect(v[0].coordinationId).toBe(ID.coord1);
    expect(v[0].coordinatorId).toBe(ID.uCoord1); // coordenador titular da Coord 1
    expect(v[0].region).toBe('Coord 1');          // área de atuação real, não vazia
  });

  it('16 — coordenador importado vira titular da coordenação; titular divergente é ERRO e reverte tudo', async () => {
    await criarIdentidade(AUTH.novoCoord, 'novo.coord@fic.example');
    // Coord Tres Fic ainda não tem titular ⇒ assume.
    await importAs(ID.uAdmin, [
      { index: 1, name: 'Novo Coord Fic', email: 'novo.coord@fic.example', role: 'coordinator', region: 'Coord Tres Fic', authUserId: AUTH.novoCoord },
    ], true);
    const titular = await db.asUser(ID.uAdmin, (tx) => tx.query<{ coordinator_user_id: string }>(
      `select coordinator_user_id from public.coordinations where id = $1`, [COORD3]));
    expect(titular[0].coordinator_user_id).toBe(AUTH.novoCoord);

    // Coord 1 já é de uCoord1: tentar outro titular derruba a transação.
    await criarIdentidade(AUTH.outro, 'outro.coord@fic.example');
    await db.asUser(ID.uAdmin, (tx) => tx.expectError(
      `select public.admin_import_users($1::jsonb, true)`,
      [JSON.stringify([{ index: 1, name: 'Outro Coord Fic', email: 'outro.coord@fic.example', role: 'coordinator', region: 'Coord 1', authUserId: AUTH.outro }])]));

    expect(await perfil('outro.coord@fic.example')).toBeUndefined(); // nada gravado
  });

  // ---- 17: sem gravação parcial ------------------------------------------
  it('17 — uma linha inválida impede a gravação de TODAS as demais', async () => {
    await criarIdentidade(AUTH.novoGc, 'novo.gc@fic.example');
    await criarIdentidade(AUTH.novoReg, 'novo.reg@fic.example');
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Novo Gc Fic', email: 'novo.gc@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.novoGc },
      { index: 2, name: 'Novo Reg Fic', email: 'novo.reg@fic.example', role: 'regional', region: 'Regiao Inexistente', authUserId: AUTH.novoReg },
    ], true);

    expect(report.applied).toBe(false);
    expect(report.counters.errors).toBe(1);
    expect(await perfil('novo.gc@fic.example')).toBeUndefined(); // a linha VÁLIDA também não entrou
    expect(await perfil('novo.reg@fic.example')).toBeUndefined();
  });

  it('17b — usuário novo SEM identidade Auth vira pendingAuth e bloqueia a gravação', async () => {
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Sem Auth Fic', email: 'sem.auth@fic.example', role: 'channel_manager', region: 'Coord 1' },
    ], true);

    expect(report.applied).toBe(false);
    expect(report.counters.pendingAuth).toBe(1);
    expect(report.pendingAuth).toEqual(['sem.auth@fic.example']);
    expect(report.rows[0].status).toBe('pending_auth');
    expect(await perfil('sem.auth@fic.example')).toBeUndefined();
  });

  // ---- vínculo authUserId ↔ e-mail (o cliente não é fonte de verdade) -----
  it('17d — authUserId de OUTRO e-mail é recusado (troca maliciosa de identidade)', async () => {
    await criarIdentidade(AUTH.novoGc, 'vitima@fic.example');
    await criarIdentidade(AUTH.outro, 'atacante@fic.example');

    // A linha diz "vitima", mas carrega a identidade do "atacante": se passasse,
    // o atacante entraria com a credencial dele no perfil/escopo da vítima.
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Vitima Fic', email: 'vitima@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.outro },
    ], true);

    expect(report.applied).toBe(false);
    expect(report.counters.errors).toBe(1);
    expect(report.rows[0].messages.join(' ')).toMatch(/Identidade Auth informada pertence a outro e-mail/);
    // A mensagem não revela de quem é a identidade.
    expect(report.rows[0].messages.join(' ')).not.toMatch(/atacante@fic\.example/);
    expect(await perfil('vitima@fic.example')).toBeUndefined();
    expect(await perfil('atacante@fic.example')).toBeUndefined();
  });

  it('17e — troca cruzada de ids entre dois e-mails do mesmo lote reverte tudo', async () => {
    await criarIdentidade(AUTH.novoGc, 'um@fic.example');
    await criarIdentidade(AUTH.outro, 'dois@fic.example');

    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Um Fic', email: 'um@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.outro },
      { index: 2, name: 'Dois Fic', email: 'dois@fic.example', role: 'channel_manager', region: 'Coord 2', authUserId: AUTH.novoGc },
    ], true);

    expect(report.applied).toBe(false);
    expect(report.counters.errors).toBe(2);
    expect(await perfil('um@fic.example')).toBeUndefined();
    expect(await perfil('dois@fic.example')).toBeUndefined();
  });

  it('17f — o par correto continua passando (a validação não é falso positivo)', async () => {
    await criarIdentidade(AUTH.novoGc, 'certo@fic.example');
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Certo Fic', email: 'certo@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.novoGc },
    ], true);

    expect(report.applied).toBe(true);
    expect((await perfil('certo@fic.example')).id).toBe(AUTH.novoGc);
  });

  it('17g — e-mail com caixa/espaço diferentes ainda casa a identidade', async () => {
    await criarIdentidade(AUTH.novoGc, 'caixa@fic.example');
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Caixa Fic', email: '  CAIXA@Fic.Example  ', role: 'channel_manager', region: 'Coord 1', authUserId: AUTH.novoGc },
    ], true);

    expect(report.applied).toBe(true);
  });

  it('17c — authUserId apontando para identidade inexistente é recusado', async () => {
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Fantasma Fic', email: 'fantasma@fic.example', role: 'channel_manager', region: 'Coord 1', authUserId: '00000000-0000-0000-0000-0000000099ff' },
    ], true);

    expect(report.applied).toBe(false);
    expect(report.rows[0].messages.join(' ')).toMatch(/Identidade Auth inexistente/);
  });

  // ---- simulação ----------------------------------------------------------
  it('simulação não grava nada e antecipa o que falta de identidade', async () => {
    const report = await importAs(ID.uAdmin, [
      { index: 1, name: 'Sem Auth Fic', email: 'sem.auth@fic.example', role: 'channel_manager', region: 'Coord 1' },
      { index: 2, name: 'Coord Um Fic', email: 'coord1@fic.example', role: 'coordinator', region: 'Coord 1' },
    ], false);

    expect(report.mode).toBe('simulate');
    expect(report.applied).toBe(false);
    expect(report.pendingAuth).toEqual(['sem.auth@fic.example']);
    expect(report.counters).toMatchObject({ total: 2, updated: 1, errors: 0 });
    expect(await perfil('sem.auth@fic.example')).toBeUndefined();
  });

  // ---- 18: autorização ----------------------------------------------------
  it('18 — não-administrador não importa (RLS/SECURITY DEFINER)', async () => {
    for (const uid of [ID.uCoord1, ID.uGcA, ID.uReg, ID.uNoScope]) {
      const erro = await db.asUser(uid, (tx) => tx.expectError(
        `select public.admin_import_users($1::jsonb, false)`, [JSON.stringify([])]));
      expect(erro.message).toMatch(/apenas administrador/);
    }
  });

  it('18b — não-administrador não ativa usuários', async () => {
    const erro = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.admin_activate_confirmed_users()`));
    expect(erro.message).toMatch(/apenas administrador/);
  });

  // ---- fluxo completo + isolamento por escopo (usuário IMPORTADO) ---------
  it('fluxo completo: importar → convidar → ativar → parceiro → escopo isolado', async () => {
    // 1/2. Simulação aponta a pendência de identidade; a Edge Function a cria.
    const rows: Row[] = [{
      index: 1, name: 'Gc Importado Fic', email: 'gc.importado@fic.example',
      role: 'channel_manager', region: 'Coord 1',
    }];
    const simulacao = await importAs(ID.uAdmin, rows, false);
    expect(simulacao.pendingAuth).toEqual(['gc.importado@fic.example']);

    await criarIdentidade(AUTH.novoGc, 'gc.importado@fic.example');   // fase 2
    rows[0].authUserId = AUTH.novoGc;

    // 3. Commit transacional: perfil + escopo.
    expect((await importAs(ID.uAdmin, rows, true)).applied).toBe(true);

    // 4. Ativação só após confirmação do e-mail.
    await confirmarEmail(AUTH.novoGc);
    await db.asUser(ID.uAdmin, (tx) => tx.query(`select public.admin_activate_confirmed_users()`));
    expect((await perfil('gc.importado@fic.example')).status).toBe('active');

    // 5/6. O parceiro resolve o GC recém-importado.
    const rel = await importarParceiroCom('gc.importado@fic.example');
    expect(rel.counters.errors).toBe(0);
    expect(rel.counters.inserted).toBe(1);

    // 7. Reimportar não duplica a operação.
    const denovo = await importarParceiroCom('gc.importado@fic.example');
    expect(denovo.counters.inserted).toBe(0);
    expect(denovo.counters.updated).toBe(1);

    const novaOp = await db.asUser(ID.uAdmin, (tx) => tx.query<{ id: string }>(
      `select id from public.operations where office_name = 'Loja Nova Fic'`));
    expect(novaOp).toHaveLength(1);

    // 8. Administrador enxerga todas as operações (2 do cenário + a nova).
    const doAdmin = await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ id: string }>(`select "id" from public.ui_operations`));
    expect(doAdmin).toHaveLength(3);

    // 9. O GC importado enxerga SOMENTE a sua.
    const doGc = await db.asUser(AUTH.novoGc, (tx) =>
      tx.query<{ id: string }>(`select "id" from public.ui_operations`));
    expect(doGc.map((o) => o.id)).toEqual([novaOp[0].id]);

    // 10. GC de OUTRA coordenação não enxerga a operação do importado.
    const doOutroGc = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ id: string }>(`select "id" from public.ui_operations`));
    expect(doOutroGc.map((o) => o.id)).not.toContain(novaOp[0].id);
  });

  // ---- depreciação do caminho antigo (migration 0011) ---------------------
  it('admin_create_user está depreciada e recusa com orientação, sem gravar', async () => {
    const erro = await db.asUser(ID.uAdmin, (tx) => tx.expectError(
      `select public.admin_create_user($1::jsonb)`,
      [JSON.stringify({ name: 'Nao Deve Entrar Fic', email: 'nao.entra@fic.example', role: 'coordinator', region: 'Coord 1' })]));

    expect(erro.message).toMatch(/DEPRECIADA/);
    expect(await perfil('nao.entra@fic.example')).toBeUndefined();
    // Nenhuma identidade incompleta foi deixada para trás (leitura como
    // superuser: auth.users não é — nem deve ser — legível por `authenticated`).
    const orfas = await db.query<{ n: number }>(
      `select count(*)::int n from auth.users where email = 'nao.entra@fic.example'`);
    expect(orfas[0].n).toBe(0);
  });

  it('não-administrador recebe "apenas administrador" na função depreciada, não a orientação', async () => {
    const erro = await db.asUser(ID.uGcA, (tx) => tx.expectError(
      `select public.admin_create_user($1::jsonb)`, [JSON.stringify({ name: 'X', email: 'x@fic.example' })]));
    expect(erro.message).toMatch(/apenas administrador/);
    expect(erro.message).not.toMatch(/admin_import_users/);
  });

  it('anon não alcança a função depreciada', async () => {
    const erro = await db.asAnon((tx) => tx.expectError(
      `select public.admin_create_user($1::jsonb)`, [JSON.stringify({ name: 'X', email: 'x@fic.example' })]));
    expect(erro.message).toBeTruthy();
  });

  it('lote acima de 200 linhas é rejeitado antes de processar', async () => {
    const many: Row[] = Array.from({ length: 201 }, (_, i) => ({
      index: i + 1, name: `P${i} Fic`, email: `p${i}@fic.example`, role: 'channel_manager', region: 'Coord 1',
    }));
    const erro = await db.asUser(ID.uAdmin, (tx) => tx.expectError(
      `select public.admin_import_users($1::jsonb, false)`, [JSON.stringify(many)]));
    expect(erro.message).toMatch(/excede o limite/);
  });
});
