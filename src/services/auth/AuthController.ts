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
import { AuthRepository, AuthenticatedSession, PasswordGateState } from '../../domain/repositories';
import { isSessionExpired } from '../../domain/auth/session';
import { Role } from '../../domain/model';

/**
 * `password_change_required` é a SESSÃO AUTH SEM SESSÃO CORPORATIVA: existe
 * identidade no provedor, mas a senha temporária ainda não foi trocada, então
 * nenhum perfil, escopo ou papel é carregado. Não reaproveita `error` nem as
 * fases de link (`callback_error`), que significam outra coisa.
 */
export type AuthStatus =
  | 'initializing'
  | 'anonymous'
  | 'authenticated'
  | 'password_change_required'
  | 'error';

export interface AuthState {
  status: AuthStatus;
  session: AuthenticatedSession | null;
  /** Mensagem apresentável do último erro de ação (login/restore). */
  error: string | null;
  /** true enquanto uma ação (login/logout) está em andamento. */
  busy: boolean;
  /** E-mail retido no gate, só como rótulo. null fora do gate. */
  gateEmail: string | null;
}

export type AuthListener = (state: AuthState) => void;

const INITIAL: AuthState = {
  status: 'initializing', session: null, error: null, busy: false, gateEmail: null,
};

/** Resultado interno da leitura do gate. */
type GateReading =
  | { kind: 'open' }
  | { kind: 'anonymous' }
  | { kind: 'blocked'; email: string | null }
  | { kind: 'unreadable'; message: string };

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

  /**
   * Consulta o gate NO SERVIDOR. Backend sem a porta (demonstração) devolve
   * 'open': lá não existe senha temporária a trocar.
   *
   * Falha de leitura NÃO é tratada como liberação. Se bastasse a consulta falhar
   * para o app seguir em frente, derrubar essa única chamada seria o bypass mais
   * barato do sistema.
   */
  private async readGate(): Promise<GateReading> {
    if (!this.repo.passwordGate) return { kind: 'open' };
    const res = await this.repo.passwordGate();
    if (!res.ok) return { kind: 'unreadable', message: res.error.message };
    const gate: PasswordGateState = res.value;
    if (!gate.authenticated) return { kind: 'anonymous' };
    return gate.required ? { kind: 'blocked', email: gate.email } : { kind: 'open' };
  }

  /**
   * Aplica a leitura do gate. Devolve true quando o fluxo deve PARAR aqui —
   * isto é, quando a sessão corporativa não pode ser montada.
   */
  private applyGate(reading: GateReading): boolean {
    if (reading.kind === 'blocked') {
      // Sessão corporativa permanece null: sem perfil, sem escopo, sem papel.
      this.set({
        busy: false, status: 'password_change_required', session: null,
        gateEmail: reading.email, error: null,
      });
      return true;
    }
    if (reading.kind === 'unreadable') {
      // Anônimo em vez de autenticado: fecha o acesso sem inventar um estado
      // intermediário. A sessão persistida é preservada — recarregar reconsulta.
      this.set({
        busy: false, status: 'anonymous', session: null,
        gateEmail: null, error: reading.message,
      });
      return true;
    }
    if (reading.kind === 'anonymous') {
      this.set({ busy: false, status: 'anonymous', session: null, gateEmail: null });
      return true;
    }
    return false;
  }

  /** Restaura a sessão persistida no boot; sessão vencida vira anônima (T10). */
  async restore(): Promise<void> {
    this.set({ status: 'initializing', error: null });

    // O gate vem ANTES de `getSession`, que é quem monta perfil e escopos. É o
    // que fecha o bypass por recarga da página, reabertura do app e refresh
    // token: toda entrada passa por aqui, não só o login.
    if (this.applyGate(await this.readGate())) return;

    const res = await this.repo.getSession();
    if (!res.ok) {
      this.set({ status: 'anonymous', session: null, gateEmail: null });
      return;
    }
    const session = res.value;
    if (!session || isSessionExpired(session, this.now())) {
      if (session) await this.repo.signOut().catch(() => undefined);
      this.set({ status: 'anonymous', session: null, gateEmail: null });
      return;
    }
    this.set({ status: 'authenticated', session, error: null, gateEmail: null });
  }

  /** Login por e-mail/senha. Retorna resultado apresentável; nunca lança. */
  async signIn(email: string, password: string): Promise<{ ok: boolean; message?: string }> {
    this.set({ busy: true, error: null });

    // Caminho com gate: autentica, consulta e só então decide se monta a sessão
    // corporativa. `signIn` do repositório já devolveria a sessão montada, que é
    // justamente o que não pode existir enquanto a troca estiver pendente.
    if (this.repo.signInRaw && this.repo.passwordGate) {
      const bruto = await this.repo.signInRaw(email, password);
      if (!bruto.ok) {
        this.set({ busy: false, status: 'anonymous', session: null, gateEmail: null, error: bruto.error.message });
        return { ok: false, message: bruto.error.message };
      }
      if (this.applyGate(await this.readGate())) {
        const bloqueado = this.state.status === 'password_change_required';
        // Autenticou: quem decide o que aparece é o estado, não este retorno.
        return bloqueado ? { ok: true } : { ok: false, message: this.state.error ?? undefined };
      }
      const montada = await this.repo.getSession();
      if (!montada.ok || !montada.value) {
        const message = montada.ok
          ? 'Perfil corporativo não encontrado para este acesso.'
          : montada.error.message;
        this.set({ busy: false, status: 'anonymous', session: null, gateEmail: null, error: message });
        return { ok: false, message };
      }
      this.set({ busy: false, status: 'authenticated', session: montada.value, error: null, gateEmail: null });
      return { ok: true };
    }

    const res = await this.repo.signIn(email, password);
    if (!res.ok) {
      this.set({
        busy: false,
        status: this.state.session ? 'authenticated' : 'anonymous',
        error: res.error.message,
      });
      return { ok: false, message: res.error.message };
    }
    this.set({ busy: false, status: 'authenticated', session: res.value, error: null, gateEmail: null });
    return { ok: true };
  }

  /**
   * Troca a senha temporária e SÓ ENTÃO reabre o acesso.
   *
   * A liberação nunca vem do retorno da chamada: mesmo com sucesso, o estado é
   * relido do servidor por `restore()`. Um 200 que por qualquer motivo não tenha
   * encerrado o onboarding deixa o usuário exatamente onde estava — no gate.
   */
  async completePasswordChange(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: boolean; message?: string }> {
    if (!this.repo.completeInitialPasswordChange) {
      return { ok: false, message: 'Indisponível neste modo de autenticação.' };
    }
    this.set({ busy: true, error: null });

    const res = await this.repo.completeInitialPasswordChange(currentPassword, newPassword);
    if (!res.ok) {
      // Gate PERMANECE: o status não é tocado.
      this.set({ busy: false });
      return { ok: false, message: res.error.message };
    }

    // A troca invalida o token corrente em alguns provedores; renovar antes de
    // reler evita que a reconsulta falhe por credencial vencida.
    await this.repo.refreshSession?.().catch(() => undefined);
    await this.restore();
    this.set({ busy: false });

    if (this.state.status === 'password_change_required') {
      return {
        ok: false,
        message: 'A senha foi alterada, mas a liberação do acesso não concluiu. Entre novamente.',
      };
    }
    if (this.state.status !== 'authenticated') {
      return {
        ok: false,
        message: this.state.error ?? 'Não foi possível concluir o acesso. Entre novamente.',
      };
    }
    return { ok: true };
  }

  async signOut(): Promise<void> {
    this.set({ busy: true });
    await this.repo.signOut().catch(() => undefined);
    this.set({ busy: false, status: 'anonymous', session: null, error: null, gateEmail: null });
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
