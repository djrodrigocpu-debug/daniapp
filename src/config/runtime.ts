/**
 * Configuração de runtime resolvida uma única vez no boot (Masterplan §10.3).
 * Telas e contexto consomem `featureFlags`/`runtimeConfig` sem reler o ambiente.
 */
import { getRuntimeConfig } from './env';
import { manifestVersion } from './appManifest';
import { resolveFeatureFlags } from './featureFlags';

/**
 * A versão vem do manifesto do Expo (`app.json`), não do ambiente: é o único
 * ponto onde ela é resolvida, e é este objeto que a tela de login exibe (D-05).
 */
export const runtimeConfig = getRuntimeConfig(manifestVersion());
export const featureFlags = resolveFeatureFlags(runtimeConfig);
