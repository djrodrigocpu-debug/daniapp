import { describe, it, expect } from 'vitest';
import { appVersion, dataModeLabel } from './appVersion';

describe('appVersion (T29 — não hardcoded)', () => {
  it('não retorna a versão fixa legada 1.2.0', () => {
    expect(appVersion()).not.toBe('1.2.0');
  });
  it('deriva de configuração (fallback "dev" sem env)', () => {
    expect(typeof appVersion()).toBe('string');
    expect(appVersion().length).toBeGreaterThan(0);
  });
  it('modo de dados reflete configuração de backend', () => {
    // Sem Supabase configurado no ambiente de teste => demonstração local.
    expect(dataModeLabel()).toBe('Demonstração local');
  });
});
