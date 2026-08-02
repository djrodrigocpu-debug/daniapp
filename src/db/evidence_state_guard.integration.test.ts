/**
 * Guarda de estado na remoção de evidência (O-04) e imutabilidade completa de
 * `audit_logs` (O-05) — migration 0034, contra Postgres REAL (PGlite) com RLS.
 *
 * O-04. O ciclo de vida da comprovação estava pela metade: ANEXAR era travado
 * por estado desde a 0028, REMOVER não era travado por nada. O autor de uma
 * avaliação já `submitted` apagava metadata e vínculo sem erro — e a avaliação
 * seguia enviada, e depois aprovada com snapshot oficial, apoiada em evidência
 * que não existia mais. `submit_evaluation` exige comprovação em todo item com
 * `evidence_required`: sem esta guarda, esse portão só valia no instante do
 * clique.
 *
 * O-05. `audit_logs` tinha insert/update/delete revogados (0029) e gatilhos de
 * update/delete (0003), mas TRUNCATE seguia concedido a `anon` e
 * `authenticated` — e TRUNCATE é justamente o comando que gatilho `for each
 * row` não enxerga.
 *
 * Dados 100% FICTÍCIOS (§23).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, anexarEvidencia, ID } from './testing/fixtures';

const MSG_ESTADO = /rascunho ou devolvida/i;

// ===========================================================================
// O-04 — REMOÇÃO DE EVIDÊNCIA
// ===========================================================================
describe('O-04 — remover evidência respeita o mesmo estado que anexar (0034)', () => {
  let db: TestDb;
  let evalId: string;
  let evidenceId: string;

  beforeAll(async () => { db = await createTestDb(); await seedScenario(db); }, 30_000);
  afterAll(async () => { await db.close(); });

  /**
   * Rascunho novo de opB com UMA evidência pelo fluxo oficial completo
   * (reserva → objeto no bucket → confirmação). Refeito a cada teste para que
   * as contagens provem alguma coisa.
   */
  beforeEach(async () => {
    await db.exec(`
      delete from public.evidence_upload_reservations;
      delete from public.evaluation_answer_evidence;
      delete from public.evidence_files;
      delete from storage.objects where bucket_id = 'evidencias';
      delete from public.validations;
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
    evalId = draft.id;
    evidenceId = anexo.evidenceId;
  }, 30_000);

  const estado = (s: string) =>
    db.exec(`update public.evaluations set status = '${s}' where id = '${evalId}'`);

  const foto = () => db.query<{
    meta: number; vinculo: number; objeto: number; rowVersion: number; submittedAt: string | null;
  }>(`select (select count(*) from public.evidence_files where id = '${evidenceId}')::int as meta,
             (select count(*) from public.evaluation_answer_evidence where evidence_id = '${evidenceId}')::int as vinculo,
             (select count(*) from storage.objects where bucket_id = 'evidencias')::int as objeto,
             (select row_version from public.evaluations where id = '${evalId}') as "rowVersion",
             (select submitted_at::text from public.evaluations where id = '${evalId}') as "submittedAt"`)
    .then((r) => r[0]);

  const remover = (userId: string) =>
    db.asUser(userId, (tx) => tx.query(`select public.remove_evidence($1,$2)`, [evalId, evidenceId]));
  const removerEsperandoErro = (userId: string) =>
    db.asUser(userId, (tx) => tx.expectError(`select public.remove_evidence($1,$2)`, [evalId, evidenceId]));

  it('1 — em RASCUNHO o autor remove: metadata e vínculo saem juntos', async () => {
    await remover(ID.uGcB);
    const d = await foto();
    expect({ meta: d.meta, vinculo: d.vinculo }).toEqual({ meta: 0, vinculo: 0 });
  });

  it('2 — em DEVOLVIDA o autor também remove (é a janela de correção)', async () => {
    await estado('returned');
    await remover(ID.uGcB);
    const d = await foto();
    expect({ meta: d.meta, vinculo: d.vinculo }).toEqual({ meta: 0, vinculo: 0 });
  });

  it('3 — em ENVIADA é recusado, com a mensagem que diz o que fazer', async () => {
    await estado('submitted');
    const erro = await removerEsperandoErro(ID.uGcB);
    expect(erro.message).toMatch(MSG_ESTADO);
  });

  it('4 — em APROVADA é recusado', async () => {
    await estado('approved');
    const erro = await removerEsperandoErro(ID.uGcB);
    expect(erro.message).toMatch(MSG_ESTADO);
  });

  it('5/6/7 — a recusa não toca objeto, metadata nem vínculo', async () => {
    const antes = await foto();
    await estado('submitted');
    await removerEsperandoErro(ID.uGcB);
    const depois = await foto();
    expect(depois.meta).toBe(antes.meta);
    expect(depois.vinculo).toBe(antes.vinculo);
    expect(depois.objeto).toBe(antes.objeto);
    expect({ meta: 1, vinculo: 1, objeto: 1 })
      .toEqual({ meta: depois.meta, vinculo: depois.vinculo, objeto: depois.objeto });
  });

  it('8/9 — a recusa não altera row_version nem submitted_at', async () => {
    await db.exec(
      `update public.evaluations set status='submitted', submitted_at=now() where id='${evalId}'`);
    const antes = await foto();
    await removerEsperandoErro(ID.uGcB);
    const depois = await foto();
    expect(depois.rowVersion).toBe(antes.rowVersion);
    expect(depois.submittedAt).toBe(antes.submittedAt);
  });

  it('10 — a recusa não deixa trilha de sucesso', async () => {
    await estado('submitted');
    const antes = await db.query<{ n: number }>(`select count(*)::int n from public.audit_logs`);
    await removerEsperandoErro(ID.uGcB);
    const depois = await db.query<{ n: number }>(`select count(*)::int n from public.audit_logs`);
    expect(depois[0].n).toBe(antes[0].n);
  });

  it('11 — quem está fora do escopo NÃO descobre o estado pela recusa', async () => {
    const respostas: string[] = [];
    for (const s of ['draft', 'submitted', 'returned']) {
      await estado(s);
      respostas.push((await removerEsperandoErro(ID.uGcA)).message);
    }
    expect(new Set(respostas).size).toBe(1);
    // Desde a 0046 (O-18) a frase é a mesma que um UUID inexistente recebe: quem
    // não alcança a operação não descobre nem o estado nem a existência.
    expect(respostas[0]).toBe('avaliacao inexistente ou fora do escopo');
    expect(respostas[0]).not.toMatch(MSG_ESTADO);

    const inexistente = (await db.asUser(ID.uGcA, (tx) => tx.expectError(
      `select public.remove_evidence($1,$2)`,
      ['00000000-0000-0000-0000-0000000000fc', evidenceId]))).message;
    expect(inexistente).toBe(respostas[0]);
  });

  it('12 — anon é recusado pelo grant, antes do corpo', async () => {
    await estado('submitted');
    const erro = await db.asAnon((tx) =>
      tx.expectError(`select public.remove_evidence($1,$2)`, [evalId, evidenceId]));
    expect(erro.message).toMatch(/permission denied for function remove_evidence/);
  });

  it('13 — corrida: se a SUBMISSÃO vence, a remoção seguinte é recusada', async () => {
    await db.asUser(ID.uGcB, (tx) => tx.query(`select public.submit_evaluation($1)`, [evalId]));
    const erro = await removerEsperandoErro(ID.uGcB);
    expect(erro.message).toMatch(MSG_ESTADO);
    const d = await foto();
    expect({ meta: d.meta, vinculo: d.vinculo }).toEqual({ meta: 1, vinculo: 1 });
  });

  it('13b — a serialização é feita no banco: a função trava a avaliação antes de decidir', async () => {
    // PGlite é de conexão única, então duas transações REAIS concorrentes não
    // existem aqui — a corrida de verdade é exercitada no staging, por HTTP.
    // O que dá para travar em teste é a estrutura que a torna segura.
    // Desde a 0046, `public.remove_evidence` é o WRAPPER que fecha o O-18 e
    // `app.remove_evidence_legacy` é o corpo — movido por `pg_get_functiondef`,
    // não copiado. A propriedade medida continua sendo a mesma, e agora vale nos
    // dois: a trava é tomada no PONTO DE ENTRADA, antes da decisão de escopo, e
    // de novo dentro do legado, antes da decisão de estado.
    const entrada = await db.query<{ d: string }>(
      `select pg_get_functiondef('public.remove_evidence(uuid,uuid)'::regprocedure) as d`);
    expect(entrada[0].d).toMatch(/from public\.evaluations[\s\S]*?for update/i);
    expect(entrada[0].d.indexOf('for update'))
      .toBeLessThan(entrada[0].d.indexOf('fora do escopo'));
    expect(entrada[0].d).toContain('app.remove_evidence_legacy');

    const def = await db.query<{ d: string }>(
      `select pg_get_functiondef('app.remove_evidence_legacy(uuid,uuid)'::regprocedure) as d`);
    expect(def[0].d).toMatch(/from public\.evaluations[\s\S]*?for update/i);
    // E a trava vem ANTES da decisão de estado, senão não serializa nada.
    expect(def[0].d.indexOf('for update')).toBeLessThan(def[0].d.indexOf('rascunho ou devolvida'));
  });

  it('14 — toque duplo: a segunda remoção não passa e não deixa inconsistência', async () => {
    await remover(ID.uGcB);
    const erro = await removerEsperandoErro(ID.uGcB);
    expect(erro).toBeInstanceOf(Error);
    const d = await foto();
    expect({ meta: d.meta, vinculo: d.vinculo }).toEqual({ meta: 0, vinculo: 0 });
  });

  it('15 — removida em rascunho, a submissão volta a exigir a comprovação', async () => {
    await remover(ID.uGcB);
    const erro = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.submit_evaluation($1)`, [evalId]));
    expect(erro.message).toMatch(/evidencia obrigatoria ausente/);
  });

  it('16 — o par avaliação/evidência é derivado do registro, não aceito do cliente', async () => {
    // Avaliação de OUTRA operação, do mesmo autor: o par é incoerente e a
    // função recusa em vez de apagar o metadata de uma avaliação alheia.
    const outra = (await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ ev: { id: string } }>(`select public.start_evaluation($1,$2,$3) as ev`,
        [ID.opB, 'monthly', ID.uGcB])))[0].ev;
    const erro = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.remove_evidence($1,$2)`, [outra.id, evidenceId]));
    expect(erro.message).toMatch(/sem permissao/);
    const d = await foto();
    expect({ meta: d.meta, vinculo: d.vinculo }).toEqual({ meta: 1, vinculo: 1 });
  });
});

// ===========================================================================
// O-05 — AUDIT_LOGS
// ===========================================================================
describe('O-05 — audit_logs recusa TRUNCATE em duas camadas (0034)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    // Trilha real, produzida pelo caminho empresarial.
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.start_evaluation($1,$2,$3)`, [ID.opB, 'weekly', ID.uGcB]));
  }, 30_000);
  afterAll(async () => { await db.close(); });

  const quantos = () =>
    db.query<{ n: number }>(`select count(*)::int n from public.audit_logs`).then((r) => r[0].n);

  it('1/2/3/4 — anon não tem insert, update, delete nem truncate', async () => {
    const p = await db.query<{ ins: boolean; upd: boolean; del: boolean; trunc: boolean; sel: boolean }>(`
      select has_table_privilege('anon','public.audit_logs','INSERT')   as ins,
             has_table_privilege('anon','public.audit_logs','UPDATE')   as upd,
             has_table_privilege('anon','public.audit_logs','DELETE')   as del,
             has_table_privilege('anon','public.audit_logs','TRUNCATE') as trunc,
             has_table_privilege('anon','public.audit_logs','SELECT')   as sel`);
    expect(p[0]).toEqual({ ins: false, upd: false, del: false, trunc: false, sel: true });
  });

  it('5/6/7/8 — authenticated também não, e a leitura permanece', async () => {
    const p = await db.query<{ ins: boolean; upd: boolean; del: boolean; trunc: boolean; sel: boolean }>(`
      select has_table_privilege('authenticated','public.audit_logs','INSERT')   as ins,
             has_table_privilege('authenticated','public.audit_logs','UPDATE')   as upd,
             has_table_privilege('authenticated','public.audit_logs','DELETE')   as del,
             has_table_privilege('authenticated','public.audit_logs','TRUNCATE') as trunc,
             has_table_privilege('authenticated','public.audit_logs','SELECT')   as sel`);
    expect(p[0]).toEqual({ ins: false, upd: false, del: false, trunc: false, sel: true });
  });

  it('a tentativa real de cada papel falha, e a contagem não muda', async () => {
    const antes = await quantos();
    for (const [nome, sql] of [
      ['insert', `insert into public.audit_logs (event) values ('forjado')`],
      ['update', `update public.audit_logs set event = 'adulterado'`],
      ['delete', `delete from public.audit_logs`],
      ['truncate', `truncate public.audit_logs`],
    ] as const) {
      const comum = await db.asUser(ID.uGcB, (tx) => tx.expectError(sql));
      expect(comum.message, `authenticated ${nome}`).toMatch(/permission denied for table audit_logs/);
      const anon = await db.asAnon((tx) => tx.expectError(sql));
      expect(anon.message, `anon ${nome}`).toMatch(/permission denied for table audit_logs/);
    }
    expect(await quantos()).toBe(antes);
  });

  it('9 — TRUNCATE por quem TEM privilégio ainda é barrado pelo gatilho', async () => {
    // Gatilho, não policy nem grant: pega o dono da tabela, que é justamente
    // quem o REVOKE não alcança. E `for each row` nunca veria um TRUNCATE.
    const antes = await quantos();
    await expect(db.exec(`truncate public.audit_logs`)).rejects.toThrow(/append-only/);
    expect(await quantos()).toBe(antes);

    const t = await db.query<{ n: number }>(`
      select count(*)::int n from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname = 'audit_logs' and t.tgname = 'trg_audit_no_truncate'
         and not t.tgisinternal and t.tgenabled = 'O'`);
    expect(t[0].n).toBe(1);
  });

  it('a guarda de mutação tem search_path fixo', async () => {
    const cfg = await db.query<{ cfg: string | null }>(`
      select array_to_string(p.proconfig, ',') as cfg from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and p.proname = 'block_mutation'`);
    expect(cfg[0].cfg).toMatch(/search_path=/);
  });

  it('10/12 — os gatilhos empresariais continuam gravando, e nada anterior muda', async () => {
    const antes = await db.query<{ id: string; event: string }>(
      `select id::text as id, event from public.audit_logs order by created_at, id`);
    expect(antes.length).toBeGreaterThan(0);

    const [avaliacao] = await db.query<{ id: string }>(
      `select id::text as id from public.evaluations where operation_id='${ID.opB}' limit 1`);
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.save_evaluation_answer($1,$2,$3::jsonb)`,
        [avaliacao.id, 'I01', JSON.stringify({ status: 'green' })]));
    await db.asUser(ID.uAdmin, (tx) =>
      tx.query(`select public.admin_set_user_active($1,false)`, [ID.uNoScope]));

    const depois = await db.query<{ id: string; event: string }>(
      `select id::text as id, event from public.audit_logs order by created_at, id`);
    expect(depois.length).toBeGreaterThan(antes.length);
    // Nenhuma linha anterior foi alterada nem removida.
    for (const linha of antes) {
      expect(depois.find((d) => d.id === linha.id)?.event).toBe(linha.event);
    }
  });

  it('11 — a leitura por escopo continua valendo', async () => {
    const doGc = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.audit_logs`));
    const deOutro = await db.asUser(ID.uGcA, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.audit_logs where actor_user_id = $1`,
        [ID.uGcB]));
    expect(doGc[0].n).toBeGreaterThan(0);
    expect(deOutro[0].n).toBe(0);
  });
});
