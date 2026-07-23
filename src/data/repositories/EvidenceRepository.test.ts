import { describe, it, expect } from 'vitest';
import { LocalStore } from '../store/localStore';
import { LocalEvidenceRepository } from './EvidenceRepository';
import { LocalEvaluationsRepository } from './LocalEvaluationsRepository';
import { AppData } from '../../types';

function emptyData(): AppData {
  return { users: [], operations: [], evaluations: [], actionPlans: [], evidences: [], indicatorDefinitions: [], indicatorResults: [], visitReports: [] };
}

describe('LocalEvidenceRepository — armazenamento REAL LOCAL', () => {
  it('store marca status "local" (não trata URI temporária como definitiva)', async () => {
    const repo = new LocalEvidenceRepository(new LocalStore(emptyData()));
    const res = await repo.store({ themeId: 'T01', name: 'foto.jpg', uri: 'file://foto', type: 'photo', mimeType: 'image/jpeg' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.status).toBe('local');
  });

  it('rejeita arquivo acima do limite e tipo inválido', async () => {
    const repo = new LocalEvidenceRepository(new LocalStore(emptyData()));
    const big = await repo.store({ themeId: 'T01', name: 'g', uri: 'file://g', type: 'document', sizeBytes: 20 * 1024 * 1024 });
    expect(big.ok).toBe(false);
    const bad = await repo.store({ themeId: 'T01', name: 'x', uri: 'file://x', type: 'document', mimeType: 'application/zip' });
    expect(bad.ok).toBe(false);
  });

  it('getUrl retorna a URI local', async () => {
    const repo = new LocalEvidenceRepository(new LocalStore(emptyData()));
    const stored = await repo.store({ themeId: 'T01', name: 'd.pdf', uri: 'file://d', type: 'document', mimeType: 'application/pdf' });
    if (!stored.ok) throw new Error('store');
    const url = await repo.getUrl(stored.value.id);
    expect(url.ok).toBe(true);
    if (url.ok) expect(url.value).toBe('file://d');
  });
});

describe('EvaluationsRepository + Evidence — vínculo com o item', () => {
  it('addEvidence delega o armazenamento e vincula ao item (status local)', async () => {
    const store = new LocalStore(emptyData());
    const repo = new LocalEvaluationsRepository(store, new LocalEvidenceRepository(store));
    const start = await repo.startEvaluation('O1', 'weekly', 'U03');
    if (!start.ok) throw new Error('start');
    const themeId = start.value.answers[0].themeId;
    const added = await repo.addEvidence(start.value.id, themeId, { name: 'foto', uri: 'file://f', type: 'photo', mimeType: 'image/png' });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.status).toBe('local');
    // persistida em evidences e vinculada ao item
    expect(store.getSnapshot().evidences.some((e) => e.id === added.value.id)).toBe(true);
    const ev = await repo.getById(start.value.id);
    if (ev.ok && ev.value) expect(ev.value.answers.find((a) => a.themeId === themeId)?.evidenceIds).toContain(added.value.id);
  });
});
