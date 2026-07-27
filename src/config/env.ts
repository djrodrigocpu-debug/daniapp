/**
 * Configuração de ambiente tipada e validada (Masterplan §10.3 "Entrega",
 * §13.3 "segredo fora do Git").
 *
 * Regras:
 * - Somente variáveis públicas (`EXPO_PUBLIC_*`) chegam ao cliente.
 * - A `service role` do Supabase NUNCA é lida aqui nem embarcada no bundle
 *   (Anexo D — T03). Operações privilegiadas ocorrem em funções server-side.
 * - Ausência de configuração corporativa não quebra o app em modo demonstração
 *   local, mas é sinalizada por `isConfigured`.
 */
import { AppError } from '../domain/errors/AppError';
import { Result, ok, err } from '../domain/errors/result';

export type AppEnvironment = 'development' | 'homologation' | 'production';

export interface AppConfig {
  environment: AppEnvironment;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** true quando URL + anon key válidos estão presentes. */
  isConfigured: boolean;
  appVersion: string;
}

/** Chaves proibidas no cliente — a presença de qualquer uma é falha crítica (T03). */
const FORBIDDEN_CLIENT_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_JWT_SECRET',
];

type EnvSource = Record<string, string | undefined>;

function normalizeEnvironment(raw: string | undefined): AppEnvironment {
  switch ((raw ?? '').toLowerCase()) {
    case 'production':
    case 'prod':
      return 'production';
    case 'homologation':
    case 'homolog':
    case 'staging':
      return 'homologation';
    default:
      return 'development';
  }
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Verifica que nenhuma chave privilegiada foi exposta ao cliente.
 * Retorna erro crítico se encontrar — usado tanto em runtime quanto em teste (T03).
 */
export function assertNoPrivilegedSecrets(source: EnvSource): Result<true> {
  for (const key of FORBIDDEN_CLIENT_KEYS) {
    if (source[key] !== undefined && source[key] !== '') {
      return err(
        new AppError(
          'config/missing-env',
          'Chave privilegiada não pode existir no cliente.',
          { severity: 'critical', details: { key } },
        ),
      );
    }
  }
  return ok(true);
}

/**
 * Constrói a configuração a partir de uma fonte de ambiente (injetável para teste).
 * Em produção/homologação, a ausência de Supabase é erro; em desenvolvimento é
 * apenas um aviso (permite modo demonstração isolado).
 */
export function loadConfig(source: EnvSource): Result<AppConfig> {
  const guard = assertNoPrivilegedSecrets(source);
  if (!guard.ok) return guard;

  const environment = normalizeEnvironment(source.EXPO_PUBLIC_APP_ENV ?? source.APP_ENV);
  const rawUrl = source.EXPO_PUBLIC_SUPABASE_URL ?? null;
  const anonKey = source.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null;
  const appVersion = source.EXPO_PUBLIC_APP_VERSION ?? '0.0.0';

  const urlValid = rawUrl !== null && rawUrl !== '' && isValidUrl(rawUrl);
  const keyValid = anonKey !== null && anonKey !== '';
  const isConfigured = urlValid && keyValid;

  if (!isConfigured && environment !== 'development') {
    return err(
      new AppError(
        'config/missing-env',
        'Configuração do Supabase (URL/anon key) é obrigatória fora de desenvolvimento.',
        {
          severity: 'high',
          details: { environment, urlValid, keyValid },
        },
      ),
    );
  }

  if (rawUrl !== null && rawUrl !== '' && !urlValid) {
    return err(
      new AppError('config/missing-env', 'EXPO_PUBLIC_SUPABASE_URL inválida.', {
        severity: 'high',
      }),
    );
  }

  return ok({
    environment,
    supabaseUrl: urlValid ? rawUrl : null,
    supabaseAnonKey: keyValid ? anonKey : null,
    isConfigured,
    appVersion,
  });
}

/**
 * Configuração efetiva do runtime, lida do `process.env` disponível no bundle
 * Expo. Falha crítica de segredo lança; ausência de backend em dev não lança.
 */
export function getRuntimeConfig(): AppConfig {
  // IMPORTANTE (bundle web): o Expo/Metro só faz o INLINE de `EXPO_PUBLIC_*` quando
  // há referência ESTÁTICA e DIRETA a `process.env.<NOME>`. Ler `process.env` de
  // forma indireta — spread, cast para Record, acesso por colchetes, destructuring
  // ou por nome dinâmico — deixa as variáveis `undefined` no build, e o app cai para
  // demo/unconfigured mesmo com as variáveis definidas no provedor. Por isso cada
  // variável aparece aqui LITERALMENTE: é o texto que o compilador substitui pelo
  // valor embutido. NÃO refatore para leitura dinâmica.
  const source: EnvSource = {
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_APP_VERSION: process.env.EXPO_PUBLIC_APP_VERSION,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };
  const result = loadConfig(source);
  if (!result.ok) {
    if (result.error.severity === 'critical') throw result.error;
    // Fora de dev sem backend: degrada para modo não configurado, sem quebrar boot.
    return {
      environment: normalizeEnvironment(source.EXPO_PUBLIC_APP_ENV),
      supabaseUrl: null,
      supabaseAnonKey: null,
      isConfigured: false,
      appVersion: source.EXPO_PUBLIC_APP_VERSION ?? '0.0.0',
    };
  }
  return result.value;
}
