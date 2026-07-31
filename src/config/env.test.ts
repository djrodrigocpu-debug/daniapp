import { describe, it, expect } from 'vitest';
import { loadConfig, assertNoPrivilegedSecrets } from './env';

describe('env.assertNoPrivilegedSecrets (Anexo D — T03)', () => {
  it('rejeita service role key no cliente como falha crítica', () => {
    const r = assertNoPrivilegedSecrets({ SUPABASE_SERVICE_ROLE_KEY: 'super-secret' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.severity).toBe('critical');
      expect(r.error.details?.key).toBe('SUPABASE_SERVICE_ROLE_KEY');
    }
  });

  it('rejeita variações de chave privilegiada', () => {
    for (const key of ['SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_JWT_SECRET']) {
      const r = assertNoPrivilegedSecrets({ [key]: 'x' });
      expect(r.ok).toBe(false);
    }
  });

  it('aceita ambiente sem chaves privilegiadas', () => {
    const r = assertNoPrivilegedSecrets({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' });
    expect(r.ok).toBe(true);
  });
});

describe('env.loadConfig', () => {
  it('desenvolvimento sem backend degrada para não configurado (modo demo permitido)', () => {
    const r = loadConfig({ EXPO_PUBLIC_APP_ENV: 'development' }, '1.3.1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.isConfigured).toBe(false);
      expect(r.value.environment).toBe('development');
    }
  });

  it('produção sem backend é erro (não pode rodar demo em produção)', () => {
    const r = loadConfig({ EXPO_PUBLIC_APP_ENV: 'production' }, '1.3.1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('config/missing-env');
  });

  it('configuração válida marca isConfigured', () => {
    const r = loadConfig({
      EXPO_PUBLIC_APP_ENV: 'homologation',
      EXPO_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-123',
    }, '1.3.1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.isConfigured).toBe(true);
      expect(r.value.supabaseUrl).toBe('https://proj.supabase.co');
    }
  });

  it('homologação configurada expõe ambiente, isConfigured e versão da config', () => {
    const r = loadConfig({
      EXPO_PUBLIC_APP_ENV: 'homologation',
      EXPO_PUBLIC_SUPABASE_URL: 'https://plnbgdabciwygsmnyddy.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-publishable',
    }, '1.3.1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.environment).toBe('homologation');
      expect(r.value.isConfigured).toBe(true);
      expect(r.value.supabaseUrl).toBe('https://plnbgdabciwygsmnyddy.supabase.co');
      expect(r.value.appVersion).toBe('1.3.1');
    }
  });

  it('a versão exibida vem do parâmetro (manifesto), não do ambiente — D-05', () => {
    // Ainda que alguém redefina a variável antiga no ambiente, ela é ignorada:
    // era exatamente essa segunda fonte que fazia o login anunciar "2.0.0".
    const r = loadConfig(
      { EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_APP_VERSION: '2.0.0' },
      '9.9.9',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.appVersion).toBe('9.9.9');
  });

  it('URL inválida é rejeitada', () => {
    const r = loadConfig({
      EXPO_PUBLIC_APP_ENV: 'development',
      EXPO_PUBLIC_SUPABASE_URL: 'not-a-url',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    }, '1.3.1');
    expect(r.ok).toBe(false);
  });

  it('mesmo em desenvolvimento, chave privilegiada é bloqueada', () => {
    const r = loadConfig({
      EXPO_PUBLIC_APP_ENV: 'development',
      SUPABASE_SERVICE_ROLE_KEY: 'leak',
    }, '1.3.1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.severity).toBe('critical');
  });
});
