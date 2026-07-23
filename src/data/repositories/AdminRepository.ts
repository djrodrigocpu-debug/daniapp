/**
 * Repositórios administrativos (Masterplan §10, §8.1; Anexo B, D-05).
 * Gestão de usuários e de indicadores versionados. Apenas Administrador (a UI e a
 * navegação restringem; a RLS é a autoridade no servidor). Adapters Local
 * (REAL LOCAL) e Supabase (REAL REMOTO, pronto para conexão).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AdminIndicator, AdminIndicatorVersion, User, UserRole } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { assertCanPhysicallyDelete } from '../../domain/indicators/lifecycle';
import { makeId } from '../../utils/ids';
import { LocalStore, localStore } from '../store/localStore';

export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  region: string;
  coordinatorId?: string;
}

export interface AdminUsersRepository {
  listAll(): Promise<Result<User[]>>;
  create(input: CreateUserInput): Promise<Result<User>>;
  setActive(userId: string, active: boolean): Promise<Result<User>>;
  updateRole(userId: string, role: UserRole): Promise<Result<User>>;
}

export interface AdminIndicatorsRepository {
  listAll(): Promise<Result<AdminIndicator[]>>;
  createDefinition(code: string, name: string, version: Omit<AdminIndicatorVersion, 'id' | 'versionNumber'>): Promise<Result<AdminIndicator>>;
  addVersion(indicatorId: string, version: Omit<AdminIndicatorVersion, 'id' | 'versionNumber'>): Promise<Result<AdminIndicator>>;
  deactivate(indicatorId: string): Promise<Result<AdminIndicator>>;
  /** Exclusão física — bloqueada se em uso (inative em vez de excluir — T05). */
  remove(indicatorId: string): Promise<Result<true>>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

// ---------------------------------------------------------------------------
// Local
// ---------------------------------------------------------------------------

export class LocalAdminUsersRepository implements AdminUsersRepository {
  constructor(private readonly store: LocalStore = localStore) {}

  async listAll(): Promise<Result<User[]>> {
    return ok([...this.store.getSnapshot().users]);
  }

  async create(input: CreateUserInput): Promise<Result<User>> {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.name.trim()) return err('validation/invalid-input', 'Nome e e-mail são obrigatórios.');
    if (this.store.getSnapshot().users.some((u) => u.email.toLowerCase() === email)) {
      return err('validation/invalid-input', 'Já existe um usuário com este e-mail.');
    }
    const user: User = {
      id: makeId('U'),
      name: input.name.trim(),
      email,
      role: input.role,
      region: input.region.trim(),
      coordinatorId: input.coordinatorId,
      avatarInitials: initials(input.name),
      active: true,
    };
    this.store.update((prev) => ({ ...prev, users: [...prev.users, user] }));
    return ok(user);
  }

  async setActive(userId: string, active: boolean): Promise<Result<User>> {
    return this.patch(userId, { active });
  }

  async updateRole(userId: string, role: UserRole): Promise<Result<User>> {
    return this.patch(userId, { role });
  }

  private patch(userId: string, patch: Partial<User>): Result<User> {
    let saved: User | null = null;
    this.store.update((prev) => ({
      ...prev,
      users: prev.users.map((u) => {
        if (u.id !== userId) return u;
        saved = { ...u, ...patch };
        return saved;
      }),
    }));
    return saved ? ok(saved) : err('validation/invalid-input', 'Usuário não encontrado.');
  }
}

export class LocalAdminIndicatorsRepository implements AdminIndicatorsRepository {
  constructor(private readonly store: LocalStore = localStore) {}

  private catalog(): AdminIndicator[] {
    return this.store.getSnapshot().adminIndicators ?? [];
  }

  async listAll(): Promise<Result<AdminIndicator[]>> {
    return ok([...this.catalog()]);
  }

  async createDefinition(code: string, name: string, version: Omit<AdminIndicatorVersion, 'id' | 'versionNumber'>): Promise<Result<AdminIndicator>> {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode || !name.trim()) return err('validation/invalid-input', 'Código e nome são obrigatórios.');
    if (this.catalog().some((i) => i.code.toUpperCase() === normalizedCode)) {
      return err('validation/invalid-input', 'Já existe um indicador com este código.');
    }
    const indicator: AdminIndicator = {
      id: makeId('IND'),
      code: normalizedCode,
      name: name.trim(),
      lifecycle: 'active',
      createdAt: new Date().toISOString(),
      usageCount: 0,
      versions: [{ ...version, id: makeId('INDV'), versionNumber: 1 }],
    };
    this.store.update((prev) => ({ ...prev, adminIndicators: [...(prev.adminIndicators ?? []), indicator] }));
    return ok(indicator);
  }

  async addVersion(indicatorId: string, version: Omit<AdminIndicatorVersion, 'id' | 'versionNumber'>): Promise<Result<AdminIndicator>> {
    let saved: AdminIndicator | null = null;
    this.store.update((prev) => ({
      ...prev,
      adminIndicators: (prev.adminIndicators ?? []).map((ind) => {
        if (ind.id !== indicatorId) return ind;
        const nextNumber = ind.versions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
        saved = { ...ind, versions: [...ind.versions, { ...version, id: makeId('INDV'), versionNumber: nextNumber }] };
        return saved;
      }),
    }));
    return saved ? ok(saved) : err('validation/invalid-input', 'Indicador não encontrado.');
  }

  async deactivate(indicatorId: string): Promise<Result<AdminIndicator>> {
    let saved: AdminIndicator | null = null;
    this.store.update((prev) => ({
      ...prev,
      adminIndicators: (prev.adminIndicators ?? []).map((ind) => {
        if (ind.id !== indicatorId) return ind;
        saved = { ...ind, lifecycle: 'inactive' };
        return saved;
      }),
    }));
    return saved ? ok(saved) : err('validation/invalid-input', 'Indicador não encontrado.');
  }

  async remove(indicatorId: string): Promise<Result<true>> {
    const indicator = this.catalog().find((i) => i.id === indicatorId);
    if (!indicator) return err('validation/invalid-input', 'Indicador não encontrado.');
    // Reusa o guard de domínio testado: em uso ⇒ inative, não exclua (T05).
    const guard = assertCanPhysicallyDelete(indicator, indicator.usageCount);
    if (!guard.ok) return guard;
    this.store.update((prev) => ({
      ...prev,
      adminIndicators: (prev.adminIndicators ?? []).filter((i) => i.id !== indicatorId),
    }));
    return ok(true);
  }
}

// ---------------------------------------------------------------------------
// Supabase (REAL REMOTO — pronto para conexão, não exercitado sem backend)
// ---------------------------------------------------------------------------

function net(message: string, cause?: unknown): AppError {
  return new AppError('network/unavailable', message, { severity: 'high', cause });
}

export class SupabaseAdminUsersRepository implements AdminUsersRepository {
  constructor(private readonly client: SupabaseClient) {}
  async listAll(): Promise<Result<User[]>> {
    const { data, error } = await this.client.from('ui_users').select('*').order('name');
    return error ? err(net('Falha ao carregar usuários.', error)) : ok((data ?? []) as User[]);
  }
  async create(input: CreateUserInput): Promise<Result<User>> {
    const { data, error } = await this.client.rpc('admin_create_user', { p_input: input });
    return error ? err(net('Falha ao criar usuário.', error)) : ok(data as User);
  }
  async setActive(userId: string, active: boolean): Promise<Result<User>> {
    const { data, error } = await this.client.rpc('admin_set_user_active', { p_user_id: userId, p_active: active });
    return error ? err(net('Falha ao atualizar usuário.', error)) : ok(data as User);
  }
  async updateRole(userId: string, role: UserRole): Promise<Result<User>> {
    const { data, error } = await this.client.rpc('admin_set_user_role', { p_user_id: userId, p_role: role });
    return error ? err(net('Falha ao atualizar perfil.', error)) : ok(data as User);
  }
}

export class SupabaseAdminIndicatorsRepository implements AdminIndicatorsRepository {
  constructor(private readonly client: SupabaseClient) {}
  async listAll(): Promise<Result<AdminIndicator[]>> {
    const { data, error } = await this.client.from('ui_indicators').select('*').order('code');
    return error ? err(net('Falha ao carregar indicadores.', error)) : ok((data ?? []) as AdminIndicator[]);
  }
  async createDefinition(code: string, name: string, version: Omit<AdminIndicatorVersion, 'id' | 'versionNumber'>): Promise<Result<AdminIndicator>> {
    const { data, error } = await this.client.rpc('admin_create_indicator', { p_code: code, p_name: name, p_version: version });
    return error ? err(net('Falha ao criar indicador.', error)) : ok(data as AdminIndicator);
  }
  async addVersion(indicatorId: string, version: Omit<AdminIndicatorVersion, 'id' | 'versionNumber'>): Promise<Result<AdminIndicator>> {
    const { data, error } = await this.client.rpc('admin_add_indicator_version', { p_indicator_id: indicatorId, p_version: version });
    return error ? err(net('Falha ao criar versão.', error)) : ok(data as AdminIndicator);
  }
  async deactivate(indicatorId: string): Promise<Result<AdminIndicator>> {
    const { data, error } = await this.client.rpc('admin_deactivate_indicator', { p_indicator_id: indicatorId });
    return error ? err(net('Falha ao inativar indicador.', error)) : ok(data as AdminIndicator);
  }
  async remove(indicatorId: string): Promise<Result<true>> {
    const { error } = await this.client.rpc('admin_delete_indicator', { p_indicator_id: indicatorId });
    return error ? err(net('Falha ao excluir indicador.', error)) : ok(true);
  }
}
