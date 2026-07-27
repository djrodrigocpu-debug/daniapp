import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// Aliased em `vitest.config.ts` para o mock em memória (src/testing/asyncStorageMock.ts):
// é exatamente o mesmo módulo que `client.ts` importa, então a identidade pode
// ser comparada com `toBe` sem tocar no AsyncStorage real.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient, __resetSupabaseClientForTest } from './client';
import { AppConfig } from '../../config/env';

const createClientMock = vi.hoisted(() =>
  vi.fn((_url: string, _key: string, _options?: unknown) => ({}) as Record<string, unknown>),
);

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

function config(partial: Partial<AppConfig>): AppConfig {
  return {
    environment: 'development',
    supabaseUrl: null,
    supabaseAnonKey: null,
    isConfigured: false,
    appVersion: '0.0.0',
    ...partial,
  };
}

function configured(): AppConfig {
  return config({ isConfigured: true, supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon' });
}

/** Opções de `auth` da última chamada a `createClient`. */
function lastAuthOptions(): Record<string, unknown> {
  const calls = createClientMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const options = calls[calls.length - 1][2] as { auth?: Record<string, unknown> } | undefined;
  expect(options?.auth).toBeDefined();
  return options?.auth as Record<string, unknown>;
}

// O ambiente do vitest é `node`: `document` não existe, ou seja o runtime nativo
// é o estado padrão. O web é simulado injetando `document` no globalThis.
const globalWithDocument = globalThis as unknown as { document?: unknown };
const hadDocument = 'document' in globalWithDocument;

function simulateWebRuntime(): void {
  globalWithDocument.document = {};
}

describe('getSupabaseClient', () => {
  beforeEach(() => {
    __resetSupabaseClientForTest();
    createClientMock.mockClear();
    delete globalWithDocument.document;
  });

  afterEach(() => {
    delete globalWithDocument.document;
  });

  it('não vaza `document` entre os testes', () => {
    expect(hadDocument).toBe(false);
    expect(typeof document).toBe('undefined');
  });

  describe('sem configuração', () => {
    it('retorna null e não cria cliente algum', () => {
      expect(getSupabaseClient(config({}))).toBeNull();
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('retorna null quando falta a anon key', () => {
      expect(getSupabaseClient(config({ isConfigured: true, supabaseUrl: 'https://proj.supabase.co' }))).toBeNull();
      expect(createClientMock).not.toHaveBeenCalled();
    });
  });

  describe('runtime web (document presente)', () => {
    it('não passa `storage` — preserva o localStorage padrão do auth-js', () => {
      simulateWebRuntime();
      getSupabaseClient(configured());
      const auth = lastAuthOptions();
      expect(Object.prototype.hasOwnProperty.call(auth, 'storage')).toBe(false);
      expect(auth.storage).toBeUndefined();
    });

    it('mantém as demais opções de sessão', () => {
      simulateWebRuntime();
      getSupabaseClient(configured());
      const auth = lastAuthOptions();
      expect(auth.persistSession).toBe(true);
      expect(auth.autoRefreshToken).toBe(true);
      expect(auth.detectSessionInUrl).toBe(false);
    });

    it('repassa URL e anon key da configuração', () => {
      simulateWebRuntime();
      getSupabaseClient(configured());
      expect(createClientMock).toHaveBeenCalledWith('https://proj.supabase.co', 'anon', expect.anything());
    });
  });

  describe('runtime nativo (document ausente)', () => {
    it('usa o AsyncStorage como storage da sessão', () => {
      getSupabaseClient(configured());
      const auth = lastAuthOptions();
      expect(Object.prototype.hasOwnProperty.call(auth, 'storage')).toBe(true);
      expect(auth.storage).toBe(AsyncStorage);
    });

    it('mantém as demais opções de sessão', () => {
      getSupabaseClient(configured());
      const auth = lastAuthOptions();
      expect(auth.persistSession).toBe(true);
      expect(auth.autoRefreshToken).toBe(true);
      expect(auth.detectSessionInUrl).toBe(false);
    });
  });

  describe('singleton', () => {
    it('cria uma única instância e a reaproveita para a mesma URL', () => {
      const cfg = configured();
      const first = getSupabaseClient(cfg);
      const second = getSupabaseClient(cfg);
      expect(first).not.toBeNull();
      expect(second).toBe(first);
      expect(createClientMock).toHaveBeenCalledTimes(1);
    });
  });
});
