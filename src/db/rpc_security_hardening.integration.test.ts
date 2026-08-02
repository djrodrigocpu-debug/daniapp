/**
 * Endurecimento de RPCs, autorização e imutabilidade — AAPEx 1.3.2
 * (migrations 0031, 0032, 0033), contra Postgres REAL (PGlite) com RLS ativa.
 *
 * Os seis achados da simulação de 30 dias da 1.3.1, cada um com a prova do que
 * mudou e do que NÃO mudou:
 *
 *   H-01  — sete `security definer` com EXECUTE para PUBLIC/anon.
 *   H-01b — `remove_evidence` decidia por `NULL or TRUE`, não por recusa.
 *   H-02  — `validate_evaluation` conferia ESTADO antes de PERMISSÃO, e assim
 *           quem não podia validar aprendia o estado alheio pela diferença
 *           entre as recusas.
 *   O-02  — `admin_activate_confirmed_users()` ativava TODO `invited` do banco.
 *   O-03  — DELETE de snapshot respondia 200 porque havia GRANT, a RLS zerava
 *           as linhas e o gatilho `for each row` nunca chegava a disparar.
 *
 * Dados 100% FICTÍCIOS (§23).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, anexarEvidencia, ID } from './testing/fixtures';

/** As sete RPCs do achado H-01, com a assinatura exata. */
const RPCS_H01 = [
  'public.start_evaluation(uuid,text,uuid)',
  'public.validate_evaluation(uuid,text,text)',
  'public.remove_evidence(uuid,uuid)',
  'public.update_indicator_result(uuid,jsonb)',
  'public.create_visit_report(jsonb,uuid)',
  'public.admin_set_user_active(uuid,boolean)',
  'public.admin_set_user_role(uuid,text)',
] as const;

const ATIVACAO = [
  'public.admin_activate_confirmed_user(uuid)',
  'public.admin_activate_confirmed_users(uuid[])',
] as const;

const podeExecutar = (db: TestDb, papel: string, fn: string) =>
  db.query<{ ok: boolean }>(
    `select has_function_privilege($1, $2, 'EXECUTE') as ok`, [papel, fn],
  ).then((r) => r[0].ok);

/**
 * Chamada AUTENTICADA sem `sub` no JWT — o papel é `authenticated`, então o
 * GRANT não barra e quem precisa recusar é a GUARDA de ator nulo dentro da
 * função. É a única forma de exercitar a segunda camada isoladamente.
 */
async function semAtor(db: TestDb, sql: string, params: unknown[] = []): Promise<Error> {
  let capturado: Error | null = null;
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`,
      ['{"role":"authenticated"}']);
    await db.query(sql, params);
  } catch (e) {
    capturado = e as Error;
  }
  await db.exec('rollback').catch(() => undefined);
  if (!capturado) throw new Error('esperava recusa por ator nulo, mas a chamada foi permitida');
  return capturado;
}

// ===========================================================================
// H-01 — GRANTS
// ===========================================================================
describe('H-01 — EXECUTE de PUBLIC/anon nas RPCs remanescentes (0031)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('nenhuma das sete é executável por PUBLIC', async () => {
    for (const fn of RPCS_H01) {
      expect(await podeExecutar(db, 'public', fn), `PUBLIC ainda executa ${fn}`).toBe(false);
    }
  });

  it('nenhuma das sete é executável por anon', async () => {
    for (const fn of RPCS_H01) {
      expect(await podeExecutar(db, 'anon', fn), `anon ainda executa ${fn}`).toBe(false);
    }
  });

  it('authenticated continua executando as sete — o caminho legítimo não é tocado', async () => {
    for (const fn of RPCS_H01) {
      expect(await podeExecutar(db, 'authenticated', fn), `authenticated perdeu ${fn}`).toBe(true);
    }
  });

  it('as duas RPCs de ativação (0032) nascem com o mesmo mínimo privilégio', async () => {
    for (const fn of ATIVACAO) {
      expect(await podeExecutar(db, 'public', fn)).toBe(false);
      expect(await podeExecutar(db, 'anon', fn)).toBe(false);
      expect(await podeExecutar(db, 'authenticated', fn)).toBe(true);
    }
  });

  it('nenhuma função de public. continua aberta a anon (varredura do catálogo)', async () => {
    // Rede de segurança contra a próxima RPC que nascer com o EXECUTE padrão.
    // Funções de EXTENSÃO (pgcrypto, instalada em public pela 0001) ficam de
    // fora: os privilégios delas são do pacote, não do nosso catálogo.
    const abertas = await db.query<{ fn: string }>(`
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
         and not exists (select 1 from pg_depend d
                          where d.objid = p.oid and d.classid = 'pg_proc'::regclass
                            and d.deptype = 'e')
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE'))
       order by 1`);
    expect(abertas.map((r) => r.fn)).toEqual([]);
  });
});

// ===========================================================================
// ATOR NULO — a segunda camada, independente do grant
// ===========================================================================
describe('guarda de ator nulo nas RPCs mutadoras (0031)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); await seedScenario(db); }, 30_000);
  afterAll(async () => { await db.close(); });

  const semSub: Array<[string, string, unknown[]]> = [
    ['start_evaluation', 'select public.start_evaluation($1,$2,$3)', [ID.opA, 'weekly', ID.uGcA]],
    ['validate_evaluation', 'select public.validate_evaluation($1,$2,$3)', [ID.evalA, 'approved', 'ok']],
    ['remove_evidence', 'select public.remove_evidence($1,$2)', [ID.evalA, ID.evalA]],
    ['update_indicator_result', 'select public.update_indicator_result($1,$2::jsonb)', [ID.evalA, '{}']],
    ['create_visit_report', 'select public.create_visit_report($1::jsonb,$2)',
      [JSON.stringify({ operationId: ID.opA }), ID.uGcA]],
    ['admin_set_user_active', 'select public.admin_set_user_active($1,true)', [ID.uGcB]],
    ['admin_set_user_role', 'select public.admin_set_user_role($1,$2)', [ID.uGcB, 'admin']],
  ];

  it.each(semSub)('%s recusa explicitamente o ator nulo', async (_nome, sql, params) => {
    const erro = await semAtor(db, sql, params);
    expect(erro.message).toMatch(/autenticacao obrigatoria/);
  });

  it('a recusa por ator nulo não deixa efeito lateral nem log de sucesso', async () => {
    const antes = await db.query<{ ev: number; vr: number; sc: number; lg: number }>(`
      select (select count(*) from public.evaluations)::int as ev,
             (select count(*) from public.visit_reports)::int as vr,
             (select count(*) from public.user_scopes)::int as sc,
             (select count(*) from public.audit_logs)::int as lg`);

    for (const [, sql, params] of semSub) await semAtor(db, sql, params);

    const depois = await db.query<{ ev: number; vr: number; sc: number; lg: number }>(`
      select (select count(*) from public.evaluations)::int as ev,
             (select count(*) from public.visit_reports)::int as vr,
             (select count(*) from public.user_scopes)::int as sc,
             (select count(*) from public.audit_logs)::int as lg`);
    expect(depois).toEqual(antes);
  });

  it('sem sessão, a recusa vem ANTES de qualquer leitura: UUID que existe e UUID que não existe respondem igual', async () => {
    const existe = await semAtor(db, `select public.remove_evidence($1,$2)`,
      [ID.evalA, ID.evalA]);
    const naoExiste = await semAtor(db, `select public.remove_evidence($1,$2)`,
      ['00000000-0000-0000-0000-0000000000ff', ID.evalA]);
    expect(existe.message).toBe(naoExiste.message);
  });
});

// ===========================================================================
// H-01b — REMOVE_EVIDENCE
// ===========================================================================
describe('H-01b — remove_evidence decide por booleano fechado (0031)', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); await seedScenario(db); }, 30_000);
  afterAll(async () => { await db.close(); });

  /** Rascunho novo de opB com uma evidência do fluxo oficial completo. */
  async function rascunhoComEvidencia() {
    await db.exec(`
      delete from public.evidence_upload_reservations;
      delete from public.evaluation_answer_evidence;
      delete from public.evidence_files;
      delete from storage.objects where bucket_id = 'evidencias';
      delete from public.evaluations where operation_id = '${ID.opB}';
    `);
    const draft = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: { id: string } }>(`select public.start_evaluation($1,$2,$3) as ev`,
        [ID.opB, 'weekly', ID.uGcB])))[0].ev;
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.save_evaluation_answer($1,$2,$3::jsonb)`,
        [draft.id, 'I01', JSON.stringify({ status: 'green' })]));
    const anexo = await anexarEvidencia(db, {
      userId: ID.uGcB, evaluationId: draft.id, themeId: 'I01',
    });
    return { evalId: draft.id, anexo };
  }

  const contagens = (evidenceId: string) =>
    db.query<{ meta: number; vinculo: number }>(
      `select (select count(*) from public.evidence_files where id = $1)::int as meta,
              (select count(*) from public.evaluation_answer_evidence where evidence_id = $1)::int as vinculo`,
      [evidenceId]).then((r) => r[0]);

  it('o autor, dentro do escopo, continua removendo — metadata e vínculo saem juntos', async () => {
    const { evalId, anexo } = await rascunhoComEvidencia();
    expect(await contagens(anexo.evidenceId)).toEqual({ meta: 1, vinculo: 1 });

    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.remove_evidence($1,$2)`, [evalId, anexo.evidenceId]));

    expect(await contagens(anexo.evidenceId)).toEqual({ meta: 0, vinculo: 0 });
  });

  it('quem não é o autor é recusado, mesmo sendo o coordenador da operação', async () => {
    const { evalId, anexo } = await rascunhoComEvidencia();
    const erro = await db.asUser(ID.uCoord2, (tx) =>
      tx.expectError(`select public.remove_evidence($1,$2)`, [evalId, anexo.evidenceId]));
    expect(erro.message).toMatch(/sem permissao/);
    expect(await contagens(anexo.evidenceId)).toEqual({ meta: 1, vinculo: 1 });
  });

  it('quem está fora do escopo é recusado — e desde a 0046 sem dizer se o objeto existe', async () => {
    const { evalId, anexo } = await rascunhoComEvidencia();
    const erro = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.remove_evidence($1,$2)`, [evalId, anexo.evidenceId]));
    expect(erro.message).toBe('avaliacao inexistente ou fora do escopo');
    expect(await contagens(anexo.evidenceId)).toEqual({ meta: 1, vinculo: 1 });
  });

  it('anon não alcança a função: o grant barra antes do corpo', async () => {
    const { evalId, anexo } = await rascunhoComEvidencia();
    const erro = await db.asAnon((tx) =>
      tx.expectError(`select public.remove_evidence($1,$2)`, [evalId, anexo.evidenceId]));
    expect(erro.message).toMatch(/permission denied for function remove_evidence/);
    expect(await contagens(anexo.evidenceId)).toEqual({ meta: 1, vinculo: 1 });
  });

  it('avaliação inexistente é recusada sem tocar em nada, com a MESMA frase do fora do escopo', async () => {
    const { evalId, anexo } = await rascunhoComEvidencia();
    const erro = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `select public.remove_evidence($1,$2)`,
      ['00000000-0000-0000-0000-0000000000fe', anexo.evidenceId]));
    expect(erro.message).toBe('avaliacao inexistente ou fora do escopo');
    expect(await contagens(anexo.evidenceId)).toEqual({ meta: 1, vinculo: 1 });

    // O outro lado da comparação: um objeto que EXISTE, fora do alcance de quem
    // pergunta. Desde a 0046 (O-18) os dois são indistinguíveis.
    const foraDoEscopo = await db.asUser(ID.uGcA, (tx) => tx.expectError(
      `select public.remove_evidence($1,$2)`, [evalId, anexo.evidenceId]));
    expect(foraDoEscopo.message).toBe(erro.message);
  });
});

// ===========================================================================
// H-02 — VALIDATE_EVALUATION
// ===========================================================================
describe('H-02 — validate_evaluation autoriza antes de revelar estado (0031)', () => {
  let db: TestDb;
  const UUID_INEXISTENTE = '00000000-0000-0000-0000-0000000000fd';

  beforeAll(async () => { db = await createTestDb(); }, 30_000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.reset();
    await seedScenario(db);
  }, 30_000);

  /** Avaliação de opA em estado arbitrário, para comparar recusas. */
  const porEstado = (estado: string) =>
    db.exec(`update public.evaluations set status = '${estado}' where id = '${ID.evalA}';`);

  it('o coordenador da operação valida — o caminho legítimo é idêntico', async () => {
    const ev = (await db.asUser(ID.uCoord1, (tx) =>
      tx.query<{ ev: { status: string } }>(
        `select public.validate_evaluation($1,$2,$3) as ev`, [ID.evalA, 'approved', 'ok'])))[0].ev;
    expect(ev.status).toBe('approved');
  });

  it('o autor não valida a própria avaliação, e a mensagem continua sendo essa', async () => {
    const erro = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));
    expect(erro.message).toMatch(/nao e permitido validar a propria avaliacao/);
  });

  it('quem está fora do escopo recebe resposta UNIFORME, seja qual for o estado', async () => {
    // Este é o achado. Antes, `submitted` respondia diferente de `approved`,
    // e o chamador aprendia o ciclo de vida de uma avaliação que não é dele.
    const respostas: string[] = [];
    // `approved` por último: `trg_guard_approved_eval` (0003) impede sair de
    // aprovada, então qualquer estado depois dela seria bloqueado pelo gatilho.
    for (const estado of ['submitted', 'draft', 'returned', 'approved']) {
      await porEstado(estado);
      const erro = await db.asUser(ID.uGcB, (tx) =>
        tx.expectError(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));
      respostas.push(erro.message);
    }
    expect(new Set(respostas).size).toBe(1);
    expect(respostas[0]).toMatch(/inexistente ou fora do escopo/);
  });

  it('e a mesma resposta vale para um UUID que sequer existe', async () => {
    const doOutro = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));
    const inexistente = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.validate_evaluation($1,$2,$3)`,
        [UUID_INEXISTENTE, 'approved', 'ok']));
    expect(doOutro.message).toBe(inexistente.message);
  });

  it('para quem PODE validar, a mensagem empresarial de estado continua útil', async () => {
    await porEstado('draft');
    const erro = await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));
    expect(erro.message).toMatch(/nao esta aguardando validacao/);
  });

  it('a recusa não cria snapshot, validação nem log de aprovação', async () => {
    await porEstado('draft');
    await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));
    await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));

    const c = await db.query<{ snap: number; val: number; log: number }>(`
      select (select count(*) from public.official_snapshots)::int as snap,
             (select count(*) from public.validations)::int as val,
             (select count(*) from public.audit_logs where event = 'evaluation.approved')::int as log`);
    expect(c[0]).toEqual({ snap: 0, val: 0, log: 0 });
  });

  it('anon não alcança a função nem para o UUID que existe', async () => {
    const erro = await db.asAnon((tx) =>
      tx.expectError(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));
    expect(erro.message).toMatch(/permission denied for function validate_evaluation/);
  });
});

// ===========================================================================
// O-02 — ATIVAÇÃO DIRECIONADA
// ===========================================================================
describe('O-02 — ativação administrativa exige alvo nomeado (0032)', () => {
  let db: TestDb;
  const ALVO = '00000000-0000-0000-0000-0000000032a1';
  const CONTROLE = '00000000-0000-0000-0000-0000000032a2';

  const status = (id: string) =>
    db.query<{ s: string }>(`select status::text as s from public.users where id = $1`, [id])
      .then((r) => r[0]?.s ?? null);

  const ativar = (comoUsuario: string, alvo: string) =>
    db.asUser(comoUsuario, (tx) =>
      tx.query<{ r: { changed: boolean; reason: string } }>(
        `select public.admin_activate_confirmed_user($1) as r`, [alvo])).then((res) => res[0].r);

  beforeAll(async () => { db = await createTestDb(); }, 30_000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.reset();
    await seedScenario(db);
    // Dois convidados com identidade confirmada: um é o ALVO, o outro existe
    // só para provar que ninguém mais é tocado.
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${ALVO}','alvo.sintetico@fic.example', now()),
        ('${CONTROLE}','controle.sintetico@fic.example', now());
      insert into public.users (id, display_name, corporate_email, status) values
        ('${ALVO}','Alvo Fic','alvo.sintetico@fic.example','invited'),
        ('${CONTROLE}','Controle Fic','controle.sintetico@fic.example','invited');
    `);
  }, 30_000);

  it('o administrador ativa SOMENTE o usuário indicado; o segundo convidado fica intocado', async () => {
    const r = await ativar(ID.uAdmin, ALVO);
    expect(r.changed).toBe(true);
    expect(await status(ALVO)).toBe('active');
    expect(await status(CONTROLE)).toBe('invited');
  });

  it('é idempotente: repetir não é erro e não escreve de novo', async () => {
    await ativar(ID.uAdmin, ALVO);
    const logsAntes = await db.query<{ n: number }>(
      `select count(*)::int n from public.audit_logs where event = 'user.status_changed' and object_id = $1`,
      [ALVO]);

    const r = await ativar(ID.uAdmin, ALVO);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('already_active');

    const logsDepois = await db.query<{ n: number }>(
      `select count(*)::int n from public.audit_logs where event = 'user.status_changed' and object_id = $1`,
      [ALVO]);
    expect(logsDepois[0].n).toBe(logsAntes[0].n);
  });

  it('sem e-mail confirmado não promove — a regra empresarial não mudou', async () => {
    await db.exec(`update auth.users set email_confirmed_at = null where id = '${ALVO}';`);
    const r = await ativar(ID.uAdmin, ALVO);
    expect(r).toMatchObject({ changed: false, reason: 'email_not_confirmed' });
    expect(await status(ALVO)).toBe('invited');
  });

  it('suspenso não é reativado por aqui: continua sendo admin_set_user_active', async () => {
    await db.exec(`update public.users set status = 'suspended' where id = '${ALVO}';`);
    const r = await ativar(ID.uAdmin, ALVO);
    expect(r).toMatchObject({ changed: false, reason: 'not_invited' });
    expect(await status(ALVO)).toBe('suspended');
  });

  it('usuário inexistente é erro nominal, não silêncio', async () => {
    const erro = await db.asUser(ID.uAdmin, (tx) => tx.expectError(
      `select public.admin_activate_confirmed_user($1)`,
      ['00000000-0000-0000-0000-0000000000fc']));
    expect(erro.message).toMatch(/usuario inexistente/);
  });

  it('usuário comum não ativa ninguém; anon nem alcança a função', async () => {
    const comum = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`select public.admin_activate_confirmed_user($1)`, [ALVO]));
    expect(comum.message).toMatch(/apenas administrador/);

    const anon = await db.asAnon((tx) =>
      tx.expectError(`select public.admin_activate_confirmed_user($1)`, [ALVO]));
    expect(anon.message).toMatch(/permission denied for function admin_activate_confirmed_user/);

    const semSessao = await semAtor(db, `select public.admin_activate_confirmed_user($1)`, [ALVO]);
    expect(semSessao.message).toMatch(/autenticacao obrigatoria/);

    expect(await status(ALVO)).toBe('invited');
  });

  it('a trilha registra a mudança com o administrador como ator', async () => {
    await ativar(ID.uAdmin, ALVO);
    const log = await db.query<{ actor: string; meta: Record<string, string> }>(
      `select actor_user_id::text as actor, metadata as meta from public.audit_logs
        where event = 'user.status_changed' and object_id = $1`, [ALVO]);
    expect(log).toHaveLength(1);
    expect(log[0].actor).toBe(ID.uAdmin);
    expect(log[0].meta).toMatchObject({ from: 'invited', to: 'active' });
  });

  it('o lote promove só a lista informada — não existe mais "todos"', async () => {
    const r = (await db.asUser(ID.uAdmin, (tx) =>
      tx.query<{ r: { promoted: number; requested: number } }>(
        `select public.admin_activate_confirmed_users($1::uuid[]) as r`, [[ALVO]])))[0].r;
    expect(r).toMatchObject({ promoted: 1, requested: 1 });
    expect(await status(ALVO)).toBe('active');
    expect(await status(CONTROLE)).toBe('invited');
  });

  it('a forma sem argumento não existe mais no catálogo', async () => {
    const achadas = await db.query<{ args: string }>(`
      select pg_get_function_identity_arguments(p.oid) as args
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_activate_confirmed_users'`);
    expect(achadas.map((r) => r.args)).toEqual(['p_user_ids uuid[]']);
  });
});

// ===========================================================================
// O-03 — IMUTABILIDADE DO SNAPSHOT
// ===========================================================================
describe('O-03 — o snapshot oficial recusa em vez de silenciar (0033)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    // Snapshot real, pelo caminho oficial: aprovação do coordenador.
    await db.asUser(ID.uCoord1, (tx) =>
      tx.query(`select public.validate_evaluation($1,$2,$3)`, [ID.evalA, 'approved', 'ok']));
  }, 30_000);
  afterAll(async () => { await db.close(); });

  const quantos = () =>
    db.query<{ n: number }>(`select count(*)::int n from public.official_snapshots`)
      .then((r) => r[0].n);

  it('o cenário tem o snapshot que a aprovação gerou', async () => {
    expect(await quantos()).toBe(1);
  });

  it('nem authenticated nem anon têm insert/update/delete/truncate no catálogo', async () => {
    const p = await db.query<{ papel: string; ins: boolean; upd: boolean; del: boolean; trunc: boolean; sel: boolean }>(`
      select g.rolname as papel,
             has_table_privilege(g.rolname, 'public.official_snapshots', 'INSERT')   as ins,
             has_table_privilege(g.rolname, 'public.official_snapshots', 'UPDATE')   as upd,
             has_table_privilege(g.rolname, 'public.official_snapshots', 'DELETE')   as del,
             has_table_privilege(g.rolname, 'public.official_snapshots', 'TRUNCATE') as trunc,
             has_table_privilege(g.rolname, 'public.official_snapshots', 'SELECT')   as sel
        from (values ('anon'),('authenticated')) g(rolname) order by 1`);
    for (const linha of p) {
      expect(linha, `${linha.papel} ainda escreve no snapshot`)
        .toMatchObject({ ins: false, upd: false, del: false, trunc: false });
      // A leitura por escopo (`snapshots_read`) permanece.
      expect(linha.sel).toBe(true);
    }
  });

  it('o DELETE do usuário comum FALHA — não é mais o 200 silencioso de zero linhas', async () => {
    const erro = await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`delete from public.official_snapshots where evaluation_id = $1`, [ID.evalA]));
    expect(erro.message).toMatch(/permission denied for table official_snapshots/);
    expect(await quantos()).toBe(1);
  });

  it('UPDATE e INSERT do cliente também falham no primeiro portão', async () => {
    const upd = await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`update public.official_snapshots set score = 0`));
    expect(upd.message).toMatch(/permission denied for table official_snapshots/);

    const ins = await db.asUser(ID.uCoord1, (tx) => tx.expectError(
      `insert into public.official_snapshots (evaluation_id, operation_id, period, score, template_version_id, payload, approved_by_user_id)
       values ($1,$2,'2099-01',100,$3,'{}'::jsonb,auth.uid())`,
      [ID.evalA, ID.opA, ID.templateV1]));
    expect(ins.message).toMatch(/permission denied for table official_snapshots/);

    expect(await quantos()).toBe(1);
  });

  it('anon também é barrado, e o dado continua exatamente onde estava', async () => {
    const erro = await db.asAnon((tx) =>
      tx.expectError(`delete from public.official_snapshots`));
    expect(erro.message).toMatch(/permission denied for table official_snapshots/);
    expect(await quantos()).toBe(1);
  });

  it('a segunda camada continua de pé: o gatilho barra até quem tem privilégio de tabela', async () => {
    // Gatilho, não policy — pega a escrita fora da RLS, inclusive a do dono.
    await expect(db.exec(`delete from public.official_snapshots`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`update public.official_snapshots set score = 0`)).rejects.toThrow(/append-only/);
    // TRUNCATE não passa por linha nenhuma: até a 1.3.1 nenhum gatilho o via.
    await expect(db.exec(`truncate public.official_snapshots`)).rejects.toThrow(/append-only/);
    expect(await quantos()).toBe(1);
  });

  it('a leitura por escopo do snapshot não foi afetada', async () => {
    const doCoord = await db.asUser(ID.uCoord1, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.official_snapshots`));
    const deOutroEscopo = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.official_snapshots`));
    expect(doCoord[0].n).toBe(1);
    expect(deOutroEscopo[0].n).toBe(0);
  });
});
