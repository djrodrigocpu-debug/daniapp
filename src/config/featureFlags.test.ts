import { describe, it, expect } from 'vitest';
import { resolveFeatureFlags } from './featureFlags';
import { AppConfig } from './env';

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

describe('resolveFeatureFlags', () => {
  it('ranking nominal fica SEMPRE desligado (trava ética §8.5, T28)', () => {
    expect(resolveFeatureFlags(config({ environment: 'production', isConfigured: true })).nominalRanking).toBe(false);
    expect(resolveFeatureFlags(config({ environment: 'development' })).nominalRanking).toBe(false);
  });

  it('demoMode nunca é ligado em produção', () => {
    expect(resolveFeatureFlags(config({ environment: 'production', isConfigured: true })).demoMode).toBe(false);
    expect(resolveFeatureFlags(config({ environment: 'production', isConfigured: false })).demoMode).toBe(false);
  });

  it('demoMode ativo apenas em dev sem backend', () => {
    expect(resolveFeatureFlags(config({ environment: 'development', isConfigured: false })).demoMode).toBe(true);
    expect(resolveFeatureFlags(config({ environment: 'development', isConfigured: true })).demoMode).toBe(false);
  });
});
