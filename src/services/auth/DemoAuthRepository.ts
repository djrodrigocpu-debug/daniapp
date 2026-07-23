/**
 * AuthRepository de DEMONSTRAÇÃO — EXCLUSIVO de desenvolvimento (§8, §23).
 *
 * Cumpre o mesmo contrato que o SupabaseAuthRepository, para que a UI e o
 * AuthController funcionem de ponta a ponta em dev SEM backend provisionado.
 * Regras de segurança respeitadas:
 *   - NÃO valida senha embutida (não há senha demo no bundle — T30);
 *   - diretório de perfis é FICTÍCIO e identificado (sem PII real — §23);
 *   - a fábrica (authFactory) só o habilita fora de produção.
 *
 * Os identificadores coincidem com os do cenário de homologação em
 * `src/db/testing/fixtures.ts`, para consistência entre app demo e testes de RLS.
 */
import { AuthRepository, AuthenticatedSession } from '../../domain/repositories';
import { UserAccount, UserScope, Role } from '../../domain/model';
import { rolesFromScopes } from '../../domain/auth/session';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';

export interface DemoProfile {
  user: UserAccount;
  scopes: UserScope[];
}

const now = () => new Date().toISOString();
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

function scope(partial: Partial<UserScope> & { userId: string; role: Role }): UserScope {
  return {
    id: `scope_${partial.userId}_${partial.role}`,
    regionId: null,
    coordinationId: null,
    unitId: null,
    operationIds: [],
    validFrom: '2020-01-01T00:00:00.000Z',
    validTo: null,
    active: true,
    ...partial,
  };
}

function account(id: string, name: string, email: string): UserAccount {
  return {
    id,
    displayName: name,
    corporateEmail: email,
    status: 'active',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

/** Diretório fictício dos quatro perfis (+2 GCs em escopos distintos). */
export const DEMO_DIRECTORY: DemoProfile[] = [
  {
    user: account('00000000-0000-0000-0000-000000001001', 'Admin (demo)', 'admin@demo.local'),
    scopes: [scope({ userId: '00000000-0000-0000-0000-000000001001', role: 'admin' })],
  },
  {
    user: account('00000000-0000-0000-0000-000000001002', 'Regional (demo)', 'regional@demo.local'),
    scopes: [scope({ userId: '00000000-0000-0000-0000-000000001002', role: 'regional', regionId: '00000000-0000-0000-0000-00000000b001' })],
  },
  {
    user: account('00000000-0000-0000-0000-000000001003', 'Coordenador (demo)', 'coordenador@demo.local'),
    scopes: [scope({ userId: '00000000-0000-0000-0000-000000001003', role: 'coordinator', coordinationId: '00000000-0000-0000-0000-00000000d001' })],
  },
  {
    user: account('00000000-0000-0000-0000-000000001005', 'GC A (demo)', 'gca@demo.local'),
    scopes: [scope({ userId: '00000000-0000-0000-0000-000000001005', role: 'channel_manager', operationIds: ['00000000-0000-0000-0000-00000000e001'] })],
  },
  {
    user: account('00000000-0000-0000-0000-000000001006', 'GC B (demo)', 'gcb@demo.local'),
    scopes: [scope({ userId: '00000000-0000-0000-0000-000000001006', role: 'channel_manager', operationIds: ['00000000-0000-0000-0000-00000000e002'] })],
  },
];

export class DemoAuthRepository implements AuthRepository {
  private current: AuthenticatedSession | null = null;

  constructor(
    private readonly directory: DemoProfile[] = DEMO_DIRECTORY,
    private readonly clock: () => string = now,
  ) {}

  private toSession(profile: DemoProfile): AuthenticatedSession {
    const nowISO = this.clock();
    return {
      user: profile.user,
      scopes: profile.scopes,
      roles: rolesFromScopes(profile.scopes, nowISO),
      accessTokenExpiresAt: new Date(Date.parse(nowISO) + EIGHT_HOURS_MS).toISOString(),
    };
  }

  // Sem senha (dev): identifica o perfil apenas pelo e-mail fictício.
  async signIn(email: string, _password: string): Promise<Result<AuthenticatedSession>> {
    const profile = this.directory.find(
      (p) => p.user.corporateEmail.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!profile) {
      return err(new AppError('auth/invalid-credentials', 'Perfil de demonstração não encontrado.', { severity: 'low' }));
    }
    this.current = this.toSession(profile);
    return ok(this.current);
  }

  async signOut(): Promise<Result<true>> {
    this.current = null;
    return ok(true);
  }

  async getSession(): Promise<Result<AuthenticatedSession | null>> {
    return ok(this.current);
  }

  async requestPasswordReset(_email: string): Promise<Result<true>> {
    return ok(true);
  }
}
