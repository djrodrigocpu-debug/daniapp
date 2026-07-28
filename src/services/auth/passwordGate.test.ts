/**
 * GATE de primeiro acesso — comportamento do cliente.
 *
 * A regra provada aqui é uma só: enquanto o SERVIDOR disser `required = true`,
 * nenhuma sessão corporativa é montada. Não há perfil, não há escopo, não há
 * papel — e portanto não há rota operacional a renderizar.
 *
 * Os pontos onde um gate costuma vazar estão todos cobertos: sessão restaurada
 * (recarga da página, reabertura do app, refresh token), resposta 200 da troca
 * sem conclusão no servidor, e falha de leitura do próprio gate.
 *
 * Senhas fictícias (§23). Nenhum backend real é tocado.
 */
import { describe, it, expect } from 'vitest';
import { AuthController } from './AuthController';
import {
  AuthRepository,
  AuthenticatedSession,
  PasswordGateState,
} from '../../domain/repositories';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { decideSurface } from '../../domain/auth/appSurface';
import { checkInitialPasswordForm } from '../../domain/auth/initialPasswordForm';

const EMAIL = 'pessoa.sintetica@sint.test';
const SENHA_TEMP = 'TempoRaria2026';
const SENHA_NOVA = 'NovaSenhaForte2026';

const SESSAO: AuthenticatedSession = {
  user: {
    id: '00000000-0000-0000-0000-0000000090a1',
    displayName: 'Pessoa Sintética',
    corporateEmail: EMAIL,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  scopes: [],
  roles: ['admin'],
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
};

interface GateOptions {
  /** Estado devolvido por `password_change_status` no servidor. */
  required?: boolean;
  authenticated?: boolean;
  /** A leitura do gate falha (rede/RPC fora do ar). */
  gateIlegivel?: boolean;
  /** A Edge Function recusa a troca. */
  trocaFalha?: boolean;
  /**
   * A troca responde 200 MAS o servidor continua exigindo. Reproduz a conclusão
   * que não gravou — o caso em que confiar no 200 liberaria acesso indevido.
   */
  trocaNaoEncerra?: boolean;
}

/** Repositório-duplo com as portas do gate. Registra a ordem das chamadas. */
class GateRepository implements AuthRepository {
  readonly calls: string[] = [];
  private required: boolean;

  constructor(private readonly options: GateOptions = {}) {
    this.required = options.required ?? true;
  }

  async signIn(): Promise<Result<AuthenticatedSession>> {
    // Existe só para cumprir o contrato: o caminho com gate não passa por aqui,
    // e é justamente isso que o teste 17 confere.
    this.calls.push('signIn');
    return ok(SESSAO);
  }

  async signInRaw(): Promise<Result<true>> {
    this.calls.push('signInRaw');
    return ok(true);
  }

  async passwordGate(): Promise<Result<PasswordGateState>> {
    this.calls.push('passwordGate');
    if (this.options.gateIlegivel) {
      return err(new AppError('unknown', 'Não foi possível verificar o estado do seu acesso.'));
    }
    return ok({
      authenticated: this.options.authenticated ?? true,
      required: this.required,
      email: EMAIL,
    });
  }

  async completeInitialPasswordChange(): Promise<Result<true>> {
    this.calls.push('completeInitialPasswordChange');
    if (this.options.trocaFalha) {
      return err(new AppError('auth/invalid-credentials', 'Senha atual incorreta.'));
    }
    // Sucesso no provedor encerra o onboarding no servidor — exceto quando o
    // cenário pede exatamente o contrário.
    if (!this.options.trocaNaoEncerra) this.required = false;
    return ok(true);
  }

  async refreshSession(): Promise<Result<true>> {
    this.calls.push('refreshSession');
    return ok(true);
  }

  async getSession(): Promise<Result<AuthenticatedSession | null>> {
    this.calls.push('getSession');
    return ok(SESSAO);
  }

  async signOut(): Promise<Result<true>> {
    this.calls.push('signOut');
    return ok(true);
  }

  async requestPasswordReset(): Promise<Result<true>> { return ok(true); }
}

describe('16 — conta sem troca pendente entra normalmente', () => {
  it('login monta a sessão corporativa quando required = false', async () => {
    const repo = new GateRepository({ required: false });
    const c = new AuthController(repo);
    expect(await c.signIn(EMAIL, SENHA_TEMP)).toEqual({ ok: true });
    expect(c.getState().status).toBe('authenticated');
    expect(c.getState().session).not.toBeNull();
    expect(c.getState().gateEmail).toBeNull();
    // O gate é consultado ANTES de montar a sessão, mesmo quando libera.
    expect(repo.calls.indexOf('passwordGate')).toBeLessThan(repo.calls.indexOf('getSession'));
  });

  it('restauração de sessão liberada também entra', async () => {
    const c = new AuthController(new GateRepository({ required: false }));
    await c.restore();
    expect(c.getState().status).toBe('authenticated');
  });
});

describe('17 — required = true NÃO monta sessão corporativa', () => {
  it('login retém no gate sem perfil, escopo nem papel', async () => {
    const repo = new GateRepository({ required: true });
    const c = new AuthController(repo);
    await c.signIn(EMAIL, SENHA_TEMP);

    expect(c.getState().status).toBe('password_change_required');
    expect(c.getState().session).toBeNull();
    expect(c.roles()).toEqual([]);
    expect(c.hasRole('admin')).toBe(false);
    expect(c.isAuthenticated()).toBe(false);
    expect(c.getState().gateEmail).toBe(EMAIL);
  });

  it('nada que monte a sessão corporativa chega a ser chamado', async () => {
    const repo = new GateRepository({ required: true });
    await new AuthController(repo).signIn(EMAIL, SENHA_TEMP);
    // `getSession` é quem consulta users/user_scopes/operation_assignments.
    expect(repo.calls).not.toContain('getSession');
    // `signIn` do repositório devolveria a sessão JÁ montada.
    expect(repo.calls).not.toContain('signIn');
  });
});

describe('18 — sessão restaurada continua bloqueada', () => {
  it('recarga/reabertura com sessão persistida volta ao gate', async () => {
    const repo = new GateRepository({ required: true });
    const c = new AuthController(repo);
    await c.restore();
    expect(c.getState().status).toBe('password_change_required');
    expect(c.getState().session).toBeNull();
    expect(repo.calls).not.toContain('getSession');
  });

  it('restaurar repetidas vezes nunca acumula liberação', async () => {
    const c = new AuthController(new GateRepository({ required: true }));
    for (let i = 0; i < 3; i += 1) await c.restore();
    expect(c.getState().status).toBe('password_change_required');
  });

  it('falha ao LER o gate não libera: fecha o acesso', async () => {
    const repo = new GateRepository({ gateIlegivel: true });
    const c = new AuthController(repo);
    await c.restore();
    expect(c.getState().status).toBe('anonymous');
    expect(c.getState().session).toBeNull();
    expect(c.getState().error).toBeTruthy();
    expect(repo.calls).not.toContain('getSession');
  });

  it('sem sessão no provedor o estado é anônimo, não gate', async () => {
    const c = new AuthController(new GateRepository({ authenticated: false }));
    await c.restore();
    expect(c.getState().status).toBe('anonymous');
    expect(c.getState().gateEmail).toBeNull();
  });
});

describe('19 — nenhuma rota operacional é alcançável no gate', () => {
  const fases = ['none', 'password_setup', 'callback_error', 'no_profile', 'blocked'] as const;

  it('a superfície é sempre a troca de senha, em toda combinação', () => {
    for (const onboardingPhase of fases) {
      for (const hasOperationalUser of [true, false]) {
        expect(decideSurface({
          authStatus: 'password_change_required',
          localReady: true,
          onboardingPhase,
          hasOperationalUser,
        })).toBe('password_change');
      }
    }
  });

  it('a superfície do aplicativo exige sessão corporativa E usuário operacional', () => {
    // 'app' é a única superfície com abas Admin/Parceiros. Só se chega a ela
    // autenticado de fato — nunca a partir do gate.
    const combinacoes = fases.flatMap((onboardingPhase) => [true, false].map((hasOperationalUser) => ({
      authStatus: 'password_change_required' as const,
      localReady: true,
      onboardingPhase,
      hasOperationalUser,
    })));
    expect(combinacoes.map(decideSurface)).not.toContain('app');

    expect(decideSurface({
      authStatus: 'authenticated', localReady: true,
      onboardingPhase: 'none', hasOperationalUser: true,
    })).toBe('app');
  });

  it('o gate precede os fluxos de link e a tela de login', () => {
    expect(decideSurface({
      authStatus: 'password_change_required', localReady: true,
      onboardingPhase: 'password_setup', hasOperationalUser: false,
    })).toBe('password_change');
    expect(decideSurface({
      authStatus: 'anonymous', localReady: true,
      onboardingPhase: 'none', hasOperationalUser: false,
    })).toBe('login');
  });
});

describe('20 — sair funciona a partir do gate', () => {
  it('logout limpa o gate e volta ao anônimo', async () => {
    const repo = new GateRepository({ required: true });
    const c = new AuthController(repo);
    await c.signIn(EMAIL, SENHA_TEMP);
    expect(c.getState().status).toBe('password_change_required');

    await c.signOut();
    expect(c.getState().status).toBe('anonymous');
    expect(c.getState().session).toBeNull();
    expect(c.getState().gateEmail).toBeNull();
    expect(repo.calls).toContain('signOut');
  });
});

describe('21 — validação do formulário antes de qualquer rede', () => {
  it('confirmação divergente bloqueia', () => {
    const r = checkInitialPasswordForm(SENHA_TEMP, SENHA_NOVA, 'OutraCoisa2026');
    expect(r.ok).toBe(false);
    expect(r.issue).toBe('invalid_new');
  });

  it('senha atual ausente bloqueia', () => {
    expect(checkInitialPasswordForm('', SENHA_NOVA, SENHA_NOVA).issue).toBe('missing_current');
  });

  it('nova igual à atual bloqueia', () => {
    expect(checkInitialPasswordForm(SENHA_TEMP, SENHA_TEMP, SENHA_TEMP).issue).toBe('same_password');
  });

  it('nova curta demais bloqueia', () => {
    expect(checkInitialPasswordForm(SENHA_TEMP, 'Curta2026', 'Curta2026').issue).toBe('invalid_new');
  });

  it('nenhuma mensagem ecoa qualquer senha', () => {
    const casos: Array<[string, string, string]> = [
      ['', SENHA_NOVA, SENHA_NOVA],
      [SENHA_TEMP, SENHA_NOVA, 'OutraCoisa2026'],
      [SENHA_TEMP, SENHA_TEMP, SENHA_TEMP],
      [SENHA_TEMP, 'Curta2026', 'Curta2026'],
    ];
    for (const [atual, nova, confirmacao] of casos) {
      const msg = checkInitialPasswordForm(atual, nova, confirmacao).message ?? '';
      for (const segredo of [SENHA_TEMP, SENHA_NOVA, 'OutraCoisa2026', 'Curta2026']) {
        expect(msg).not.toContain(segredo);
      }
    }
  });

  it('formulário válido passa', () => {
    expect(checkInitialPasswordForm(SENHA_TEMP, SENHA_NOVA, SENHA_NOVA).ok).toBe(true);
  });
});

describe('22 — a liberação exige RELER required = false no servidor', () => {
  it('troca bem-sucedida reconsulta o gate e só então monta a sessão', async () => {
    const repo = new GateRepository({ required: true });
    const c = new AuthController(repo);
    await c.signIn(EMAIL, SENHA_TEMP);

    const antes = repo.calls.length;
    expect(await c.completePasswordChange(SENHA_TEMP, SENHA_NOVA)).toEqual({ ok: true });

    const depois = repo.calls.slice(antes);
    // A ordem é: trocar → renovar token → reler o gate → montar a sessão.
    expect(depois).toEqual([
      'completeInitialPasswordChange',
      'refreshSession',
      'passwordGate',
      'getSession',
    ]);
    expect(c.getState().status).toBe('authenticated');
    expect(c.getState().session).not.toBeNull();
    expect(c.getState().gateEmail).toBeNull();
  });
});

describe('23 — HTTP 200 sozinho NÃO libera', () => {
  it('troca aceita cujo servidor continua exigindo mantém o gate', async () => {
    const repo = new GateRepository({ required: true, trocaNaoEncerra: true });
    const c = new AuthController(repo);
    await c.signIn(EMAIL, SENHA_TEMP);

    const r = await c.completePasswordChange(SENHA_TEMP, SENHA_NOVA);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/não concluiu|entre novamente/i);
    expect(c.getState().status).toBe('password_change_required');
    expect(c.getState().session).toBeNull();
    // A releitura aconteceu: é ela que impediu a liberação.
    expect(repo.calls.filter((c2) => c2 === 'passwordGate').length).toBeGreaterThan(1);
    expect(repo.calls).not.toContain('getSession');
  });

  it('a mensagem devolvida não ecoa nenhuma senha', async () => {
    const c = new AuthController(new GateRepository({ required: true, trocaNaoEncerra: true }));
    await c.signIn(EMAIL, SENHA_TEMP);
    const r = await c.completePasswordChange(SENHA_TEMP, SENHA_NOVA);
    expect(`${r.message}`).not.toContain(SENHA_TEMP);
    expect(`${r.message}`).not.toContain(SENHA_NOVA);
  });
});

describe('24 — erro na troca mantém o gate', () => {
  it('recusa da Edge Function não altera o estado', async () => {
    const repo = new GateRepository({ required: true, trocaFalha: true });
    const c = new AuthController(repo);
    await c.signIn(EMAIL, SENHA_TEMP);

    const r = await c.completePasswordChange('ErradaTotal2026', SENHA_NOVA);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Senha atual incorreta.');
    expect(c.getState().status).toBe('password_change_required');
    expect(c.getState().session).toBeNull();
    expect(c.getState().busy).toBe(false);
    // Falhou antes de qualquer releitura: nada de sessão corporativa.
    expect(repo.calls).not.toContain('getSession');
    expect(repo.calls).not.toContain('refreshSession');
  });

  it('tentar de novo continua possível e ainda passa pelo servidor', async () => {
    const repo = new GateRepository({ required: true, trocaFalha: true });
    const c = new AuthController(repo);
    await c.signIn(EMAIL, SENHA_TEMP);
    await c.completePasswordChange('ErradaTotal2026', SENHA_NOVA);
    await c.completePasswordChange('OutraErrada2026', SENHA_NOVA);
    expect(repo.calls.filter((x) => x === 'completeInitialPasswordChange').length).toBe(2);
    expect(c.getState().status).toBe('password_change_required');
  });

  it('backend sem a porta de troca não finge sucesso', async () => {
    class SemPorta extends GateRepository {
      completeInitialPasswordChange = undefined as never;
    }
    const c = new AuthController(new SemPorta({ required: true }));
    await c.restore();
    const r = await c.completePasswordChange(SENHA_TEMP, SENHA_NOVA);
    expect(r.ok).toBe(false);
    expect(c.getState().status).toBe('password_change_required');
  });
});
