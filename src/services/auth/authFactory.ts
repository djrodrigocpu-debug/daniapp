/**
 * Seleção do backend de autenticação conforme o ambiente (Masterplan §8, §10.3).
 *
 *   configurado (Supabase)      → SupabaseAuthRepository (autoritativo)
 *   dev SEM Supabase            → DemoAuthRepository (fictício, sem senha)
 *   prod/homolog SEM Supabase   → NullAuthRepository (login impossível, orienta)
 *
 * Garante que o modo demonstração é IMPOSSÍVEL em produção (§8) e que nunca há
 * senha embutida no bundle (T30).
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../../config/env';
import { AuthRepository, AuthenticatedSession } from '../../domain/repositories';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { SupabaseAuthRepository } from '../supabase/SupabaseAuthRepository';
import { DemoAuthRepository, DemoProfile } from './DemoAuthRepository';

export type AuthMode = 'supabase' | 'demo' | 'unconfigured';

/** Repositório que recusa login com orientação — usado sem backend fora de dev. */
export class NullAuthRepository implements AuthRepository {
  async signIn(): Promise<Result<AuthenticatedSession>> {
    return err(new AppError(
      'config/missing-env',
      'Autenticação corporativa não configurada neste ambiente. Configure o Supabase (.env).',
      { severity: 'high' },
    ));
  }
  async signOut(): Promise<Result<true>> { return ok(true); }
  async getSession(): Promise<Result<AuthenticatedSession | null>> { return ok(null); }
  async requestPasswordReset(): Promise<Result<true>> { return ok(true); }
}

export interface AuthBackend {
  repository: AuthRepository;
  mode: AuthMode;
}

export function selectAuthMode(config: AppConfig, client: SupabaseClient | null): AuthMode {
  if (config.isConfigured && client) return 'supabase';
  if (config.environment === 'development') return 'demo';
  return 'unconfigured';
}

export interface AuthBackendOptions {
  /**
   * Diretório de perfis demo alinhado ao seed operacional (§9.3). Injetado pela
   * camada de app; ignorado fora do modo demo. Quando ausente, usa o diretório
   * fictício padrão do `DemoAuthRepository`.
   */
  demoDirectory?: DemoProfile[];
}

export function createAuthBackend(
  config: AppConfig,
  client: SupabaseClient | null,
  options: AuthBackendOptions = {},
): AuthBackend {
  const mode = selectAuthMode(config, client);
  switch (mode) {
    case 'supabase':
      return { repository: new SupabaseAuthRepository(client as SupabaseClient), mode };
    case 'demo':
      return { repository: new DemoAuthRepository(options.demoDirectory), mode };
    default:
      return { repository: new NullAuthRepository(), mode };
  }
}
