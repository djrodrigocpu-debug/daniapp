/**
 * Ponte de identidade demo → sessão corporativa (Masterplan §8, §9.3).
 *
 * O app roda o MESMO fluxo de autenticação corporativa da produção
 * (`AuthProvider` → `AuthController` → `AuthRepository`). Fora de um Supabase
 * provisionado, o backend é o `DemoAuthRepository`, que precisa de um diretório
 * de perfis. Este módulo constrói esse diretório A PARTIR do seed operacional
 * (`src/data/mock.ts`), de modo que:
 *
 *   - o `id`/`e-mail` da conta autenticada coincide com o `User` operacional;
 *   - os escopos derivam do papel e dos vínculos reais do seed (GC → operações
 *     onde é `managerId`; Coordenador → sua coordenadoria; Regional → sua região);
 *   - a sessão emitida tem papéis/expiração reais (não é login fake por e-mail).
 *
 * Assim, ao entrar como `coordenador@aace.app`, a UI recebe uma sessão corporativa
 * cujo `session.user.id === 'U02'`, e o `AppContext` resolve o `User` operacional
 * e o escopo sem nenhum atalho demonstrativo. Em produção, o `SupabaseAuthRepository`
 * ocupa exatamente o mesmo ponto, sem mudança de UI (§9.3 strangler).
 *
 * NUNCA embarca senha (T30): o `DemoAuthRepository` identifica o perfil só pelo
 * e-mail fictício e a fábrica só o habilita fora de produção.
 */
import { Operation, User } from '../types';
import { Role, UserScope } from '../domain/model';
import { DemoProfile } from '../services/auth/DemoAuthRepository';
import { initialData } from './mock';

const EPOCH = '2020-01-01T00:00:00.000Z';

function buildScope(user: User, operations: Operation[]): UserScope {
  const role = user.role as Role;
  const base: UserScope = {
    id: `scope_${user.id}_${role}`,
    userId: user.id,
    role,
    regionId: null,
    coordinationId: null,
    unitId: null,
    operationIds: [],
    validFrom: EPOCH,
    validTo: null,
    active: true,
  };

  switch (role) {
    case 'regional':
      // Região identificada pelo próprio usuário regional (seed sem tabela de regiões).
      return { ...base, regionId: user.id };
    case 'coordinator':
      // As operações do seed referenciam `coordinatorId` = id do coordenador.
      return { ...base, coordinationId: user.id };
    case 'channel_manager':
      return {
        ...base,
        operationIds: operations.filter((op) => op.managerId === user.id).map((op) => op.id),
      };
    case 'admin':
    default:
      return base;
  }
}

/**
 * Constrói o diretório de perfis demo a partir de usuários e operações.
 * Exposto como função para testabilidade; o app usa `operationalDemoDirectory`.
 */
export function buildOperationalDemoDirectory(users: User[], operations: Operation[]): DemoProfile[] {
  return users.map((user) => ({
    user: {
      id: user.id,
      displayName: user.name,
      corporateEmail: user.email,
      status: 'active',
      createdAt: EPOCH,
      updatedAt: EPOCH,
    },
    scopes: [buildScope(user, operations)],
  }));
}

/** Diretório efetivo do app em modo demonstração (derivado do seed operacional). */
export const operationalDemoDirectory: DemoProfile[] = buildOperationalDemoDirectory(
  initialData.users,
  initialData.operations,
);

/** Sessão mínima necessária para resolver a identidade operacional. */
export interface SessionIdentity {
  user: { id: string; corporateEmail: string };
}

/**
 * Resolve o `User` operacional a partir da sessão corporativa autenticada.
 * Casa primeiro por `id` (alinhado no diretório demo e em um provisionamento
 * que reuse os ids) e cai para o e-mail corporativo. Sem correspondência ⇒
 * `null` (perfil autenticado, porém sem vínculo operacional — §7).
 */
export function resolveOperationalUser(session: SessionIdentity | null, users: User[]): User | null {
  if (!session) return null;
  const byId = users.find((user) => user.id === session.user.id);
  if (byId) return byId;
  const email = session.user.corporateEmail.toLowerCase();
  return users.find((user) => user.email.toLowerCase() === email) ?? null;
}
