/**
 * Cliente Supabase centralizado (Masterplan §10.3).
 *
 * Segurança (§13.3, Anexo D — T03):
 *  - usa EXCLUSIVAMENTE a chave pública (anon). A `service role` jamais é lida
 *    ou referenciada no cliente.
 *  - retorna `null` quando o ambiente não está configurado (modo demo local),
 *    permitindo boot sem backend em desenvolvimento.
 *
 * A instância é criada uma única vez (singleton) e reaproveitada.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../../config/env';
// Tipos GERADOS do schema remoto (npx supabase gen types --linked). Descrevem
// tabelas/views ui_*/RPCs reais do projeto de homologação. Ligados na criação do
// cliente; os tipos de DOMÍNIO (src/types) permanecem a fonte da UI (não removidos).
import { Database } from './database.types';

let cached: SupabaseClient | null = null;
let cachedForUrl: string | null = null;

/**
 * Cria (ou reaproveita) o cliente a partir da configuração validada.
 * Persistência de sessão fica desativada aqui por padrão; a camada de auth
 * decide o storage seguro (SecureStore no mobile) — §10.3.
 */
export function getSupabaseClient(config: AppConfig): SupabaseClient | null {
  if (!config.isConfigured || !config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }
  if (cached && cachedForUrl === config.supabaseUrl) {
    return cached;
  }
  cached = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  cachedForUrl = config.supabaseUrl;
  return cached;
}

/** Apenas para testes: limpa o singleton. */
export function __resetSupabaseClientForTest(): void {
  cached = null;
  cachedForUrl = null;
}
