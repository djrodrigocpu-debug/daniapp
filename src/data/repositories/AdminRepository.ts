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
import { normalizeEmail, normalizeKey } from '../../domain/partners/normalize';
import {
  MAX_USER_IMPORT_ROWS,
  UserImportReport,
  UserImportReportRow,
  UserImportRow,
} from '../../domain/users/types';

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
  /** commit=false: simulação (não grava). commit=true: aplica o lote. */
  importUsers(rows: UserImportRow[], commit: boolean): Promise<Result<UserImportReport>>;
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

/**
 * Vincula cada GC ao coordenador da MESMA área de atuação — a planilha do canal
 * usa a coordenação ("PR CAPITAL") nas duas pontas, e é esse vínculo que o
 * cadastro de Parceiros AACE depois exige. Área sem coordenador ativo fica sem
 * vínculo (e é reportada), nunca ligada a um coordenador arbitrário.
 */
export function linkManagersToCoordinators(users: User[]): { users: User[]; unlinkedRegions: string[] } {
  const byRegion = new Map<string, User[]>();
  for (const user of users) {
    if (user.role !== 'coordinator' || user.active === false) continue;
    const key = normalizeKey(user.region);
    if (key === '') continue;
    byRegion.set(key, [...(byRegion.get(key) ?? []), user]);
  }
  // Ambiguidade (dois coordenadores ativos na mesma área): não escolhe nenhum.
  const coordinatorByRegion = new Map<string, User>();
  for (const [key, candidates] of byRegion) {
    if (candidates.length === 1) coordinatorByRegion.set(key, candidates[0]);
  }
  const unlinked = new Set<string>();
  const linked = users.map((user) => {
    if (user.role !== 'channel_manager') return user;
    const coordinator = coordinatorByRegion.get(normalizeKey(user.region));
    if (!coordinator) {
      unlinked.add(user.region);
      return { ...user, coordinatorId: undefined };
    }
    return { ...user, coordinatorId: coordinator.id };
  });
  return { users: linked, unlinkedRegions: [...unlinked].sort() };
}

/**
 * Aplica o lote sobre a lista atual de usuários, sem gravar: existente (por
 * e-mail normalizado) é ATUALIZADO, novo é INSERIDO. Idempotente — reimportar a
 * mesma planilha não duplica ninguém.
 */
export function applyUserImport(
  current: User[],
  rows: UserImportRow[],
): { users: User[]; report: UserImportReport } {
  const next = [...current];
  const reportRows: UserImportReportRow[] = [];
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const email = normalizeEmail(row.email);
    const at = next.findIndex((u) => normalizeEmail(u.email) === email);
    if (at >= 0) {
      const previous = next[at];
      const merged: User = {
        ...previous,
        name: row.name,
        email,
        role: row.role,
        region: row.region,
        avatarInitials: initials(row.name),
        active: true,
      };
      next[at] = merged;
      updated += 1;
      reportRows.push({
        index: row.index, name: row.name, email, role: row.role,
        status: 'duplicate', action: 'update', userId: merged.id, messages: [],
        warnings: previous.role === row.role ? [] : [`Perfil alterado de ${previous.role} para ${row.role}`],
      });
    } else {
      const user: User = {
        id: makeId('U'),
        name: row.name,
        email,
        role: row.role,
        region: row.region,
        avatarInitials: initials(row.name),
        active: true,
      };
      next.push(user);
      inserted += 1;
      reportRows.push({
        index: row.index, name: row.name, email, role: row.role,
        status: 'ok', action: 'insert', userId: user.id, messages: [], warnings: [],
      });
    }
  }

  const { users, unlinkedRegions } = linkManagersToCoordinators(next);
  for (const reportRow of reportRows) {
    const user = users.find((u) => u.id === reportRow.userId);
    if (user?.role === 'channel_manager' && !user.coordinatorId) {
      reportRow.warnings.push(`Sem coordenador ativo para a área "${user.region}"`);
    }
  }

  return {
    users,
    report: {
      mode: 'simulate',
      counters: { total: rows.length, inserted, updated, errors: 0 },
      coordinationsWithoutCoordinator: unlinkedRegions,
      rows: reportRows,
    },
  };
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

  async importUsers(rows: UserImportRow[], commit: boolean): Promise<Result<UserImportReport>> {
    if (rows.length > MAX_USER_IMPORT_ROWS) {
      return err('validation/invalid-input', `Lote excede o limite de ${MAX_USER_IMPORT_ROWS} linhas.`);
    }
    const { users, report } = applyUserImport(this.store.getSnapshot().users, rows);
    if (commit) this.store.update((prev) => ({ ...prev, users }));
    return ok({ ...report, mode: commit ? 'commit' : 'simulate' });
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
  // O motivo vindo do servidor ("apenas administrador", violação de unicidade,
  // recusa de RLS) é a informação ÚTIL — engoli-lo atrás de um texto genérico
  // deixa o relatório de importação inacionável. Mesmo padrão do adapter de
  // Parceiros AACE: mensagem do servidor primeiro, fallback só se vier vazia.
  async create(input: CreateUserInput): Promise<Result<User>> {
    const { data, error } = await this.client.rpc('admin_create_user', { p_input: input });
    return error ? err(net(error.message || 'Falha ao criar usuário.', error)) : ok(data as User);
  }
  async setActive(userId: string, active: boolean): Promise<Result<User>> {
    const { data, error } = await this.client.rpc('admin_set_user_active', { p_user_id: userId, p_active: active });
    return error ? err(net(error.message || 'Falha ao atualizar usuário.', error)) : ok(data as User);
  }
  async updateRole(userId: string, role: UserRole): Promise<Result<User>> {
    const { data, error } = await this.client.rpc('admin_set_user_role', { p_user_id: userId, p_role: role });
    return error ? err(net(error.message || 'Falha ao atualizar perfil.', error)) : ok(data as User);
  }

  /**
   * Não há RPC de importação de usuários (a 0009 cobre só Parceiros AACE), então
   * o lote é aplicado pelas RPCs existentes, uma linha por vez.
   *
   * LIMITAÇÕES CONHECIDAS deste caminho (não use em produção sem resolvê-las):
   * 1. NÃO é atômico — falha no meio deixa as linhas anteriores gravadas. O
   *    relatório diz exatamente quais entraram.
   * 2. Atualização de existente só troca o PAPEL: não há RPC para alterar nome,
   *    área de atuação ou reativar. Cada linha atualizada leva um warning
   *    dizendo isso, para o operador não supor que a planilha foi espelhada.
   * 3. O vínculo GC→coordenador calculado por applyUserImport é LOCAL: não há
   *    RPC que grave escopo de coordenação, então ele não chega ao servidor.
   * 4. admin_create_user insere em auth.users SEM credencial (status 'invited'),
   *    logo o usuário criado por aqui NÃO consegue fazer login por senha.
   * Ver o relatório da etapa Supabase para a proposta de RPC transacional.
   */
  async importUsers(rows: UserImportRow[], commit: boolean): Promise<Result<UserImportReport>> {
    if (rows.length > MAX_USER_IMPORT_ROWS) {
      return err('validation/invalid-input', `Lote excede o limite de ${MAX_USER_IMPORT_ROWS} linhas.`);
    }
    const listed = await this.listAll();
    if (!listed.ok) return listed;

    const { report } = applyUserImport(listed.value, rows);
    if (!commit) return ok(report);

    const existingByEmail = new Map(listed.value.map((u) => [normalizeEmail(u.email), u]));
    for (const reportRow of report.rows) {
      const row = rows.find((r) => r.index === reportRow.index)!;
      const existing = existingByEmail.get(reportRow.email);
      const res = existing
        ? await this.updateRole(existing.id, row.role)
        : await this.create({ name: row.name, email: row.email, role: row.role, region: row.region });
      if (res.ok) {
        reportRow.userId = res.value.id;
        if (existing) {
          reportRow.warnings.push(
            'Somente o perfil foi atualizado no servidor: nome, área de atuação e reativação não têm RPC.',
          );
        }
      } else {
        reportRow.status = 'error';
        reportRow.action = 'none';
        reportRow.userId = null;
        reportRow.messages.push(res.error.message);
      }
    }

    const errors = report.rows.filter((r) => r.status === 'error').length;
    return ok({
      ...report,
      mode: 'commit',
      counters: {
        ...report.counters,
        errors,
        inserted: report.rows.filter((r) => r.action === 'insert').length,
        updated: report.rows.filter((r) => r.action === 'update').length,
      },
    });
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
