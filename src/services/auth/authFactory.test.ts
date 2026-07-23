/**
 * Testes da fábrica de autenticação (§8): garante que produção sem Supabase NÃO
 * cai em modo demo e que o demo só existe em desenvolvimento (T30).
 */
import { describe, it, expect } from 'vitest';
import { createAuthBackend, selectAuthMode, NullAuthRepository } from './authFactory';
import { DemoAuthRepository } from './DemoAuthRepository';
import { SupabaseAuthRepository } from '../supabase/SupabaseAuthRepository';
import { AppConfig } from '../../config/env';
import type { SupabaseClient } from '@supabase/supabase-js';

const base = (env: AppConfig['environment'], configured: boolean): AppConfig => ({
  environment: env,
  supabaseUrl: configured ? 'https://x.supabase.co' : null,
  supabaseAnonKey: configured ? 'anon' : null,
  isConfigured: configured,
  appVersion: '2.0.0',
});

const fakeClient = {} as SupabaseClient;

describe('authFactory — seleção de backend por ambiente', () => {
  it('dev sem Supabase → demo', () => {
    const { repository, mode } = createAuthBackend(base('development', false), null);
    expect(mode).toBe('demo');
    expect(repository).toBeInstanceOf(DemoAuthRepository);
  });

  it('produção sem Supabase → NÃO usa demo (login impossível)', () => {
    const { repository, mode } = createAuthBackend(base('production', false), null);
    expect(mode).toBe('unconfigured');
    expect(repository).toBeInstanceOf(NullAuthRepository);
  });

  it('homologação sem Supabase → unconfigured, nunca demo', () => {
    expect(selectAuthMode(base('homologation', false), null)).toBe('unconfigured');
  });

  it('configurado com cliente → Supabase (autoritativo)', () => {
    const { repository, mode } = createAuthBackend(base('production', true), fakeClient);
    expect(mode).toBe('supabase');
    expect(repository).toBeInstanceOf(SupabaseAuthRepository);
  });

  it('NullAuthRepository recusa login com orientação de configuração', async () => {
    const res = await new NullAuthRepository().signIn();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/não configurada|Supabase/i);
  });
});
