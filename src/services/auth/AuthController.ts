/**
 * Orquestração de autenticação corporativa (Masterplan §7.1, §8, §10).
 *
 * Camada agnóstica de framework — testável em Node — que dirige o ciclo de vida
 * da sessão sobre QUALQUER `AuthRepository` (Supabase real ou, em dev, demo):
 *   restauração no boot · login · logout · expiração (T10) · derivação de papéis.
 *
 * A UI (React/React Native) consome via um provider fino; a lógica de estado e as
 * transições ficam aqui e são exercitadas por testes (não é apenas um contrato).
 */
import { AuthRepository, AuthenticatedSession } from '../../domain/repositories';
import { isSessionExpired } from '../../domain/auth/session';
import { Role } from '../../domain/model';

export type AuthStatus = 'initializing' | 'anonymous' | 'authenticated' | 'error';

export interface AuthState {
  status: AuthStatus;
  session: AuthenticatedSession | null;
  /** Mensagem apresentável do último erro de ação (login/restore). */
  error: string | null;
  /** true enquanto uma ação (login/logout) está em andamento. */
  busy: boolean;
}

export type AuthListener = (state: AuthState) => void;

const INITIAL: AuthState = { status: 'initializing', session: null, error: null, busy: false };

export class AuthController {
  private state: AuthState = INITIAL;
  private readonly listeners = new Set<AuthListener>();

  constructor(
    private readonly repo: AuthRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  getState(): AuthState {
    return this.state;
  }

  /** Inscreve um ouvinte e recebe o estado atual imediatamente. Retorna unsubscribe. */
  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(patch: Partial<AuthState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  roles(): Role[] {
    return this.state.session?.roles ?? [];
  }

  hasRole(role: Role): boolean {
    return this.roles().includes(role);
  }

  isAuthenticated(): boolean {
    return this.state.status === 'authenticated' && this.state.session !== null;
  }

  /** Restaura a sessão persistida no boot; sessão vencida vira anônima (T10). */
  async restore(): Promise<void> {
    this.set({ status: 'initializing', error: null });
    const res = await this.repo.getSession();
    if (!res.ok) {
      this.set({ status: 'anonymous', session: null });
      return;
    }
    const session = res.value;
    if (!session || isSessionExpired(session, this.now())) {
      if (session) await this.repo.signOut().catch(() => undefined);
      this.set({ status: 'anonymous', session: null });
      return;
    }
    this.set({ status: 'authenticated', session, error: null });
  }

  /** Login por e-mail/senha. Retorna resultado apresentável; nunca lança. */
  async signIn(email: string, password: string): Promise<{ ok: boolean; message?: string }> {
    this.set({ busy: true, error: null });
    const res = await this.repo.signIn(email, password);
    if (!res.ok) {
      this.set({
        busy: false,
        status: this.state.session ? 'authenticated' : 'anonymous',
        error: res.error.message,
      });
      return { ok: false, message: res.error.message };
    }
    this.set({ busy: false, status: 'authenticated', session: res.value, error: null });
    return { ok: true };
  }

  async signOut(): Promise<void> {
    this.set({ busy: true });
    await this.repo.signOut().catch(() => undefined);
    this.set({ busy: false, status: 'anonymous', session: null, error: null });
  }

  /**
   * Revalida a expiração sob demanda (ex.: app volta ao primeiro plano).
   * Retorna true se ainda autenticado; caso contrário derruba a sessão.
   */
  ensureFresh(): boolean {
    const s = this.state.session;
    if (s && isSessionExpired(s, this.now())) {
      this.set({ status: 'anonymous', session: null });
      return false;
    }
    return this.isAuthenticated();
  }
}
