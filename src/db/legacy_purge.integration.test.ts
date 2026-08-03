/**
 * AAPEx 1.3.5 — FASE 12-B: expurgo do modelo legado (0052).
 *
 * O QUE ESTE ARQUIVO PRECISA GARANTIR. O proprietário decidiu, em 02/08/2026,
 * tirar o modelo legado de operação e começar com zero dado operacional de
 * avaliação. Apagar dado em produção é irreversível, então a RPC precisa
 * **recusar mais do que aceita**, e a trilha precisa sobreviver ao expurgo.
 *
 * A ASSIMETRIA QUE IMPORTA. `evaluation_answers`, `evidence_files`,
 * `evaluation_criteria` e `evaluation_criterion_answers` têm `on delete
 * cascade`. Já `official_snapshots`, `diagnoses` e `validations` **não têm** —
 * uma delas povoada faria o delete estourar no meio. Por isso a recusa vem
 * ANTES, com a contagem na mensagem, e é isso que os casos de recusa medem.
 *
 * A TRILHA NÃO PODE SUMIR. `audit_logs.object_id` é `text` SEM FK: os eventos
 * das avaliações apagadas permanecem. Se alguém um dia puser uma FK ali, o
 * caso "a trilha anterior sobrevive" fica vermelho — e é para isso que ele
 * existe.
 *
 * Dados 100% SINTÉTICOS. Nenhum ambiente remoto é tocado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

describe('Fase 12-B — expurgo do modelo legado (0052)', () => {
  let db: TestDb;

  const rpc = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    db.asUser(userId, (tx) => tx.query<{ r: T }>(sql, params)).then((x) => x[0]?.r);

  const MOTIVO = 'expurgo autorizado — backup producao-pre-135-ativacao verificado';

  const purgar = (userId: string, motivo = MOTIVO) =>
    rpc<Record<string, unknown>>(userId, `select public.admin_purge_legacy_evaluations($1) as r`, [motivo]);

  /** Erro devolvido, e a garantia de que NADA mudou junto. */
  const recusaSemEfeito = async (acao: () => Promise<unknown>) => {
    const antes = await contagens();
    let msg = '';
    try { await acao(); } catch (e) { msg = (e as Error).message; }
    expect(msg).not.toBe('');
    expect(await contagens()).toEqual(antes);
    return msg;
  };

  const contagens = async () => {
    const r = await db.query<{ j: Record<string, number> }>(`
      select jsonb_build_object(
        'evaluations', (select count(*) from public.evaluations),
        'answers',     (select count(*) from public.evaluation_answers),
        'snapshots',   (select count(*) from public.official_snapshots),
        'plans',       (select count(*) from public.action_plans),
        'operations',  (select count(*) from public.operations),
        'items',       (select count(*) from public.audit_items),
        'indicators',  (select count(*) from public.indicator_definitions)
      ) as j`);
    return r[0].j;
  };

  const trilha = async (evento: string) => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from public.audit_logs where event = $1`, [evento]);
    return r[0].n;
  };

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await db.reset(); await seedScenario(db); });

  /**
   * A fixture semeia `evalA` em `submitted` de propósito, para os testes de
   * fluxo. O expurgo recusa qualquer avaliação fora de rascunho — então o
   * cenário de EFEITO precisa primeiro rebaixá-la a rascunho, reproduzindo o
   * estado real de produção, onde as 5 avaliações estavam TODAS em `draft`.
   * Fazer isso pelo caminho administrativo direto é legítimo aqui: é montagem
   * de cenário, não exercício da regra sob teste.
   */
  const soRascunhos = () =>
    db.exec(`update public.evaluations set status='draft', submitted_at=null where status <> 'draft'`);

  // =========================================================================
  // A · QUEM PODE
  // =========================================================================
  describe('A · autorização', () => {
    it('anon não alcança a função — o grant barra antes do corpo', async () => {
      let msg = '';
      try {
        await db.asAnon((tx) => tx.query(
          `select public.admin_purge_legacy_evaluations('${MOTIVO}') as r`));
      } catch (e) { msg = (e as Error).message; }
      expect(msg).toMatch(/permission denied|permissao|denied/i);
    });

    it('Gerente de Canal é recusado, e nada é apagado', async () => {
      const m = await recusaSemEfeito(() => purgar(ID.uGcA));
      expect(m).toMatch(/apenas administrador executa o expurgo/);
    });

    it('Coordenador é recusado', async () => {
      const m = await recusaSemEfeito(() => purgar(ID.uCoord1));
      expect(m).toMatch(/apenas administrador executa o expurgo/);
    });

    it('motivo curto é recusado — sem motivo não há trilha útil', async () => {
      const m = await recusaSemEfeito(() => purgar(ID.uAdmin, 'limpeza'));
      expect(m).toMatch(/informe o motivo do expurgo/);
    });
  });

  // =========================================================================
  // B · O QUE PROTEGE O HISTÓRICO
  // =========================================================================
  describe('B · recusas que protegem perda irreversível', () => {
    it('avaliação FORA de rascunho bloqueia o expurgo inteiro', async () => {
      const ev = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      await db.exec(`update public.evaluations set status='approved' where id='${ev.id}'`);

      const m = await recusaSemEfeito(() => purgar(ID.uAdmin));
      expect(m).toMatch(/historico concluido nao se apaga/);
    });

    it('snapshot oficial bloqueia — e a recusa cita o SNAPSHOT, não o status', async () => {
      await soRascunhos();
      const ev = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      await db.exec(`
        insert into public.official_snapshots
          (evaluation_id, operation_id, period, score, template_version_id, payload, approved_by_user_id)
        select '${ev.id}', operation_id, '2026-07', 10, template_version_id, '{}'::jsonb, '${ID.uAdmin}'
          from public.evaluations where id = '${ev.id}'`);

      const m = await recusaSemEfeito(() => purgar(ID.uAdmin));
      expect(m).toMatch(/snapshot\(s\) oficial\(is\) existem/);
    });

    it('plano de ação vinculado bloqueia — e a recusa cita o PLANO', async () => {
      await soRascunhos();
      const ev = await rpc<{ id: string }>(
        ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      await db.exec(`
        insert into public.action_plans
          (evaluation_id, operation_id, description, owner_user_id, due_date, priority, status, source)
        select '${ev.id}', operation_id, 'plano sintetico', '${ID.uGcA}', current_date + 7, 'medium', 'open', 'legacy'
          from public.evaluations where id = '${ev.id}'`);

      const m = await recusaSemEfeito(() => purgar(ID.uAdmin));
      expect(m).toMatch(/plano\(s\) de acao vinculados/);
    });
  });

  // =========================================================================
  // C · O EXPURGO
  // =========================================================================
  describe('C · efeito', () => {
    it('apaga rascunhos e leva as respostas por CASCADE, sem tocar no catálogo', async () => {
      await soRascunhos();
      await rpc(ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      await rpc(ID.uGcB, `select public.start_evaluation($1,$2,$3) as r`, [ID.opB, 'weekly', ID.uGcB]);

      const antes = await contagens();
      expect(antes.evaluations).toBeGreaterThan(0);
      expect(antes.answers).toBeGreaterThan(0);

      const r = await purgar(ID.uAdmin);
      expect(r.purged).toBe(antes.evaluations);
      expect(r.evaluationsAfter).toBe(0);
      expect(r.answersAfter).toBe(0);

      const depois = await contagens();
      expect(depois.evaluations).toBe(0);
      expect(depois.answers).toBe(0);
      // O catálogo e a estrutura organizacional NÃO são tocados.
      expect(depois.operations).toBe(antes.operations);
      expect(depois.items).toBe(antes.items);
      expect(depois.indicators).toBe(antes.indicators);
    });

    it('grava o evento canônico com motivo, contagens e fuso', async () => {
      await soRascunhos();
      await rpc(ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      await purgar(ID.uAdmin);

      const r = await db.query<{ meta: Record<string, unknown>; ator: string }>(`
        select metadata as meta, actor_user_id::text as ator
          from public.audit_logs where event = 'legacy_evaluations_purged'`);
      expect(r).toHaveLength(1);
      expect(r[0].ator).toBe(ID.uAdmin);
      expect(r[0].meta.reason).toBe(MOTIVO);
      expect(r[0].meta.timezone).toBe('America/Sao_Paulo');
      expect(Number(r[0].meta.evaluationsPurged)).toBeGreaterThan(0);
      expect(String(r[0].meta.purgedIds)).not.toBe('');
    });

    it('a trilha ANTERIOR sobrevive — object_id é text, sem FK', async () => {
      await soRascunhos();
      await rpc(ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      const criadas = await trilha('evaluation.created');
      expect(criadas).toBeGreaterThan(0);

      await purgar(ID.uAdmin);

      // O evento continua lá, mesmo sem a avaliação que ele descreve.
      expect(await trilha('evaluation.created')).toBe(criadas);
    });

    it('é idempotente: expurgar duas vezes não é erro, e a segunda não grava evento novo', async () => {
      await soRascunhos();
      await rpc(ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      await purgar(ID.uAdmin);
      const eventos = await trilha('legacy_evaluations_purged');

      const segunda = await purgar(ID.uAdmin);
      expect(segunda.alreadyEmpty).toBe(true);
      expect(segunda.purged).toBe(0);
      expect(await trilha('legacy_evaluations_purged')).toBe(eventos);
    });

    it('depois do expurgo, com cutover ativo, ninguém reabre o legado', async () => {
      await soRascunhos();
      await rpc(ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, 'weekly', ID.uGcA]);
      await purgar(ID.uAdmin);
      await db.asUser(ID.uAdmin, (tx) => tx.query(
        `select public.admin_set_weekly_audit_cutover((app.assisted_today())::date, true) as r`));

      for (const freq of ['weekly', 'monthly']) {
        let msg = '';
        try {
          await rpc(ID.uGcA, `select public.start_evaluation($1,$2,$3) as r`, [ID.opA, freq, ID.uGcA]);
        } catch (e) { msg = (e as Error).message; }
        expect(msg).toMatch(/modelo legado encerrado em /);
      }

      const c = await contagens();
      expect(c.evaluations).toBe(0);
      expect(c.answers).toBe(0);
    });

    it('a Gestão Assistida continua disponível depois do expurgo e do cutover', async () => {
      await soRascunhos();
      await purgar(ID.uAdmin);
      await db.asUser(ID.uAdmin, (tx) => tx.query(
        `select public.admin_set_weekly_audit_cutover((app.assisted_today())::date, true) as r`));

      const ciclo = await rpc<{ id: string }>(
        ID.uGcA, `select public.open_assisted_cycle($1,$2) as r`, [ID.opA, '2026-07-06']);
      expect(ciclo.id).toBeTruthy();
    });
  });
});
