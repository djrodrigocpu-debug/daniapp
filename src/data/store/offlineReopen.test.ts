/**
 * Cobre o fluxo offline mínimo (§17): editar offline → "fechar" → reabrir →
 * rascunho preservado → sem duplicidade em nova tentativa (idempotência).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStore } from './localStore';
import { LocalEvaluationsRepository } from '../repositories/LocalEvaluationsRepository';
import { AppData } from '../../types';
import AsyncStorageMock from '../../testing/asyncStorageMock';

const KEY = '@test:offline-reopen';

function emptyData(): AppData {
  return { users: [], operations: [], evaluations: [], actionPlans: [], evidences: [], indicatorDefinitions: [], indicatorResults: [], visitReports: [] };
}

beforeEach(() => {
  (AsyncStorageMock as unknown as { __reset: () => void }).__reset();
});

describe('offline → reabrir → sem duplicidade', () => {
  it('preserva o rascunho editado após reabrir o app e não duplica o ciclo', async () => {
    // Sessão 1: abre auditoria e edita offline (persistido no "dispositivo").
    const storeA = new LocalStore(emptyData(), KEY);
    await storeA.init();
    const repoA = new LocalEvaluationsRepository(storeA);
    const start = await repoA.startEvaluation('O1', 'weekly', 'U03');
    if (!start.ok) throw new Error('start');
    const evalId = start.value.id;
    const themeId = start.value.answers[0].themeId;
    await repoA.saveAnswer(evalId, themeId, { status: 'green', measuredValue: 'ok offline' });

    // Deixa a escrita assíncrona concluir.
    await new Promise((r) => setTimeout(r, 0));

    // Sessão 2: "reabre o app" — novo store, mesma chave, hidrata do armazenamento.
    const storeB = new LocalStore(emptyData(), KEY);
    await storeB.init();
    const repoB = new LocalEvaluationsRepository(storeB);

    // Rascunho preservado, com a edição feita offline.
    const restored = await repoB.getById(evalId);
    expect(restored.ok).toBe(true);
    if (restored.ok && restored.value) {
      expect(restored.value.status).toBe('draft');
      expect(restored.value.answers.find((a) => a.themeId === themeId)?.measuredValue).toBe('ok offline');
    }

    // Reabrir a mesma auditoria NÃO cria duplicata (idempotência de ciclo).
    const reopen = await repoB.startEvaluation('O1', 'weekly', 'U03');
    if (reopen.ok) expect(reopen.value.id).toBe(evalId);
    const list = await repoB.listByOperation('O1');
    if (list.ok) expect(list.value).toHaveLength(1);
  });
});
