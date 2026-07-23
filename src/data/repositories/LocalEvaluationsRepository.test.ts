import { describe, it, expect } from 'vitest';
import { LocalStore } from '../store/localStore';
import { LocalEvaluationsRepository } from './LocalEvaluationsRepository';
import { themes } from '../catalog';
import { AppData } from '../../types';

function emptyData(): AppData {
  return {
    users: [], operations: [], evaluations: [], actionPlans: [], evidences: [],
    indicatorDefinitions: [], indicatorResults: [], visitReports: [],
  };
}

function repo() {
  return new LocalEvaluationsRepository(new LocalStore(emptyData()));
}

async function fillComplete(r: LocalEvaluationsRepository, evalId: string) {
  const ev = (await r.getById(evalId));
  if (!ev.ok || !ev.value) throw new Error('no eval');
  for (const answer of ev.value.answers) {
    await r.saveAnswer(evalId, answer.themeId, { status: 'green' });
    const theme = themes.find((t) => t.id === answer.themeId);
    if (theme?.evidenceRequired) {
      await r.addEvidence(evalId, answer.themeId, { name: 'e', uri: 'file://e', type: 'document' });
    }
  }
}

describe('LocalEvaluationsRepository — ciclo de auditoria', () => {
  it('startEvaluation é idempotente por operação+frequência (não duplica em retry)', async () => {
    const r = repo();
    const a = await r.startEvaluation('O1', 'weekly', 'U03');
    const b = await r.startEvaluation('O1', 'weekly', 'U03');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.id).toBe(b.value.id);
    const list = await r.listByOperation('O1');
    if (list.ok) expect(list.value).toHaveLength(1);
  });

  it('saveAnswer recalcula a nota projetada', async () => {
    const r = repo();
    const start = await r.startEvaluation('O1', 'weekly', 'U03');
    if (!start.ok) throw new Error('start');
    const themeId = start.value.answers[0].themeId;
    const res = await r.saveAnswer(start.value.id, themeId, { status: 'green', measuredValue: 'ok' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.answers.find((a) => a.themeId === themeId)?.status).toBe('green');
      expect(res.value.score).toBeGreaterThan(0);
    }
  });

  it('submit bloqueia avaliação incompleta (§7.4)', async () => {
    const r = repo();
    const start = await r.startEvaluation('O1', 'weekly', 'U03');
    if (!start.ok) throw new Error('start');
    const res = await r.submit(start.value.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('validation/incomplete');
  });

  it('submit exige plano para item vermelho e conclui quando resolvido', async () => {
    const r = repo();
    const start = await r.startEvaluation('O2', 'weekly', 'U03');
    if (!start.ok) throw new Error('start');
    const evalId = start.value.id;
    await fillComplete(r, evalId);
    // Torna um item vermelho — envio deve travar por falta de plano.
    const redTheme = start.value.answers[0].themeId;
    await r.saveAnswer(evalId, redTheme, { status: 'red' });
    const blocked = await r.submit(evalId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('validation/missing-action-plan');

    // Cria o plano vinculado ao item e envia com sucesso.
    await r.saveActionPlan({
      operationId: 'O2', evaluationId: evalId, themeId: redTheme, problem: 'p', rootCause: 'c',
      action: 'a', owner: 'o', dueDate: '2026-08-01', priority: 'high', expectedEvidence: 'e', status: 'not_started',
    });
    const okSubmit = await r.submit(evalId);
    expect(okSubmit.ok).toBe(true);
    if (okSubmit.ok) expect(okSubmit.value.status).toBe('submitted');
  });

  it('submit completo (verde + evidências obrigatórias) é aceito', async () => {
    const r = repo();
    const start = await r.startEvaluation('O3', 'weekly', 'U03');
    if (!start.ok) throw new Error('start');
    await fillComplete(r, start.value.id);
    const res = await r.submit(start.value.id);
    expect(res.ok).toBe(true);
  });

  it('addEvidence/removeEvidence vinculam e desvinculam do item', async () => {
    const r = repo();
    const start = await r.startEvaluation('O4', 'weekly', 'U03');
    if (!start.ok) throw new Error('start');
    const evalId = start.value.id;
    const themeId = start.value.answers[0].themeId;
    const added = await r.addEvidence(evalId, themeId, { name: 'foto', uri: 'file://f', type: 'photo' });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    let ev = await r.getById(evalId);
    if (ev.ok && ev.value) expect(ev.value.answers.find((a) => a.themeId === themeId)?.evidenceIds).toContain(added.value.id);
    await r.removeEvidence(evalId, added.value.id);
    ev = await r.getById(evalId);
    if (ev.ok && ev.value) expect(ev.value.answers.find((a) => a.themeId === themeId)?.evidenceIds).not.toContain(added.value.id);
  });
});
