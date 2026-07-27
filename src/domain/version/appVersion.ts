/**
 * Versão do aplicativo (Masterplan §7.1; Anexo D — T29: versão exibida
 * corresponde ao build). Nunca hardcoded divergente do build.
 */
import { runtimeConfig } from '../../config/runtime';

/**
 * Versão efetiva. Prioriza `EXPO_PUBLIC_APP_VERSION` (injetada no build);
 * o fallback é neutro e explicitamente "não configurado".
 */
export function appVersion(): string {
  const v = runtimeConfig.appVersion;
  return v && v !== '0.0.0' ? v : 'dev';
}

export function dataModeLabel(): string {
  return runtimeConfig.isConfigured ? 'Corporativo (Supabase)' : 'Demonstração local';
}
