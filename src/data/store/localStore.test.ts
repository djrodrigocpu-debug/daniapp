import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStore, STORE_KEY } from './localStore';
import { AppData } from '../../types';
import AsyncStorageMock from '../../testing/asyncStorageMock';

const seed: AppData = {
  users: [], operations: [], evaluations: [], actionPlans: [], evidences: [],
  indicatorDefinitions: [], indicatorResults: [], visitReports: [],
};

beforeEach(() => {
  (AsyncStorageMock as unknown as { __reset: () => void }).__reset();
});

describe('LocalStore', () => {
  it('inicia com o seed e sinaliza ready após init', async () => {
    const store = new LocalStore(seed, '@test:store');
    expect(store.isReady()).toBe(false);
    await store.init();
    expect(store.isReady()).toBe(true);
    expect(store.getSnapshot()).toEqual(seed);
  });

  it('update aplica transição imutável, persiste e notifica', async () => {
    const store = new LocalStore(seed, '@test:store');
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    const before = store.getSnapshot();
    store.update((prev) => ({ ...prev, operations: [...prev.operations, { id: 'O1' } as never] }));
    expect(notified).toBe(1);
    expect(store.getSnapshot()).not.toBe(before); // nova referência
    expect(store.getSnapshot().operations).toHaveLength(1);
    // persistido
    const raw = await AsyncStorageMock.getItem('@test:store');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).operations).toHaveLength(1);
  });

  it('init hidrata a partir do armazenamento existente', async () => {
    await AsyncStorageMock.setItem('@test:hydrate', JSON.stringify({ ...seed, visitReports: [{ id: 'V1' }] }));
    const store = new LocalStore(seed, '@test:hydrate');
    await store.init();
    expect(store.getSnapshot().visitReports).toHaveLength(1);
  });

  it('reset restaura o seed', async () => {
    const store = new LocalStore(seed, '@test:reset');
    store.update((prev) => ({ ...prev, users: [{ id: 'U1' } as never] }));
    expect(store.getSnapshot().users).toHaveLength(1);
    await store.reset();
    expect(store.getSnapshot()).toEqual(seed);
  });

  it('subscribe retorna unsubscribe funcional', () => {
    const store = new LocalStore(seed, '@test:unsub');
    let notified = 0;
    const unsub = store.subscribe(() => { notified += 1; });
    unsub();
    store.update((prev) => prev);
    expect(notified).toBe(0);
  });

  it('a chave padrão de store é a esperada (compat histórica)', () => {
    expect(STORE_KEY).toBe('@aace_excelencia:data:v1.2');
  });
});
