/**
 * Testes de comportamento do AuthController (ciclo de vida da sessão — §7.1, §8, T10).
 * Usa o DemoAuthRepository real e um repositório-duplo controlável, exercitando as
 * transições de estado de verdade (não apenas tipos).
 */
import { describe, it, expect } from 'vitest';
import { AuthController, AuthState } from './AuthController';
import { DemoAuthRepository } from './DemoAuthRepository';
import { AuthRepository, AuthenticatedSession } from '../../domain/repositories';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';

const gcaEmail = 'gca@demo.local';

function collect(controller: AuthController): AuthState[] {
  const states: AuthState[] = [];
  controller.subscribe((s) => states.push(s));
  return states;
}

describe('AuthController — login/logout/restore com repositório demo', () => {
  it('inicia em initializing e vira anonymous ao restaurar sem sessão', async () => {
    const c = new AuthController(new DemoAuthRepository());
    const states = collect(c);
    expect(states[0].status).toBe('initializing');
    await c.restore();
    expect(c.getState().status).toBe('anonymous');
  });

  it('login válido autentica e deriva papéis do escopo', async () => {
    const c = new AuthController(new DemoAuthRepository());
    const res = await c.signIn(gcaEmail, 'irrelevante');
    expect(res.ok).toBe(true);
    expect(c.isAuthenticated()).toBe(true);
    expect(c.roles()).toEqual(['channel_manager']);
    expect(c.hasRole('channel_manager')).toBe(true);
    expect(c.hasRole('admin')).toBe(false);
  });

  it('login inválido não autentica e expõe mensagem apresentável', async () => {
    const c = new AuthController(new DemoAuthRepository());
    const res = await c.signIn('ninguem@demo.local', 'x');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/não encontrado/i);
    expect(c.getState().status).toBe('anonymous');
    expect(c.getState().error).toBeTruthy();
  });

  it('logout limpa a sessão', async () => {
    const c = new AuthController(new DemoAuthRepository());
    await c.signIn(gcaEmail, 'x');
    await c.signOut();
    expect(c.isAuthenticated()).toBe(false);
    expect(c.getState().session).toBeNull();
  });
});

// Repositório-duplo para controlar sessão restaurada e expiração (T10).
class StubAuthRepository implements AuthRepository {
  constructor(private readonly session: AuthenticatedSession | null) {}
  async signIn(): Promise<Result<AuthenticatedSession>> {
    return this.session ? ok(this.session) : err(new AppError('auth/invalid-credentials', 'x'));
  }
  async signOut(): Promise<Result<true>> { return ok(true); }
  async getSession(): Promise<Result<AuthenticatedSession | null>> { return ok(this.session); }
  async requestPasswordReset(): Promise<Result<true>> { return ok(true); }
}

function sessionExpiring(atISO: string): AuthenticatedSession {
  return {
    user: { id: 'u1', displayName: 'U', corporateEmail: 'u@x', status: 'active', createdAt: '', updatedAt: '' },
    scopes: [],
    roles: ['admin'],
    accessTokenExpiresAt: atISO,
  };
}

describe('AuthController — restauração e expiração de sessão (T10)', () => {
  const fixedNow = '2026-07-22T12:00:00.000Z';

  it('restaura sessão válida', async () => {
    const future = '2026-07-22T20:00:00.000Z';
    const c = new AuthController(new StubAuthRepository(sessionExpiring(future)), () => fixedNow);
    await c.restore();
    expect(c.getState().status).toBe('authenticated');
  });

  it('sessão vencida no boot vira anônima', async () => {
    const past = '2026-07-22T06:00:00.000Z';
    const c = new AuthController(new StubAuthRepository(sessionExpiring(past)), () => fixedNow);
    await c.restore();
    expect(c.getState().status).toBe('anonymous');
    expect(c.getState().session).toBeNull();
  });

  it('ensureFresh derruba a sessão quando o token vence', async () => {
    const soon = '2026-07-22T12:00:01.000Z';
    let clock = '2026-07-22T12:00:00.000Z';
    const c = new AuthController(new StubAuthRepository(sessionExpiring(soon)), () => clock);
    await c.restore();
    expect(c.isAuthenticated()).toBe(true);
    clock = '2026-07-22T13:00:00.000Z';
    expect(c.ensureFresh()).toBe(false);
    expect(c.getState().status).toBe('anonymous');
  });
});
