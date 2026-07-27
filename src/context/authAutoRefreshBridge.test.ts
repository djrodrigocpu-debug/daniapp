import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  installAutoRefreshLifecycle,
  installNativeAutoRefresh,
  AppStateAdapter,
} from './authAutoRefreshBridge';

function fakeAuth() {
  return { startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn() };
}

/** `AppState` de mentira: nada de react-native real. */
function fakeAppState(initial: string | null) {
  const listeners: Array<(estado: string) => void> = [];
  const removeSpy = vi.fn();
  const addEventListener = vi.fn((_type: 'change', listener: (estado: string) => void) => {
    listeners.push(listener);
    return {
      remove: () => {
        removeSpy();
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
  });
  return {
    adapter: { currentState: initial, addEventListener } as unknown as AppStateAdapter,
    emit: (estado: string) => [...listeners].forEach((l) => l(estado)),
    listenerCount: () => listeners.length,
    addCalls: () => addEventListener.mock.calls.length,
    removeCalls: () => removeSpy.mock.calls.length,
  };
}

/** Deixa toda a microtask queue drenar (a instalação nativa é assíncrona). */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Ambiente do vitest é `node`: sem `document`, ou seja o nativo é o padrão.
const globalWithDocument = globalThis as unknown as { document?: unknown };

describe('installAutoRefreshLifecycle', () => {
  it('estado inicial active liga o refresh uma única vez', () => {
    const auth = fakeAuth();
    installAutoRefreshLifecycle(auth, fakeAppState('active').adapter);
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
  });

  it('estado inicial background desliga o refresh uma única vez', () => {
    const auth = fakeAuth();
    installAutoRefreshLifecycle(auth, fakeAppState('background').adapter);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
  });

  it('transição background → active liga o refresh', () => {
    const auth = fakeAuth();
    const appState = fakeAppState('background');
    installAutoRefreshLifecycle(auth, appState.adapter);
    auth.stopAutoRefresh.mockClear();

    appState.emit('active');
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
  });

  it('transição active → inactive desliga o refresh', () => {
    const auth = fakeAuth();
    const appState = fakeAppState('active');
    installAutoRefreshLifecycle(auth, appState.adapter);
    auth.startAutoRefresh.mockClear();

    appState.emit('inactive');
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
  });

  it('estado desconhecido desliga o refresh (na dúvida, desliga)', () => {
    for (const estado of [null, 'unknown', 'extension']) {
      const auth = fakeAuth();
      installAutoRefreshLifecycle(auth, fakeAppState(estado).adapter);
      expect(auth.startAutoRefresh).not.toHaveBeenCalled();
      expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    }
  });

  it('registra um único listener por instalação', () => {
    const appState = fakeAppState('active');
    installAutoRefreshLifecycle(fakeAuth(), appState.adapter);
    expect(appState.addCalls()).toBe(1);
    expect(appState.listenerCount()).toBe(1);
  });

  it('cleanup remove o listener e desliga o refresh', () => {
    const auth = fakeAuth();
    const appState = fakeAppState('active');
    const cleanup = installAutoRefreshLifecycle(auth, appState.adapter);
    auth.startAutoRefresh.mockClear();

    cleanup();
    expect(appState.removeCalls()).toBe(1);
    expect(appState.listenerCount()).toBe(0);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('cleanup repetido é idempotente', () => {
    const auth = fakeAuth();
    const appState = fakeAppState('active');
    const cleanup = installAutoRefreshLifecycle(auth, appState.adapter);

    cleanup();
    cleanup();
    cleanup();
    expect(appState.removeCalls()).toBe(1);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('evento posterior ao cleanup não produz efeito', () => {
    const auth = fakeAuth();
    const appState = fakeAppState('background');
    const cleanup = installAutoRefreshLifecycle(auth, appState.adapter);
    cleanup();
    auth.startAutoRefresh.mockClear();
    auth.stopAutoRefresh.mockClear();

    appState.emit('active');
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
  });

  it('rejeição do auth-js não escapa para o chamador', () => {
    const auth = {
      startAutoRefresh: vi.fn(() => Promise.reject(new Error('boom'))),
      stopAutoRefresh: vi.fn(() => Promise.reject(new Error('boom'))),
    };
    const appState = fakeAppState('active');
    expect(() => {
      const cleanup = installAutoRefreshLifecycle(auth, appState.adapter);
      appState.emit('background');
      cleanup();
    }).not.toThrow();
  });
});

describe('installNativeAutoRefresh', () => {
  beforeEach(() => {
    delete globalWithDocument.document;
  });

  afterEach(() => {
    delete globalWithDocument.document;
  });

  it('no web não carrega AppState nem mexe no refresh', async () => {
    globalWithDocument.document = {};
    const auth = fakeAuth();
    const loader = vi.fn(async () => fakeAppState('active').adapter);

    const cleanup = installNativeAutoRefresh(auth, loader);
    await flush();

    expect(loader).not.toHaveBeenCalled();
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it('sem cliente Supabase não instala nada', async () => {
    const loader = vi.fn(async () => fakeAppState('active').adapter);

    const cleanup = installNativeAutoRefresh(null, loader);
    await flush();

    expect(loader).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it('no nativo instala o ciclo de vida com o AppState carregado', async () => {
    const auth = fakeAuth();
    const appState = fakeAppState('active');

    installNativeAutoRefresh(auth, async () => appState.adapter);
    await flush();

    expect(appState.addCalls()).toBe(1);
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);

    appState.emit('background');
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('cleanup após a instalação remove o listener e desliga o refresh', async () => {
    const auth = fakeAuth();
    const appState = fakeAppState('active');

    const cleanup = installNativeAutoRefresh(auth, async () => appState.adapter);
    await flush();
    auth.startAutoRefresh.mockClear();

    cleanup();
    expect(appState.removeCalls()).toBe(1);
    expect(appState.listenerCount()).toBe(0);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);

    cleanup();
    expect(appState.removeCalls()).toBe(1);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('cleanup antes do AppState resolver cancela a instalação', async () => {
    const auth = fakeAuth();
    const appState = fakeAppState('active');

    const cleanup = installNativeAutoRefresh(auth, async () => appState.adapter);
    cleanup();
    await flush();

    expect(appState.addCalls()).toBe(0);
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
  });

  it('falha ao obter o react-native não derruba o provider', async () => {
    const auth = fakeAuth();
    const cleanup = installNativeAutoRefresh(auth, async () => null);
    await flush();

    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });
});
