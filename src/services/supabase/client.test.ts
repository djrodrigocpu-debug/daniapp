import { describe, it, expect, beforeEach } from 'vitest';
import { getSupabaseClient, __resetSupabaseClientForTest } from './client';
import { AppConfig } from '../../config/env';

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

describe('getSupabaseClient', () => {
  beforeEach(() => __resetSupabaseClientForTest());

  it('retorna null quando não configurado (modo demo)', () => {
    expect(getSupabaseClient(config({}))).toBeNull();
  });

  it('cria cliente quando configurado com URL + anon key', () => {
    const c = getSupabaseClient(
      config({ isConfigured: true, supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon' }),
    );
    expect(c).not.toBeNull();
  });

  it('reaproveita a mesma instância (singleton) para a mesma URL', () => {
    const cfg = config({ isConfigured: true, supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon' });
    expect(getSupabaseClient(cfg)).toBe(getSupabaseClient(cfg));
  });
});
