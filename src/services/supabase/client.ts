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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../../config/env';
// Tipos GERADOS do schema remoto (npx supabase gen types --linked). Descrevem
// tabelas/views ui_*/RPCs reais do projeto de homologação. Ligados na criação do
// cliente; os tipos de DOMÍNIO (src/types) permanecem a fonte da UI (não removidos).
import { Database } from './database.types';

let cached: SupabaseClient | null = null;
let cachedForUrl: string | null = null;

/** Opções de auth comuns aos dois runtimes. */
const baseAuthOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
};

/**
 * Cria (ou reaproveita) o cliente a partir da configuração validada.
 *
 * Persistência de sessão (§10.3):
 *  - no web, o auth-js já usa `localStorage` por padrão — nenhum `storage`
 *    é passado para não sobrescrever esse comportamento;
 *  - no runtime nativo não existe `localStorage`, então a sessão é gravada em
 *    `AsyncStorage` (sem isso o login se perde a cada reinício do app).
 *
 * A detecção usa `typeof document`: importar `Platform` de `react-native` aqui
 * quebraria os testes Node (sintaxe Flow nos fontes do RN).
 */
export function getSupabaseClient(config: AppConfig): SupabaseClient | null {
  if (!config.isConfigured || !config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }
  if (cached && cachedForUrl === config.supabaseUrl) {
    return cached;
  }
  const isWebRuntime = typeof document !== 'undefined';
  const authOptions = isWebRuntime
    ? baseAuthOptions
    : {
        ...baseAuthOptions,
        storage: AsyncStorage,
      };
  cached = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: authOptions,
  });
  cachedForUrl = config.supabaseUrl;
  return cached;
}

/** Apenas para testes: limpa o singleton. */
export function __resetSupabaseClientForTest(): void {
  cached = null;
  cachedForUrl = null;
}
