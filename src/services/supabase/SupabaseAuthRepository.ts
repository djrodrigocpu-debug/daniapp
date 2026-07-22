/**
 * Implementação corporativa do AuthRepository sobre Supabase Auth
 * (Masterplan §7.1, §5.4). Substitui a autenticação demonstrativa.
 *
 * RESSALVA: a execução real depende de um projeto Supabase provisionado
 * (BLOQUEADO POR DEPENDÊNCIA EXTERNA — P09/DEP-03). O código compila e está
 * estruturalmente pronto; as consultas assumem o esquema de 0001/0002.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthRepository, AuthenticatedSession } from '../../domain/repositories';
import { UserAccount, UserScope, Role, UserStatus } from '../../domain/model';
import { rolesFromScopes } from '../../domain/auth/session';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';

interface UserRow {
  id: string;
  display_name: string;
  corporate_email: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

interface ScopeRow {
  id: string;
  user_id: string;
  role: Role;
  region_id: string | null;
  coordination_id: string | null;
  unit_id: string | null;
  valid_from: string;
  valid_to: string | null;
  active: boolean;
}

interface AssignmentRow {
  operation_id: string;
  user_id: string;
  active: boolean;
  valid_to: string | null;
}

function mapUser(row: UserRow): UserAccount {
  return {
    id: row.id,
    displayName: row.display_name,
    corporateEmail: row.corporate_email,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScopes(rows: ScopeRow[], assignments: AssignmentRow[]): UserScope[] {
  const activeOps = assignments.filter((a) => a.active).map((a) => a.operation_id);
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    role: r.role,
    regionId: r.region_id,
    coordinationId: r.coordination_id,
    unitId: r.unit_id,
    operationIds: r.role === 'channel_manager' ? activeOps : [],
    validFrom: r.valid_from,
    validTo: r.valid_to,
    active: r.active,
  }));
}

export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly client: SupabaseClient) {}

  async signIn(email: string, password: string): Promise<Result<AuthenticatedSession>> {
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user || !data.session) {
      return err(new AppError('auth/invalid-credentials', 'E-mail ou senha inválidos.', { severity: 'medium' }));
    }
    return this.buildSession(data.user.id, data.session.expires_at ?? null);
  }

  async signOut(): Promise<Result<true>> {
    const { error } = await this.client.auth.signOut();
    if (error) return err(new AppError('unknown', 'Falha ao encerrar sessão.', { cause: error }));
    return ok(true);
  }

  async getSession(): Promise<Result<AuthenticatedSession | null>> {
    const { data, error } = await this.client.auth.getSession();
    if (error) return err(new AppError('auth/session-expired', 'Sessão inválida.', { cause: error }));
    if (!data.session) return ok(null);
    return this.buildSession(data.session.user.id, data.session.expires_at ?? null);
  }

  async requestPasswordReset(email: string): Promise<Result<true>> {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim());
    // Não revela existência da conta (anti-enumeração §13.2): sempre ok.
    if (error) return ok(true);
    return ok(true);
  }

  /** Monta a sessão autenticada a partir do perfil e escopos. */
  private async buildSession(userId: string, expiresAtEpoch: number | null): Promise<Result<AuthenticatedSession>> {
    const [{ data: userRow, error: userErr }, { data: scopeRows, error: scopeErr }, { data: assignRows }] =
      await Promise.all([
        this.client.from('users').select('*').eq('id', userId).single<UserRow>(),
        this.client.from('user_scopes').select('*').eq('user_id', userId).eq('active', true),
        this.client.from('operation_assignments').select('*').eq('user_id', userId).eq('active', true),
      ]);

    if (userErr || !userRow) {
      return err(new AppError('auth/not-authenticated', 'Perfil de usuário não encontrado.', { severity: 'high' }));
    }
    if (userRow.status !== 'active') {
      return err(new AppError('auth/not-authenticated', 'Usuário inativo ou suspenso.', { severity: 'high' }));
    }
    if (scopeErr) {
      return err(new AppError('authz/forbidden', 'Falha ao carregar escopos de acesso.', { cause: scopeErr }));
    }

    const nowISO = new Date().toISOString();
    const scopes = mapScopes(scopeRows ?? [], assignRows ?? []);
    const expiresISO = expiresAtEpoch ? new Date(expiresAtEpoch * 1000).toISOString() : nowISO;

    return ok({
      user: mapUser(userRow),
      scopes,
      roles: rolesFromScopes(scopes, nowISO),
      accessTokenExpiresAt: expiresISO,
    });
  }
}
