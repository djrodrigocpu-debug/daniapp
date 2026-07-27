/**
 * Implementação corporativa do AuthRepository sobre Supabase Auth
 * (Masterplan §7.1, §5.4). Substitui a autenticação demonstrativa.
 *
 * RESSALVA: a execução real depende de um projeto Supabase provisionado
 * (BLOQUEADO POR DEPENDÊNCIA EXTERNA — P09/DEP-03). O código compila e está
 * estruturalmente pronto; as consultas assumem o esquema de 0001/0002.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthCallbackIntent, AuthRepository, AuthenticatedSession } from '../../domain/repositories';
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

  /**
   * `redirectTo` leva o link de recuperação de volta ao /auth/callback do app.
   * Sem ele o GoTrue cai na Site URL e o usuário fica sem tela para redefinir.
   * A recuperação é iniciada AQUI, no cliente, então o code_verifier do PKCE é
   * gravado no storage — por isso `exchangeCodeForSession` funciona neste fluxo
   * (e não funciona no convite, que nasce no servidor).
   */
  async requestPasswordReset(email: string, redirectTo?: string): Promise<Result<true>> {
    await this.client.auth.resetPasswordForEmail(
      email.trim(),
      redirectTo ? { redirectTo } : undefined,
    );
    // Nunca revela se a conta existe (anti-enumeração §13.2): sempre ok.
    return ok(true);
  }

  /**
   * Consome o link. Três caminhos porque o Supabase entrega três formatos
   * diferentes conforme o template de e-mail e o flowType — ver
   * src/domain/auth/callbackLink.ts para o porquê de não assumir só PKCE.
   *
   * Idempotente por desenho: se já houver sessão válida, não repete a troca —
   * consumir o mesmo código duas vezes (React Strict Mode, recarga da página)
   * faria o GoTrue recusar e o usuário veria "link já utilizado" sem motivo.
   */
  async completeAuthCallback(intent: AuthCallbackIntent): Promise<Result<AuthenticatedSession>> {
    const { data: atual } = await this.client.auth.getSession();
    if (atual?.session) {
      return this.buildSessionAllowingInvited(atual.session.user.id, atual.session.expires_at ?? null);
    }

    let error: { message?: string } | null = null;
    let userId: string | null = null;
    let expiresAt: number | null = null;

    if (intent.kind === 'pkce_code') {
      const r = await this.client.auth.exchangeCodeForSession(intent.code);
      error = r.error;
      userId = r.data?.session?.user.id ?? null;
      expiresAt = r.data?.session?.expires_at ?? null;
    } else if (intent.kind === 'token_hash') {
      const r = await this.client.auth.verifyOtp({
        token_hash: intent.tokenHash,
        type: intent.purpose as 'invite' | 'recovery' | 'signup' | 'email_change',
      });
      error = r.error;
      userId = r.data?.session?.user.id ?? null;
      expiresAt = r.data?.session?.expires_at ?? null;
    } else {
      const r = await this.client.auth.setSession({
        access_token: intent.accessToken,
        refresh_token: intent.refreshToken,
      });
      error = r.error;
      userId = r.data?.session?.user.id ?? null;
      expiresAt = r.data?.session?.expires_at ?? null;
    }

    if (error || !userId) {
      // Não repassa a mensagem crua do provedor: ela pode conter fragmento do link.
      return err(new AppError('auth/invalid-credentials',
        'Não foi possível validar este link de acesso. Peça um novo convite ao Administrador.',
        { severity: 'medium' }));
    }
    return this.buildSessionAllowingInvited(userId, expiresAt);
  }

  /** Define a senha do usuário já autenticado pelo callback. */
  async updatePassword(password: string): Promise<Result<true>> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) {
      return err(new AppError('auth/invalid-credentials',
        error.message || 'Não foi possível definir a senha.', { severity: 'medium' }));
    }
    return ok(true);
  }

  /** Ativa o próprio perfil (RPC public.activate_self — migration 0012). */
  async activateSelf(): Promise<Result<true>> {
    const { error } = await this.client.rpc('activate_self');
    if (error) {
      return err(new AppError('authz/forbidden',
        error.message || 'Não foi possível concluir a ativação do seu acesso.', { severity: 'high' }));
    }
    return ok(true);
  }

  /**
   * Igual a buildSession, MAS aceita perfil ainda `invited`.
   *
   * É a diferença essencial do callback: quem acabou de aceitar o convite ainda
   * não está ativo — precisa de sessão para definir a senha e só então ativar.
   * O login normal (`signIn`) continua exigindo `active`, então esta brecha não
   * abre acesso operacional: serve apenas para completar o onboarding.
   */
  private async buildSessionAllowingInvited(
    userId: string,
    expiresAtEpoch: number | null,
  ): Promise<Result<AuthenticatedSession>> {
    const [{ data: userRow }, { data: scopeRows }, { data: assignRows }] = await Promise.all([
      this.client.from('users').select('*').eq('id', userId).single<UserRow>(),
      this.client.from('user_scopes').select('*').eq('user_id', userId).eq('active', true),
      this.client.from('operation_assignments').select('*').eq('user_id', userId).eq('active', true),
    ]);
    if (!userRow) {
      return err(new AppError('auth/not-authenticated',
        'Perfil corporativo não encontrado para este acesso.', { severity: 'high' }));
    }
    if (userRow.status === 'suspended' || userRow.status === 'inactive') {
      return err(new AppError('auth/not-authenticated', 'Usuário inativo ou suspenso.', { severity: 'high' }));
    }
    const nowISO = new Date().toISOString();
    const scopes = mapScopes(scopeRows ?? [], assignRows ?? []);
    return ok({
      user: mapUser(userRow),
      scopes,
      roles: rolesFromScopes(scopes, nowISO),
      accessTokenExpiresAt: expiresAtEpoch ? new Date(expiresAtEpoch * 1000).toISOString() : nowISO,
    });
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
