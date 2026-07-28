/**
 * Diretório de usuários — fonte ÚNICA para resolver `User` por UUID fora do
 * contexto administrativo (nome do GC, do coordenador, do avaliador).
 *
 * POR QUE EXISTE: `EvaluationsProvider` e `ValidationsProvider` resolviam
 * usuário real em `localStore` (store de demonstração, nunca populado em modo
 * corporativo). Um Gerente de Canal existente no Supabase aparecia como "—".
 * Em vez de repetir a correção em cada provider, os dois passam a consumir
 * este diretório.
 *
 * UMA consulta por sessão, indexada por id no provider — nunca uma chamada por
 * item renderizado.
 *
 * LIMITE DO SERVIDOR (não é decisão do cliente): `ui_users` é
 * `security_invoker`, então a RLS de `public.users` decide o que volta —
 * `id = auth.uid() or app.is_admin()`. Administrador enxerga o diretório
 * inteiro; os demais perfis enxergam apenas a própria linha. Quando o nome de
 * outra pessoa não vier, a tela mostra "—" porque o SERVIDOR não o entregou,
 * não porque o cliente olhou no lugar errado. Ampliar isso exigiria migration
 * e decisão de privacidade — fora do escopo desta correção.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { User } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { LocalStore, localStore } from '../store/localStore';

export interface DirectoryRepository {
  /** Usuários visíveis ao solicitante. A RLS filtra no servidor. */
  listUsers(): Promise<Result<User[]>>;
}

/** REAL LOCAL — modo demonstração/offline. */
export class LocalDirectoryRepository implements DirectoryRepository {
  constructor(private readonly store: LocalStore = localStore) {}

  async listUsers(): Promise<Result<User[]>> {
    return ok(this.store.getSnapshot().users);
  }
}

/** REAL REMOTO — projeção `ui_users` (migration 0005/0010). */
export class SupabaseDirectoryRepository implements DirectoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listUsers(): Promise<Result<User[]>> {
    const { data, error } = await this.client.from('ui_users').select('*').order('name');
    if (error) {
      return err(new AppError('network/unavailable', 'Falha ao carregar o diretório de usuários.', {
        severity: 'high', cause: error,
      }));
    }
    return ok((data ?? []) as User[]);
  }
}
