/**
 * AAPEx 1.3.5 — FASE 7: cutover parametrizável, **criado e não ativado**.
 *
 * A EXIGÊNCIA QUE GOVERNA ESTE ARQUIVO. D5 pede estrutura parametrizável e
 * proíbe ativar; A-02 — a data — continua aberta. Então a coisa mais importante
 * que este arquivo mede não é o que a guarda faz quando ativa: é que, **com a
 * data nula, o comportamento é bit a bit o de antes** — e que a linha semeada
 * termina a suíte ainda nula.
 *
 * Todo caso que preenche a data a devolve para nulo no mesmo caso, e o último
 * bloco confere o valor final sobre um banco recém-migrado. `system_settings`
 * entra no teardown do harness exatamente para que esse isolamento exista.
 *
 * A SEGUNDA EXIGÊNCIA, e ela não é óbvia: a guarda **não pode** deixar rascunho
 * semanal órfão. `start_evaluation` é idempotente, e D5 dá aos quatro drafts de
 * produção a saída *"concluir como legado"* — que só existe se o rascunho
 * continuar abrindo depois do cutover. O bloco D mede isso.
 *
 * Dados 100% SINTÉTICOS. Nenhum ambiente remoto é tocado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

const CHAVE = 'weekly_audit_cutover_date';

/** Datas relativas ao "hoje" do servidor, para não depender do relógio do teste. */
const emDias = (n: number) => `(select (app.assisted_today() + ${n})::text)`;

describe('Fase 7 — cutover parametrizável, criado e NÃO ativado (0047)', () => {
  let db: TestDb;

  const rpc = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    db.asUser(userId, (tx) => tx.query<{ r: T }>(sql, params)).then((x) => x[0]?.r);

  /** O valor cru da semente, lido como superuser (ignora RLS). */
  const valorCru = async (): Promise<unknown> => {
    const r = await db.query<{ v: unknown }>(
      `select value as v from public.system_settings where key = $1`, [CHAVE]);
    return r.length === 0 ? undefined : r[0].v;
  };

  /** Grava a data por caminho administrativo, em dias a partir de hoje. */
  const configurar = async (dias: number | null, confirmar = false) => {
    if (dias === null) {
      return rpc(ID.uAdmin, `select public.admin_set_weekly_audit_cutover(null,$1) as r`, [confirmar]);
    }
    return db.asUser(ID.uAdmin, (tx) => tx.query(
      `select public.admin_set_weekly_audit_cutover(${emDias(dias)}::date, $1) as r`, [confirmar]));
  };

  /** Retrato do que qualquer escrita parcial mexeria. */
  const retrato = async () => {
    const r = await db.query<{ j: Record<string, unknown> }>(`
      select jsonb_build_object(
        'settings',   (select count(*) from public.system_settings),
        'valor',      (select value from public.system_settings where key = '${CHAVE}'),
        'updatedBy',  (select coalesce(updated_by::text,'-') from public.system_settings where key = '${CHAVE}'),
        'evaluations',(select count(*) from public.evaluations),
        'auditLogs',  (select count(*) from public.audit_logs),
        'evalState',  (select coalesce(string_agg(id::text||':'||status||':'||frequency::text,
                          '|' order by id), '') from public.evaluations)
      ) as j`);
    return r[0].j;
  };

  const recusaSemEfeito = async (fn: () => Promise<unknown>): Promise<string> => {
    const antes = await retrato();
    let msg = '';
    try {
      await fn();
      throw new Error('ESPERAVA RECUSA, mas a operação foi permitida');
    } catch (e) {
      msg = (e as Error).message;
      if (msg.startsWith('ESPERAVA RECUSA')) throw e;
    }
    expect(await retrato()).toEqual(antes);
    return msg;
  };

  beforeAll(async () => { db = await createTestDb(); }, 60_000);
  afterAll(async () => db.close());
  beforeEach(async () => { await db.reset(); await seedScenario(db); }, 60_000);

  // =========================================================================
  // A · A SEMENTE NASCE NULA
  // =========================================================================
  describe('A · a semente', () => {
    it('a linha existe, e o valor é JSON null — não SQL null, não string vazia', async () => {
      const r = await db.query<{ tipo: string; nulo: boolean; leg: boolean; desc: string }>(`
        select jsonb_typeof(value) as tipo, (value = 'null'::jsonb) as nulo,
               client_readable as leg, description as desc
          from public.system_settings where key = $1`, [CHAVE]);
      expect(r.length).toBe(1);
      expect(r[0].tipo).toBe('null');
      expect(r[0].nulo).toBe(true);
      expect(r[0].leg).toBe(true);
      expect(r[0].desc).toContain('A-02');
    });

    it('a função interna lê a semente como DATA NULA', async () => {
      const r = await db.query<{ d: string | null }>(`select app.weekly_audit_cutover_date() as d`);
      expect(r[0].d).toBeNull();
    });

    it('linha ausente é lida como não configurado — o conservador não depende da semente', async () => {
      await db.exec(`delete from public.system_settings where key = '${CHAVE}'`);
      const r = await db.query<{ d: string | null }>(`select app.weekly_audit_cutover_date() as d`);
      expect(r[0].d).toBeNull();

      // E o fluxo semanal continua aberto sem a linha.
      const ev = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      expect(ev.id).toBeTruthy();
    });

    it('o CHECK recusa forma inválida na chave do cutover, mesmo por escrita de superusuário', async () => {
      for (const v of [`'"31/12/2026"'::jsonb`, `'"2026-13-99x"'::jsonb`, `'123'::jsonb`, `'true'::jsonb`]) {
        await expect(db.exec(
          `update public.system_settings set value = ${v} where key = '${CHAVE}'`))
          .rejects.toThrow(/system_settings_cutover_shape/);
      }
      expect(await valorCru()).toBeNull();
    });
  });

  // =========================================================================
  // B · COM DATA NULA, NADA MUDA
  // =========================================================================
  describe('B · inércia com o valor nulo', () => {
    it('weekly é criado normalmente', async () => {
      const ev = await rpc<{ id: string; frequency: string; status: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      expect(ev.status).toBe('draft');
      expect(ev.frequency).toBe('weekly');
    });

    it('a idempotência legada por (operação, frequência) em rascunho continua valendo', async () => {
      const a = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      const b = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      expect(b.id).toBe(a.id);

      const n = await db.query<{ n: number }>(
        `select count(*)::int as n from public.evaluations
          where operation_id = $1 and frequency = 'weekly'`, [ID.opA]);
      expect(n[0].n).toBe(1);
    });

    it('as recusas de ator e de escopo continuam sendo as mesmas, na mesma ordem', async () => {
      const semEscopo = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcB]));
      expect(semEscopo).toBe('operacao fora do escopo');

      // Frequência inválida falha no cast, ANTES de tudo — como na 0031.
      const cast = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'diaria', ID.uGcA]));
      expect(cast).toMatch(/invalid input value for enum visit_type/i);
    });

    it('monthly é criado normalmente', async () => {
      const ev = await rpc<{ frequency: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'monthly', ID.uGcA]);
      expect(ev.frequency).toBe('monthly');
    });

    it('o corpo legado foi MOVIDO, não copiado — e continua inalcançável pelo cliente', async () => {
      const r = await db.query<{ src: string; acl: string | null }>(`
        select p.prosrc as src, array_to_string(p.proacl,',') as acl
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='app' and p.proname='start_evaluation_legacy'`);
      expect(r.length).toBe(1);
      // As marcas da 0031 e da 0006, que uma cópia perderia em silêncio.
      expect(r[0].src).toContain('autenticacao obrigatoria');
      expect(r[0].src).toContain('operacao fora do escopo');
      expect(r[0].src).toContain("status in ('draft','returned')");
      expect(r[0].src).toContain('nenhuma versao de template de auditoria disponivel');
      expect(r[0].acl ?? '').not.toMatch(/(anon|authenticated)=/);
    });
  });

  // =========================================================================
  // C · COM DATA FUTURA, TAMBÉM NADA MUDA
  // =========================================================================
  describe('C · data futura', () => {
    it('weekly continua permitido, e o valor volta a nulo no fim do caso', async () => {
      await configurar(30);
      const ev = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      expect(ev.id).toBeTruthy();

      await configurar(null);
      expect(await valorCru()).toBeNull();
    });

    it('a leitura server-side diz que o fluxo semanal ainda está aberto', async () => {
      await configurar(30);
      const s = await rpc<{ weeklyAuditClosed: boolean; weeklyAuditCutoverDate: string }>(
        ID.uGcA, `select public.get_system_settings() as r`);
      expect(s.weeklyAuditClosed).toBe(false);
      expect(s.weeklyAuditCutoverDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      await configurar(null);
      expect(await valorCru()).toBeNull();
    });
  });

  // =========================================================================
  // D · COM DATA VENCIDA, SÓ A CRIAÇÃO NOVA É RECUSADA
  // =========================================================================
  describe('D · data vencida', () => {
    it('weekly NOVO é recusado, com a data nomeada e sem efeito lateral', async () => {
      await configurar(-1, true);
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]));
      expect(m).toMatch(/^auditoria semanal encerrada em \d{2}\/\d{2}\/\d{4}: registre a semana pela Gestao Assistida$/);

      await configurar(null);
      expect(await valorCru()).toBeNull();
    });

    it('a data de HOJE já recusa — o contrato é `<= hoje`', async () => {
      await configurar(0, true);
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]));
      expect(m).toMatch(/^auditoria semanal encerrada em /);

      await configurar(null);
    });

    it('RASCUNHO semanal existente continua abrindo — nenhum draft fica órfão', async () => {
      const antes = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);

      await configurar(-1, true);

      const depois = await rpc<{ id: string; status: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      expect(depois.id).toBe(antes.id);
      expect(depois.status).toBe('draft');

      // E a operação SEM rascunho, na mesma configuração, é recusada — a guarda
      // não virou inerte, ela só respeita a idempotência.
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.start_evaluation($1,$2,$3) as r`, [ID.opB, 'weekly', ID.uGcB]));
      expect(m).toMatch(/^auditoria semanal encerrada em /);

      await configurar(null);
    });

    it('avaliação semanal DEVOLVIDA também continua abrindo', async () => {
      const ev = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      await db.exec(`update public.evaluations set status='returned' where id='${ev.id}'`);

      await configurar(-1, true);
      const de = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      expect(de.id).toBe(ev.id);

      await configurar(null);
    });

    it('auditoria semanal HISTÓRICA continua legível, e nada foi convertido', async () => {
      const ev = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      await db.exec(`update public.evaluations set status='approved' where id='${ev.id}'`);

      await configurar(-1, true);

      const lida = await db.asUser(ID.uGcA, (tx) => tx.query<{ f: string; m: string }>(
        `select frequency::text as f, evaluation_model::text as m
           from public.evaluations where id = $1`, [ev.id]));
      expect(lida[0]).toEqual({ f: 'weekly', m: 'legacy_template' });

      await configurar(null);
    });

    it('MONTHLY nunca é afetado, nem com a data vencida', async () => {
      await configurar(-1, true);
      const ev = await rpc<{ frequency: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'monthly', ID.uGcA]);
      expect(ev.frequency).toBe('monthly');

      await configurar(null);
    });

    it('a Gestão Assistida e a Auditoria Mensal por critérios não são tocadas pela guarda', async () => {
      await configurar(-1, true);
      const c = await rpc<{ id: string }>(
        ID.uGcA, `select public.open_assisted_cycle($1,$2) as r`, [ID.opA, '2026-07-06']);
      expect(c.id).toBeTruthy();
      await configurar(null);
    });

    it('a recusa por escopo continua vindo ANTES da guarda de cutover', async () => {
      await configurar(-1, true);
      // O GC B não alcança opA: ele não pode aprender, pela mensagem, que o
      // cutover existe nem que a operação existe.
      const m = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcB]));
      expect(m).toBe('operacao fora do escopo');
      await configurar(null);
    });
  });

  // =========================================================================
  // E · AUTORIZAÇÃO DA CONFIGURAÇÃO
  // =========================================================================
  describe('E · quem configura', () => {
    it.each([
      ['gerente de canal', ID.uGcA],
      ['coordenador', ID.uCoord1],
      ['regional', ID.uReg],
      ['sem escopo', ID.uNoScope],
    ])('%s NÃO configura o cutover, e a recusa não deixa efeito', async (_papel, uid) => {
      const m = await recusaSemEfeito(() => db.asUser(uid, (tx) =>
        tx.query(`select public.admin_set_weekly_audit_cutover(${emDias(30)}::date, false)`)));
      expect(m).toBe('apenas administrador configura o cutover da auditoria semanal');
      expect(await valorCru()).toBeNull();
    });

    it('anon não alcança nem a leitura nem a escrita — o grant barra antes do corpo', async () => {
      const escrita = await db.asAnon((tx) => tx.expectError(
        `select public.admin_set_weekly_audit_cutover(null, false)`));
      expect(escrita.message).toMatch(/permission denied for function admin_set_weekly_audit_cutover/);

      const leitura = await db.asAnon((tx) => tx.expectError(`select public.get_system_settings()`));
      expect(leitura.message).toMatch(/permission denied for function get_system_settings/);
    });

    it('anon não lê a tabela, e authenticated só enxerga o que é client_readable', async () => {
      await db.exec(`
        insert into public.system_settings (key, value, client_readable, description)
        values ('parametro_interno','"segredo-operacional"'::jsonb, false, 'nao visivel ao cliente')`);

      const semSessao = await db.asAnon((tx) =>
        tx.expectError(`select * from public.system_settings`));
      expect(semSessao.message).toMatch(/permission denied for table system_settings/);

      const visiveis = await db.asUser(ID.uAdmin, (tx) =>
        tx.query<{ key: string }>(`select key from public.system_settings order by key`));
      expect(visiveis.map((x) => x.key)).toEqual([CHAVE]);

      // Nem pela RPC: o parâmetro interno não aparece.
      const s = await rpc<{ settings: Record<string, unknown> }>(
        ID.uAdmin, `select public.get_system_settings() as r`);
      expect(Object.keys(s.settings)).toEqual([CHAVE]);
    });

    it('a escrita DIRETA é recusada — inclusive para o ADMIN, dentro do próprio escopo', async () => {
      for (const [nome, sql] of [
        ['update', `update public.system_settings set value = '"2026-12-31"'::jsonb where key = '${CHAVE}'`],
        ['insert', `insert into public.system_settings (key, value) values ('x','1'::jsonb)`],
        ['delete', `delete from public.system_settings where key = '${CHAVE}'`],
        ['truncate', `truncate public.system_settings`],
      ] as const) {
        const m = await recusaSemEfeito(() =>
          db.asUser(ID.uAdmin, (tx) => tx.query(sql)));
        expect(`${nome}: ${m}`).toMatch(/permission denied for table system_settings/);
      }
      expect(await valorCru()).toBeNull();
    });

    it('o ADMIN configura pela RPC, e `updated_by` é DERIVADO, não escolhido', async () => {
      await configurar(30);
      const r = await db.query<{ by: string; at: string; v: unknown }>(
        `select updated_by::text as by, updated_at::text as at, value as v
           from public.system_settings where key = $1`, [CHAVE]);
      expect(r[0].by).toBe(ID.uAdmin);
      expect(r[0].v).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      await configurar(null);
      expect(await valorCru()).toBeNull();
    });

    it('a trilha registra a configuração, com o valor de antes e o de depois', async () => {
      await configurar(30);
      const log = await db.query<{ ev: string; obj: string; actor: string; meta: Record<string, unknown> }>(
        `select event as ev, object_id as obj, actor_user_id::text as actor, metadata as meta
           from public.audit_logs where event = 'weekly_audit_cutover_set'
          order by created_at desc limit 1`);
      expect(log[0].ev).toBe('weekly_audit_cutover_set');
      expect(log[0].obj).toBe(CHAVE);
      expect(log[0].actor).toBe(ID.uAdmin);
      expect(log[0].meta.from).toBeNull();
      expect(log[0].meta.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      await configurar(null);
      expect(await valorCru()).toBeNull();
    });

    it('gravar data já vencida exige confirmação explícita — e a recusa não grava nada', async () => {
      const m = await recusaSemEfeito(() => configurar(-1, false));
      expect(m).toMatch(/^data de cutover em \d{2}\/\d{2}\/\d{4} ja estaria vencida: ativar exige confirmacao explicita$/);
      expect(await valorCru()).toBeNull();

      // Com a confirmação, grava. E volta a nulo em seguida.
      await configurar(-1, true);
      expect(await valorCru()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await configurar(null);
      expect(await valorCru()).toBeNull();
    });

    it('desativar NUNCA exige confirmação, e é idempotente', async () => {
      await configurar(null);
      await configurar(null);
      expect(await valorCru()).toBeNull();
    });

    it('a RPC de escrita não aceita ator como parâmetro', async () => {
      const r = await db.query<{ args: string }>(`
        select pg_get_function_identity_arguments(p.oid) as args
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='admin_set_weekly_audit_cutover'`);
      expect(r[0].args).not.toMatch(/p_(actor|actor_id|user_id|uid|role|region)\b/);
      expect(r[0].args).toBe('p_date date, p_confirm_retroactive boolean');
    });
  });

  // =========================================================================
  // F · SEGURANÇA ESTRUTURAL
  // =========================================================================
  describe('F · estrutura', () => {
    it('RLS habilitada E FORÇADA, e nenhuma policy de escrita', async () => {
      const t = await db.query<{ rls: boolean; forced: boolean }>(`
        select relrowsecurity as rls, relforcerowsecurity as forced
          from pg_class where oid = 'public.system_settings'::regclass`);
      expect(t[0]).toEqual({ rls: true, forced: true });

      const p = await db.query<{ cmd: string }>(
        `select cmd from pg_policies where schemaname='public' and tablename='system_settings'`);
      expect(p.map((x) => x.cmd)).toEqual(['SELECT']);
    });

    it('`anon` e `PUBLIC` sem grant algum na tabela', async () => {
      const g = await db.query<{ grantee: string; priv: string }>(`
        select grantee, privilege_type as priv from information_schema.role_table_grants
         where table_schema='public' and table_name='system_settings' order by grantee, priv`);
      expect(g.filter((x) => x.grantee === 'anon')).toEqual([]);
      expect(g.filter((x) => x.grantee === 'PUBLIC')).toEqual([]);
      // `authenticated` com EXATAMENTE select — o padrão pós-O-17.
      expect(g.filter((x) => x.grantee === 'authenticated').map((x) => x.priv)).toEqual(['SELECT']);
    });

    it('as funções novas são `security definer` com search_path fixo e dono conhecido', async () => {
      const r = await db.query<{ n: string; sec: boolean; cfg: string; owner: string }>(`
        select p.proname n, p.prosecdef sec, array_to_string(p.proconfig,',') cfg,
               pg_get_userbyid(p.proowner) owner
          from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where p.proname in ('get_system_settings','admin_set_weekly_audit_cutover',
                             'weekly_audit_cutover_date','guard_system_setting_write',
                             'start_evaluation','start_evaluation_legacy')
         order by p.proname`);
      expect(r.length).toBe(6);
      for (const f of r) {
        expect(`${f.n}.secdef`).toBe(`${f.n}.secdef`);
        expect(f.sec).toBe(true);
        expect(f.cfg).toBe('search_path=public, app');
      }
      expect(new Set(r.map((x) => x.owner)).size).toBe(1);
    });

    it('nenhuma função nova é executável por anon ou PUBLIC', async () => {
      const r = await db.query<{ n: string; a: boolean; b: boolean }>(`
        select p.proname n,
               has_function_privilege('anon', p.oid,'EXECUTE') a,
               has_function_privilege('public', p.oid,'EXECUTE') b
          from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where p.proname in ('get_system_settings','admin_set_weekly_audit_cutover',
                             'weekly_audit_cutover_date','start_evaluation','start_evaluation_legacy')`);
      for (const f of r) expect(`${f.n}=${f.a}${f.b}`).toBe(`${f.n}=falsefalse`);
    });
  });

  // =========================================================================
  // G · O ESTADO FINAL — o cutover termina DESATIVADO
  // =========================================================================
  describe('G · estado final', () => {
    it('sobre um banco recém-migrado, o valor é JSON null e nenhuma trilha de configuração existe', async () => {
      // `beforeEach` já reaplicou todas as migrations sobre um banco limpo.
      // Este caso é a prova pedida pelo §35 do escopo: não basta afirmar.
      const r = await db.query<{ v: unknown; tipo: string; n: number }>(`
        select (select value from public.system_settings where key = '${CHAVE}') as v,
               (select jsonb_typeof(value) from public.system_settings where key = '${CHAVE}') as tipo,
               (select count(*)::int from public.audit_logs
                 where event = 'weekly_audit_cutover_set') as n`);
      expect(r[0].tipo).toBe('null');
      expect(r[0].v).toBeNull();
      expect(r[0].n).toBe(0);
    });

    it('a leitura server-side declara o fluxo semanal ABERTO', async () => {
      const s = await rpc<{ weeklyAuditCutoverDate: string | null; weeklyAuditClosed: boolean }>(
        ID.uGcA, `select public.get_system_settings() as r`);
      expect(s.weeklyAuditCutoverDate).toBeNull();
      expect(s.weeklyAuditClosed).toBe(false);
    });

    it('nenhuma migration grava data: só a semente escreve nesta chave', async () => {
      const r = await db.query<{ n: number }>(`
        select count(*)::int as n from public.system_settings
         where key = '${CHAVE}' and jsonb_typeof(value) <> 'null'`);
      expect(r[0].n).toBe(0);
    });
  });
});
