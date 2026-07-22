/**
 * Configuração de runtime resolvida uma única vez no boot (Masterplan §10.3).
 * Telas e contexto consomem `featureFlags`/`runtimeConfig` sem reler o ambiente.
 */
import { getRuntimeConfig } from './env';
import { resolveFeatureFlags } from './featureFlags';

export const runtimeConfig = getRuntimeConfig();
export const featureFlags = resolveFeatureFlags(runtimeConfig);
