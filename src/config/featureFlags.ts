/**
 * Feature flags (Masterplan §9.3). Permitem manter, durante a transição strangler,
 * um modo demonstração isolado sem embarcar credenciais ou atalhos no build
 * corporativo. Também travam funcionalidades éticas/pendentes (§8.5 ranking).
 */
import { AppConfig } from './env';

export interface FeatureFlags {
  /** Modo demonstração local (AsyncStorage). Nunca ativo em produção. */
  demoMode: boolean;
  /** Ranking nominal — proibido no piloto (§8.5, D; Anexo D T28). */
  nominalRanking: boolean;
  /** Boas práticas com moderação (§7.9). */
  bestPractices: boolean;
  /** Exportação gerencial (§7.10) — sempre com trilha. */
  exports: boolean;
  /** MFA — depende de política aprovada (P10). */
  mfa: boolean;
}

/**
 * Deriva flags do ambiente. Produção nunca liga demoMode; ranking nominal fica
 * desligado em qualquer ambiente até decisão pós-piloto (P11).
 */
export function resolveFeatureFlags(config: AppConfig): FeatureFlags {
  const isProd = config.environment === 'production';
  return {
    demoMode: !isProd && !config.isConfigured,
    nominalRanking: false, // trava ética — não habilitar no piloto
    bestPractices: true,
    exports: true,
    mfa: isProd, // habilitado onde há backend real; GCs dependem de P10
  };
}
