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
   * Onboarding corporativo em três fases (migration 0010 + Edge Function).
   *
   * A ordem é imposta pelo schema: `public.users.id` referencia `auth.users(id)`,
   * então o PERFIL NÃO PODE PRECEDER A IDENTIDADE.
   *
   *   1. RPC em modo simulação — valida o lote inteiro, não grava nada em lugar
   *      nenhum e devolve `pendingAuth`: os e-mails ainda sem identidade.
   *   2. Edge Function `admin-invite-users` — cria/recupera as identidades com
   *      service role (que jamais existe no bundle). Idempotente por e-mail;
   *      falha aqui não tocou o Postgres e a operação é reexecutável.
   *   3. RPC em modo commit, já com os `authUserId` — revalida e grava perfis e
   *      escopos numa ÚNICA transação: ou entra tudo, ou não entra nada.
   *
   * Diferença deliberada em relação ao adapter local: o servidor NÃO ativa
   * ninguém. O usuário nasce 'invited' e só vira 'active' quando confirma o
   * e-mail — `admin_activate_confirmed_users`. Até lá, a importação de
   * Parceiros AACE o recusa como GC/Coordenador, por desenho.
   */
  async importUsers(rows: UserImportRow[], commit: boolean): Promise<Result<UserImportReport>> {
    if (rows.length > MAX_USER_IMPORT_ROWS) {
      return err('validation/invalid-input', `Lote excede o limite de ${MAX_USER_IMPORT_ROWS} linhas.`);
    }

    const simulated = await this.callImportRpc(rows, false);
    if (!simulated.ok) return simulated;
    if (!commit) return simulated;

    // Fase 2: só quem ainda não tem identidade entra no convite.
    let prepared = rows;
    const pending = simulated.value.pendingAuth ?? [];
    if (pending.length > 0) {
      const invited = await this.inviteIdentities(pending);
      if (!invited.ok) return invited;
      prepared = rows.map((row) => {
        const authUserId = invited.value.get(normalizeEmail(row.email));
        return authUserId ? { ...row, authUserId } : row;
      });
    }

    return this.callImportRpc(prepared, true);
  }

  /** Chama a RPC transacional e traduz o relatório para o contrato da UI. */
  private async callImportRpc(
    rows: Array<UserImportRow & { authUserId?: string }>,
    commit: boolean,
  ): Promise<Result<UserImportReport>> {
    const { data, error } = await this.client.rpc('admin_import_users', { p_rows: rows, p_commit: commit });
    if (error) return err(net(error.message || 'Falha na importação de usuários.', error));

    const dto = data as {
      mode: 'simulate' | 'commit';
      applied: boolean;
      counters: { total: number; inserted: number; updated: number; errors: number; pendingAuth: number };
      pendingAuth: string[];
      rows: UserImportReportRow[];
    };
    return ok({
      mode: dto.mode,
      applied: dto.applied,
      counters: dto.counters,
      pendingAuth: dto.pendingAuth ?? [],
      // O vínculo com o coordenador é resolvido pelo servidor (coordination_id),
      // então não há coordenação órfã a reportar aqui como no modo local.
      coordinationsWithoutCoordinator: [],
      rows: dto.rows ?? [],
    });
  }

  /** Fase 2 — convite via Edge Function. Devolve e-mail normalizado → authUserId. */
  private async inviteIdentities(emails: string[]): Promise<Result<Map<string, string>>> {
    const { data, error } = await this.client.functions.invoke('admin-invite-users', {
      body: { emails },
    });
    if (error) {
      return err(net(error.message || 'Falha ao convidar os usuários no Supabase Auth.', error));
    }
    const dto = data as {
      ok: boolean;
      rows: Array<{ email: string; state: string; authUserId: string | null; message?: string }>;
    };
    const resolved = new Map<string, string>();
    for (const row of dto.rows ?? []) {
      if (row.authUserId) resolved.set(normalizeEmail(row.email), row.authUserId);
    }
    if (!dto.ok) {
      // Nada foi gravado no Postgres ainda; abortar aqui mantém a base íntegra.
      const falhas = (dto.rows ?? []).filter((r) => !r.authUserId);
      return err(net(
        `Convite incompleto (${falhas.length} de ${dto.rows?.length ?? 0}). `
        + 'Nada foi gravado — corrija e rode a importação novamente: '
        + falhas.map((f) => `${f.email}: ${f.message ?? 'falha'}`).join('; '),
      ));
    }
    return ok(resolved);
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
