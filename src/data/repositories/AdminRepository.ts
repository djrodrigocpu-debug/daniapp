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
  /**
   * Senha temporária do primeiro acesso. Exigida SOMENTE quando o e-mail ainda
   * não tem identidade no Auth — quem já existe reaproveita a própria senha.
   *
   * Sem isto o cadastro avulso é recusado pelo servidor: o provisionamento por
   * senha (que substituiu o convite) não tem como criar identidade sem ela.
   */
  initialPassword?: string;
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
  /**
   * Corrige IDENTIDADE e RÓTULO (código e nome) sem criar versão: eles não fazem
   * parte do contrato medido. Unidade, direção, meta, tolerância e peso continuam
   * mudando só por `addVersion` — é isso que mantém a série histórica auditável.
   */
  updateDefinition(indicatorId: string, code: string, name: string): Promise<Result<AdminIndicator>>;
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

  async updateDefinition(indicatorId: string, code: string, name: string): Promise<Result<AdminIndicator>> {
    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();
    if (!normalizedCode || !normalizedName) return err('validation/invalid-input', 'Código e nome são obrigatórios.');
    const alvo = this.catalog().find((i) => i.id === indicatorId);
    if (!alvo) return err('validation/invalid-input', 'Indicador não encontrado.');
    if (this.catalog().some((i) => i.id !== indicatorId && i.code.toUpperCase() === normalizedCode)) {
      return err('validation/invalid-input', `Já existe um indicador com o código ${normalizedCode}.`);
    }
    // Espelha a guarda da 0022: identidade de indicador já medido não muda.
    if (normalizedCode !== alvo.code.toUpperCase() && alvo.usageCount > 0) {
      return err('validation/invalid-input', `Indicador ${alvo.code} já em uso: só o nome pode ser alterado.`);
    }
    let saved: AdminIndicator | null = null;
    this.store.update((prev) => ({
      ...prev,
      adminIndicators: (prev.adminIndicators ?? []).map((ind) => {
        if (ind.id !== indicatorId) return ind;
        saved = { ...ind, code: normalizedCode, name: normalizedName };
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
  /**
   * Cadastro avulso ("Novo usuário" na aba Admin) é um LOTE DE UM: delega ao
   * mesmo fluxo de três fases da importação.
   *
   * Antes chamava public.admin_create_user, depreciada na migration 0011 por
   * criar identidade Auth incompleta — o usuário aparecia na lista e nunca
   * conseguia entrar. Reaproveitar importUsers mantém um único caminho de
   * onboarding: mesma validação, mesma transação.
   *
   * A senha inicial ATRAVESSA daqui: quando o provisionamento deixou de ser por
   * convite, criar identidade passou a exigi-la, e este caminho continuou sem
   * enviá-la — todo cadastro avulso de usuário novo era recusado com "senha
   * inicial obrigatória". Ela vive só nesta chamada e não é gravada em lugar
   * nenhum do cliente.
   */
  async create(input: CreateUserInput): Promise<Result<User>> {
    const row: UserImportRow = {
      index: 1,
      name: input.name,
      email: input.email,
      role: input.role,
      region: input.region,
      ...(input.initialPassword ? { initialPassword: input.initialPassword } : {}),
    };
    const res = await this.importUsers([row], true);
    if (!res.ok) return res;

    const report = res.value;
    const line = report.rows[0];
    if (!report.applied || !line || line.status === 'error') {
      const motivo = line?.messages.join('; ')
        || (report.pendingAuth?.length ? 'convite de acesso não concluído' : 'lote recusado pelo servidor');
      return err('validation/invalid-input', `Não foi possível criar o usuário: ${motivo}`);
    }
    return ok({
      id: line.userId ?? '',
      name: line.name,
      email: line.email,
      role: line.role,
      region: input.region,
      avatarInitials: initials(line.name),
      // Nasce ATIVO: a identidade é criada com `email_confirm: true` e a
      // ativação (`admin_activate_confirmed_users`) roda no mesmo provisionamento.
      // Não há mais espera por clique em convite — não existe convite.
      active: true,
    });
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
   * Provisionamento corporativo POR SENHA, sem convite (migration 0010 + Edge
   * Function `admin-provision-users`).
   *
   * A ordem é imposta pelo schema: `public.users.id` referencia `auth.users(id)`,
   * então o PERFIL NÃO PODE PRECEDER A IDENTIDADE.
   *
   *   1. RPC em modo simulação, AQUI no cliente — valida o lote inteiro, não
   *      grava nada e alimenta o relatório que o operador confere antes de
   *      confirmar.
   *   2. Edge Function `admin-provision-users` — refaz a simulação no servidor,
   *      cria as identidades faltantes com `createUser(email, senha,
   *      email_confirm: true)`, grava perfis e escopos em transação única e
   *      ativa os confirmados. Idempotente por e-mail.
   *
   * NENHUM e-mail é enviado em nenhum ponto: não há convite, não há link de
   * confirmação e nenhum SMTP é necessário. A identidade nasce com o e-mail já
   * confirmado, que é justamente a condição de `admin_activate_confirmed_users`
   * — por isso o usuário sai de 'invited' para 'active' no mesmo fluxo.
   *
   * A senha inicial vem da planilha, vive só nesta chamada e não é gravada,
   * registrada nem devolvida em relatório algum.
   */
  async importUsers(rows: UserImportRow[], commit: boolean): Promise<Result<UserImportReport>> {
    if (rows.length > MAX_USER_IMPORT_ROWS) {
      return err('validation/invalid-input', `Lote excede o limite de ${MAX_USER_IMPORT_ROWS} linhas.`);
    }

    // A SIMULAÇÃO continua local: a tela precisa do relatório linha a linha
    // antes de o operador confirmar, e nada é gravado nem criado aqui.
    const simulated = await this.callImportRpc(rows, false);
    if (!simulated.ok) return simulated;
    if (!commit) return simulated;

    // O COMMIT inteiro é delegado à Edge Function `admin-provision-users`, que
    // roda simulação → criação das identidades → gravação → ativação numa única
    // chamada com service role. A senha inicial só existe nesta requisição: sai
    // do parser da planilha, atravessa o HTTPS e morre no servidor.
    return this.provisionUsers(rows);
  }

  /**
   * Fase de gravação — provisionamento sem convite.
   *
   * A identidade nasce por `createUser(email, senha, email_confirm: true)`,
   * portanto NENHUM e-mail é enviado e nenhum SMTP é necessário. A função antiga
   * `admin-invite-users` permanece publicada, mas fora deste caminho.
   *
   * `requirePasswordChange: true` NÃO é opcional aqui. A senha inicial vem da
   * planilha e é conhecida por quem a preparou — deixar essa senha valendo
   * indefinidamente anularia o propósito de tê-la trocado na primeira entrada.
   * A opção existe desligada na Edge Function porque lá o default seguro é não
   * mexer em conta alguma; neste caminho, que é a carga corporativa, o padrão
   * seguro é o inverso.
   *
   * `resetExistingPasswords` fica no default `false`: reimportar a planilha não
   * pode devolver a senha temporária a quem já trocou a dele.
   *
   * As opções vão sob `options`, não soltas na raiz do corpo: é onde a função
   * as lê. Mandá-las na raiz não dá erro algum — a função cai nos defaults e
   * simplesmente não marca ninguém, em silêncio.
   */
  private async provisionUsers(rows: UserImportRow[]): Promise<Result<UserImportReport>> {
    const { data, error } = await this.client.functions.invoke('admin-provision-users', {
      body: { rows, options: { requirePasswordChange: true } },
    });
    if (error) {
      return err(net(error.message || 'Falha ao provisionar os usuários.', error));
    }

    const dto = data as {
      ok: boolean;
      counters?: { total: number; created: number; alreadyExisting: number; failed: number; activated: number };
      rows?: Array<{ email: string; state: string; authUserId: string | null; message?: string }>;
      report?: {
        mode: 'simulate' | 'commit';
        applied: boolean;
        counters: { total: number; inserted: number; updated: number; errors: number; pendingAuth: number };
        rows: UserImportReportRow[];
      } | null;
      error?: string;
    };

    if (!dto?.ok) {
      // Nada foi gravado no Postgres; abortar aqui mantém a base íntegra.
      const falhas = (dto?.rows ?? []).filter((r) => r.state === 'failed');
      return err(net(
        `Provisionamento incompleto (${falhas.length} de ${dto?.rows?.length ?? 0}). `
        + 'Nada foi gravado — corrija e rode a importação novamente: '
        + falhas.map((f) => `${f.email}: ${f.message ?? 'falha'}`).join('; '),
      ));
    }

    const report = dto.report;
    return ok({
      mode: 'commit',
      applied: true,
      counters: {
        total: report?.counters.total ?? dto.counters?.total ?? rows.length,
        inserted: report?.counters.inserted ?? dto.counters?.created ?? 0,
        updated: report?.counters.updated ?? 0,
        errors: report?.counters.errors ?? 0,
        pendingAuth: 0,
      },
      pendingAuth: [],
      coordinationsWithoutCoordinator: [],
      rows: report?.rows ?? [],
    });
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
  async updateDefinition(indicatorId: string, code: string, name: string): Promise<Result<AdminIndicator>> {
    const { data, error } = await this.client.rpc('admin_update_indicator', {
      p_indicator_id: indicatorId,
      p_code: code,
      p_name: name,
    });
    // A mensagem do servidor já nomeia o código em conflito ou explica a recusa
    // por uso — repassar texto genérico aqui esconderia justamente o que resolve.
    return error ? err(net(error.message || 'Falha ao atualizar indicador.', error)) : ok(data as AdminIndicator);
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
