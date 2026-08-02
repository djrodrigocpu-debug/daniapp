/**
 * AAPEx 1.3.5 — GATE 0: achado **O-18**, a distinção herdada entre *"a avaliação
 * não existe"* e *"você não tem permissão"*.
 *
 * O QUE ESTE ARQUIVO MEDE. Três RPCs do caminho legado — `submit_evaluation`,
 * `remove_evidence` e `reserve_evidence_upload` — respondiam com frases
 * **diferentes** conforme o objeto existisse:
 *
 *   UUID que não existe em lugar nenhum  ->  "avaliacao inexistente"
 *   UUID que existe FORA do alcance      ->  "sem permissao"
 *
 * Varrer UUIDs, portanto, separava o que existe do que não existe — para um
 * chamador que não alcança nenhum dos dois. É o mesmo vazamento do O-16 com
 * metade da informação (o modelo não é revelado), e é **anterior à 1.3.5**:
 * vem de 0006, 0025, 0027 e 0028.
 *
 * O CONTRATO QUE PASSA A VALER. Uma frase só — `avaliacao inexistente ou fora do
 * escopo` —, a mesma que 0031 e 0035 já adotavam, com o mesmo SQLSTATE, e **sem
 * um efeito colateral sequer** em nenhum dos caminhos de recusa.
 *
 * O QUE ESTE ARQUIVO TAMBÉM MEDE, e é metade do trabalho: que **quem alcança**
 * o objeto continua recebendo exatamente o que recebia antes. Uniformizar a
 * recusa não pode custar a mensagem empresarial de quem tem direito a ela.
 *
 * Dados 100% SINTÉTICOS. Nenhum ambiente remoto é tocado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, anexarEvidencia, ID } from './testing/fixtures';

/** A frase única. Literal, para que mudá-la exija mudar este arquivo. */
const UNIFORME = 'avaliacao inexistente ou fora do escopo';

/** UUID que não existe em tabela nenhuma. */
const NADA = '00000000-0000-0000-0000-0000dead0018';

/** Catálogo mínimo para uma Auditoria Mensal real na região do cenário base. */
const G0 = {
  theme: '00000000-0000-0000-0000-000000180001',
  themeV: '00000000-0000-0000-0000-000000180002',
  def: '00000000-0000-0000-0000-000000180011',
  ver: '00000000-0000-0000-0000-000000180012',
  cfg: '00000000-0000-0000-0000-000000180021',
  cfgV: '00000000-0000-0000-0000-000000180022',
  crit: '00000000-0000-0000-0000-000000180031',
  critV: '00000000-0000-0000-0000-000000180032',
  /** Avaliação LEGADA de opA, em rascunho — o alvo dos testes de evidência. */
  draftA: '00000000-0000-0000-0000-000000180041',
} as const;

interface Recusa { msg: string; code: unknown }

describe('O-18 — recusa uniforme para inexistente e fora do escopo no caminho legado', () => {
  let db: TestDb;
  /** Auditoria mensal de opA (modelo `monthly_criteria`), autorada pelo GC A. */
  let auditA: string;
  /** Evidência anexada pelo GC A à avaliação em rascunho de opA. */
  let evidA: { evidenceId: string };

  /**
   * Retrato do banco nos campos que qualquer escrita parcial mexeria. Serve para
   * provar que a recusa não teve efeito — receber exceção não é prova de que
   * nada aconteceu.
   */
  const retrato = async () => {
    const r = await db.query<{ j: Record<string, unknown> }>(`
      select jsonb_build_object(
        'evaluations',  (select count(*) from public.evaluations),
        'answers',      (select count(*) from public.evaluation_answers),
        'critAnswers',  (select count(*) from public.evaluation_criterion_answers),
        'evidences',    (select count(*) from public.evidence_files),
        'evidLinks',    (select count(*) from public.evaluation_answer_evidence),
        'critLinks',    (select count(*) from public.evaluation_criterion_answer_evidence),
        'reservations', (select count(*) from public.evidence_upload_reservations),
        'snapshots',    (select count(*) from public.official_snapshots),
        'validations',  (select count(*) from public.validations),
        'plans',        (select count(*) from public.action_plans),
        'auditLogs',    (select count(*) from public.audit_logs),
        'objects',      (select count(*) from storage.objects),
        'evalState',    (select coalesce(string_agg(
                            id::text||':'||status||':'||row_version::text
                            ||':'||coalesce(submitted_at::text,'-')
                            ||':'||coalesce(approved_at::text,'-')
                            ||':'||updated_at::text, '|' order by id), '')
                          from public.evaluations),
        'evidState',    (select coalesce(string_agg(
                            id::text||':'||status||':'||path, '|' order by id), '')
                          from public.evidence_files)
      ) as j`);
    return r[0].j;
  };

  /** Executa, exige recusa, devolve mensagem e SQLSTATE, e prova retrato idêntico. */
  const recusaSemEfeito = async (fn: () => Promise<unknown>): Promise<Recusa> => {
    const antes = await retrato();
    let msg = '';
    let code: unknown;
    try {
      await fn();
      throw new Error('ESPERAVA RECUSA, mas a operação foi permitida');
    } catch (e) {
      msg = (e as Error).message;
      if (msg.startsWith('ESPERAVA RECUSA')) throw e;
      code = (e as { code?: unknown }).code;
    }
    expect(await retrato()).toEqual(antes);
    return { msg, code };
  };

  const rpc = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    db.asUser(userId, (tx) => tx.query<{ r: T }>(sql, params)).then((x) => x[0]?.r);

  const ENTRADA = JSON.stringify({
    name: 'comprovacao.jpg', mimeType: 'image/jpeg', type: 'photo', sizeBytes: 1024,
  });

  beforeAll(async () => { db = await createTestDb(); }, 60_000);
  afterAll(async () => db.close());

  beforeEach(async () => {
    await db.reset();
    await seedScenario(db);

    // Catálogo regional mínimo, publicado e vigente, para que
    // `start_monthly_audit` tenha o que materializar.
    await db.exec(`
      insert into public.themes (id, code, scope_kind, region_id, lifecycle, created_by) values
        ('${G0.theme}','TEMA-O18','global',null,'active','${ID.uAdmin}');
      insert into public.theme_versions (id, theme_id, version_number, name, sort_order, status, active) values
        ('${G0.themeV}','${G0.theme}',1,'Tema O-18',1,'published',true);

      insert into public.indicator_definitions (id, code, name, lifecycle, scope_kind) values
        ('${G0.def}','IND-O18','Indicador O-18','active','global');
      insert into public.indicator_versions
        (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, name, status) values
        ('${G0.ver}','${G0.def}',1,'%','higher_better',0,0,1,'Indicador O-18','published');

      insert into public.indicator_regional_configs (id, region_id, indicator_definition_id, created_by) values
        ('${G0.cfg}','${ID.region}','${G0.def}','${ID.uAdmin}');
      insert into public.audit_criteria (id, config_id, code, lifecycle, created_by) values
        ('${G0.crit}','${G0.cfg}','CRIT-O18','active','${ID.uAdmin}');
      insert into public.audit_criteria_versions
        (id, criterion_id, version_number, question, description, guidance, sort_order,
         required, evidence_required, allows_na, requires_justification, status, active) values
        ('${G0.critV}','${G0.crit}',1,'A rotina existe?','','',1,true,false,false,false,'published',true);
      insert into public.indicator_regional_config_versions
        (id, config_id, version_number, indicator_version_id, theme_version_id, sort_order,
         target, tolerance, weight, active, include_in_assisted_management, include_in_monthly_audit, status) values
        ('${G0.cfgV}','${G0.cfg}',1,'${G0.ver}','${G0.themeV}',1,80,5,1,true,true,true,'published');

      -- Avaliação LEGADA de opA em RASCUNHO: é a janela em que anexar e remover
      -- evidência são permitidos, e portanto a única em que o teste de evidência
      -- mede autorização, e não estado.
      insert into public.evaluations
        (id, operation_id, template_version_id, author_user_id, status, evaluation_model) values
        ('${G0.draftA}','${ID.opA}','${ID.templateV1}','${ID.uGcA}','draft','legacy_template');
      insert into public.evaluation_answers (evaluation_id, item_id, status, measured_value, observation)
      values ('${G0.draftA}','${ID.itemRed}','not_evaluated','','');
    `);

    const a = await rpc<{ id: string }>(
      ID.uGcA, `select public.start_monthly_audit($1,$2) as r`, [ID.opA, '2026-07']);
    auditA = a.id;

    evidA = await anexarEvidencia(db, {
      userId: ID.uGcA, evaluationId: G0.draftA, themeId: 'I01',
    });
  }, 60_000);

  // =========================================================================
  // A · submit_evaluation
  // =========================================================================
  describe('A · submit_evaluation', () => {
    it('UUID inexistente e avaliação LEGADA fora do escopo dão a MESMA frase e o MESMO SQLSTATE', async () => {
      const inexistente = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [NADA]));
      const foraDoEscopo = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [G0.draftA]));

      expect(inexistente.msg).toBe(UNIFORME);
      expect(foraDoEscopo.msg).toBe(UNIFORME);
      expect(foraDoEscopo.code).toEqual(inexistente.code);
    });

    it('auditoria MENSAL fora do escopo é indistinguível do inexistente — e não revela o modelo', async () => {
      const inexistente = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [NADA]));
      const mensalAlheia = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [auditA]));

      expect(mensalAlheia.msg).toBe(inexistente.msg);
      expect(mensalAlheia.code).toEqual(inexistente.code);
      expect(mensalAlheia.msg).not.toContain('criterios');
      expect(mensalAlheia.msg).not.toContain('monthly');
    });

    it('avaliação legada ALHEIA e auditoria mensal ALHEIA respondem igual entre si', async () => {
      const legada = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [ID.evalA]));
      const mensal = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.submit_evaluation($1) as r`, [auditA]));
      expect(legada.msg).toBe(mensal.msg);
    });

    it('quem ALCANÇA a operação continua distinguindo — e isso não é vazamento', async () => {
      // A fronteira uniformizada é o ESCOPO, e só ele. O coordenador da
      // coordenadoria 1 alcança `opA`: ele não é o autor, e continua recebendo
      // `sem permissao`. Não há o que vazar — a RLS já lhe entrega a linha, como
      // a segunda metade deste teste prova. Uniformizar aqui não fecharia buraco
      // nenhum e apagaria uma mensagem de quem tem direito a ela.
      const r = await recusaSemEfeito(() =>
        rpc(ID.uCoord1, `select public.submit_evaluation($1) as r`, [G0.draftA]));
      expect(r.msg).toBe('sem permissao');

      const visivel = await db.asUser(ID.uCoord1, (tx) =>
        tx.query<{ n: number }>(`select count(*)::int as n from public.evaluations where id = $1`,
          [G0.draftA]));
      expect(visivel[0].n).toBe(1);
    });

    it('quem NÃO alcança a operação não vê a linha por RLS — e por isso a recusa tem de ser uniforme', async () => {
      const invisivel = await db.asUser(ID.uGcB, (tx) =>
        tx.query<{ n: number }>(`select count(*)::int as n from public.evaluations where id = $1`,
          [G0.draftA]));
      expect(invisivel[0].n).toBe(0);
    });

    it('usuário SEM escopo nenhum recebe a mesma frase, exista ou não o objeto', async () => {
      const a = await recusaSemEfeito(() =>
        rpc(ID.uNoScope, `select public.submit_evaluation($1) as r`, [G0.draftA]));
      const b = await recusaSemEfeito(() =>
        rpc(ID.uNoScope, `select public.submit_evaluation($1) as r`, [NADA]));
      expect(a.msg).toBe(UNIFORME);
      expect(b.msg).toBe(UNIFORME);
    });
  });

  // =========================================================================
  // B · remove_evidence
  // =========================================================================
  describe('B · remove_evidence', () => {
    it('UUID inexistente e avaliação alheia dão a MESMA frase, e a evidência continua onde estava', async () => {
      const inexistente = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.remove_evidence($1,$2) as r`, [NADA, evidA.evidenceId]));
      const foraDoEscopo = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.remove_evidence($1,$2) as r`, [G0.draftA, evidA.evidenceId]));

      expect(inexistente.msg).toBe(UNIFORME);
      expect(foraDoEscopo.msg).toBe(UNIFORME);
      expect(foraDoEscopo.code).toEqual(inexistente.code);
    });

    it('o coordenador de OUTRA coordenadoria — que não alcança opA — recebe a frase uniforme', async () => {
      const r = await recusaSemEfeito(() =>
        rpc(ID.uCoord2, `select public.remove_evidence($1,$2) as r`, [G0.draftA, evidA.evidenceId]));
      expect(r.msg).toBe(UNIFORME);
    });

    it('o coordenador que ALCANÇA a operação continua recebendo `sem permissao` — a autoria não é o vazamento', async () => {
      const r = await recusaSemEfeito(() =>
        rpc(ID.uCoord1, `select public.remove_evidence($1,$2) as r`, [G0.draftA, evidA.evidenceId]));
      expect(r.msg).toBe('sem permissao');
    });

    it('a trava `for update` continua sendo tomada no PONTO DE ENTRADA, antes de qualquer decisão', async () => {
      const d = await db.query<{ d: string }>(
        `select pg_get_functiondef('public.remove_evidence(uuid,uuid)'::regprocedure) as d`);
      expect(d[0].d).toMatch(/from public\.evaluations[\s\S]*?for update/i);
      // E a trava vem ANTES da decisão de escopo, senão não serializa nada.
      expect(d[0].d.indexOf('for update')).toBeLessThan(d[0].d.indexOf('fora do escopo'));
    });

    it('sem sessão a função nem é alcançável — o grant barra antes do corpo', async () => {
      const e = await db.asAnon((tx) =>
        tx.expectError(`select public.remove_evidence($1,$2)`, [G0.draftA, evidA.evidenceId]));
      expect(e.message).toMatch(/permission denied for function remove_evidence/);
    });
  });

  // =========================================================================
  // C · reserve_evidence_upload
  // =========================================================================
  describe('C · reserve_evidence_upload', () => {
    it('UUID inexistente e avaliação alheia dão a MESMA frase, e nenhuma reserva nasce', async () => {
      const inexistente = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.reserve_evidence_upload($1,$2,$3::jsonb) as r`,
          [NADA, 'I01', ENTRADA]));
      const foraDoEscopo = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.reserve_evidence_upload($1,$2,$3::jsonb) as r`,
          [G0.draftA, 'I01', ENTRADA]));

      expect(inexistente.msg).toBe(UNIFORME);
      expect(foraDoEscopo.msg).toBe(UNIFORME);
      expect(foraDoEscopo.code).toEqual(inexistente.code);
    });

    it('auditoria MENSAL alheia também é indistinguível do inexistente', async () => {
      const inexistente = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.reserve_evidence_upload($1,$2,$3::jsonb) as r`,
          [NADA, 'CRIT-O18', ENTRADA]));
      const mensalAlheia = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.reserve_evidence_upload($1,$2,$3::jsonb) as r`,
          [auditA, 'CRIT-O18', ENTRADA]));
      expect(mensalAlheia.msg).toBe(inexistente.msg);
      expect(mensalAlheia.msg).not.toContain('criterio');
    });

    it('a recusa acontece ANTES da validação de tipo e tamanho — nada do payload é confirmado', async () => {
      // Payload deliberadamente inválido (tipo proibido, tamanho zero). Se a
      // ordem estivesse errada, a mensagem falaria do arquivo — e confirmaria,
      // por omissão, que a avaliação existe.
      const r = await recusaSemEfeito(() =>
        rpc(ID.uGcB, `select public.reserve_evidence_upload($1,$2,$3::jsonb) as r`,
          [G0.draftA, 'I01', JSON.stringify({ name: 'x.exe', mimeType: 'application/x-msdownload', sizeBytes: 0 })]));
      expect(r.msg).toBe(UNIFORME);
    });
  });

  // =========================================================================
  // D · NÃO-REGRESSÃO — quem alcança continua recebendo o que recebia
  // =========================================================================
  describe('D · o caminho autorizado não muda', () => {
    it('o autor envia a avaliação legada em rascunho, e o fluxo é o de sempre', async () => {
      await db.exec(`update public.evaluation_answers
                        set status = 'green', measured_value = '1'
                      where evaluation_id = '${G0.draftA}'`);
      // A evidência obrigatória do item I01 já foi anexada no `beforeEach`.
      const dto = await rpc<{ status: string }>(
        ID.uGcA, `select public.submit_evaluation($1) as r`, [G0.draftA]);
      expect(dto.status).toBe('submitted');
    });

    it('o autor que alcança a auditoria MENSAL continua recebendo a fronteira de modelo', async () => {
      const e = await db.asUser(ID.uGcA, (tx) =>
        tx.expectError(`select public.submit_evaluation($1)`, [auditA]));
      expect(e.message).toBe('esta auditoria segue o modelo por criterios: use submit_monthly_audit');
    });

    it('o autor recebe a mensagem de ESTADO quando a avaliação já foi enviada', async () => {
      const e = await db.asUser(ID.uGcA, (tx) =>
        tx.expectError(`select public.submit_evaluation($1)`, [ID.evalA]));
      expect(e.message).toBe('avaliacao nao esta em rascunho/devolvida');
    });

    it('o autor remove a própria evidência em rascunho — metadata e vínculo saem juntos', async () => {
      await db.asUser(ID.uGcA, (tx) =>
        tx.query(`select public.remove_evidence($1,$2)`, [G0.draftA, evidA.evidenceId]));
      const r = await db.query<{ meta: number; vinculo: number }>(`
        select (select count(*) from public.evidence_files where id = $1)::int as meta,
               (select count(*) from public.evaluation_answer_evidence where evidence_id = $1)::int as vinculo`,
        [evidA.evidenceId]);
      expect(r[0]).toEqual({ meta: 0, vinculo: 0 });
    });

    it('o autor recebe a mensagem de ESTADO ao remover evidência de avaliação já enviada', async () => {
      await db.exec(`update public.evaluations set status = 'submitted' where id = '${G0.draftA}'`);
      const e = await db.asUser(ID.uGcA, (tx) =>
        tx.expectError(`select public.remove_evidence($1,$2)`, [G0.draftA, evidA.evidenceId]));
      expect(e.message).toMatch(/^Evidencias so podem ser removidas/);
    });

    it('o autor reserva upload no próprio rascunho, e a reserva nasce completa', async () => {
      const r = await rpc<{ reservationId: string; bucket: string; path: string }>(
        ID.uGcA, `select public.reserve_evidence_upload($1,$2,$3::jsonb) as r`,
        [G0.draftA, 'I01', ENTRADA]);
      expect(r.bucket).toBe('evidencias');
      expect(r.path.startsWith('I01/')).toBe(true);
    });

    it('o autor recebe a mensagem de ESTADO ao reservar em avaliação já enviada', async () => {
      const e = await db.asUser(ID.uGcA, (tx) =>
        tx.expectError(`select public.reserve_evidence_upload($1,$2,$3::jsonb)`,
          [ID.evalA, 'I01', ENTRADA]));
      expect(e.message).toBe('evidencia so em rascunho/devolvida');
    });

    it('o autor recebe a mensagem de ITEM quando o código não pertence à avaliação', async () => {
      const e = await db.asUser(ID.uGcA, (tx) =>
        tx.expectError(`select public.reserve_evidence_upload($1,$2,$3::jsonb)`,
          [G0.draftA, 'NAO-EXISTE', ENTRADA]));
      expect(e.message).toBe('item NAO-EXISTE nao pertence a avaliacao');
    });
  });

  // =========================================================================
  // E · O CORPO LEGADO CONTINUA SENDO O MESMO OBJETO
  // =========================================================================
  describe('E · o corpo legado não foi copiado', () => {
    it('as três RPCs delegam a uma função `app.*_legacy`, e nenhuma delas é alcançável pelo cliente', async () => {
      const r = await db.query<{ n: string; acl: string | null }>(`
        select p.proname as n, array_to_string(p.proacl,',') as acl
          from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'app'
           and p.proname in ('submit_evaluation_legacy','remove_evidence_legacy','reserve_evidence_upload_legacy')
         order by p.proname`);
      expect(r.map((x) => x.n)).toEqual([
        'remove_evidence_legacy', 'reserve_evidence_upload_legacy', 'submit_evaluation_legacy',
      ]);
      for (const f of r) {
        expect(`${f.n}: ${f.acl ?? ''}`).not.toMatch(/(^|,)(anon|authenticated)=/);
      }
    });

    it('as guardas de estado e os quatro portões continuam DENTRO da função legada', async () => {
      const r = await db.query<{ src: string }>(`
        select prosrc as src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname='app' and p.proname='submit_evaluation_legacy'`);
      const src = r[0].src;
      // As cinco guardas que a 0025 + 0027 acumularam. Se um dia alguém
      // reescrever o corpo por cópia, alguma delas cai — foi o que já aconteceu
      // uma vez, na primeira versão da 0044.
      expect(src).toContain('avaliacao nao esta em rascunho/devolvida');
      expect(src).toContain('item obrigatorio sem avaliacao');
      expect(src).toContain('evidencia obrigatoria ausente');
      expect(src).toContain('item vermelho sem plano de acao');
      expect(src).toContain('item nao aplicavel sem justificativa');
      expect(src).toContain('for update');
    });

    it('nenhuma das três funções públicas ficou executável por anon ou PUBLIC', async () => {
      const r = await db.query<{ n: string; acl: string | null }>(`
        select p.proname as n, array_to_string(p.proacl,',') as acl
          from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname='public'
           and p.proname in ('submit_evaluation','remove_evidence','reserve_evidence_upload')`);
      expect(r.length).toBe(3);
      for (const f of r) {
        expect(`${f.n}: ${f.acl ?? ''}`).not.toMatch(/(^|,)anon=/);
        expect(`${f.n}: ${f.acl ?? ''}`).not.toMatch(/(^|,)=/);
        expect(f.acl ?? '').toContain('authenticated=X');
      }
    });
  });
});
