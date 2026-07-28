/**
 * Decide QUAL superfície o aplicativo mostra. Módulo PURO: sem React, sem SDK,
 * sem I/O.
 *
 * POR QUE EXISTE: a regra "quem deve a troca da senha temporária não vê nada
 * operacional" é de segurança, não de layout. Enquanto ela morava dentro de uma
 * sequência de `if`s no navegador, só dava para conferi-la lendo o arquivo —
 * e o projeto não tem renderizador de componentes nos testes. Aqui ela é uma
 * função determinística, exercitável em todas as combinações.
 *
 * A ORDEM das decisões é a regra. Em particular, `password_change` vem ANTES de
 * qualquer coisa operacional e antes dos fluxos de link: com a troca pendente
 * não existe sessão corporativa, logo não existe papel para navegar.
 */
import { AuthStatus } from '../../services/auth/AuthController';
import { OnboardingPhase } from './onboardingFlow';

export type AppSurface =
  /** Boot: restaurando sessão ou hidratando dados locais. */
  | 'loading'
  /** GATE de primeiro acesso: só a troca da senha temporária. */
  | 'password_change'
  /** Conclusão de convite/recuperação por link. */
  | 'password_setup'
  /** Link inválido, perfil suspenso ou sessão sem perfil corporativo. */
  | 'callback_error'
  /** Sem sessão corporativa. */
  | 'login'
  /** Autenticado, porém sem papel/escopo ativo. */
  | 'no_scope'
  /** Navegação operacional completa (abas, Admin, Parceiros…). */
  | 'app';

export interface SurfaceInput {
  authStatus: AuthStatus;
  /** Dados locais já hidratados. */
  localReady: boolean;
  onboardingPhase: OnboardingPhase;
  /** Existe usuário operacional derivado da sessão corporativa. */
  hasOperationalUser: boolean;
}

export function decideSurface(input: SurfaceInput): AppSurface {
  if (input.authStatus === 'initializing' || !input.localReady) return 'loading';

  // Precedência máxima. Não depende da fase de link nem de haver usuário
  // operacional: `password_change_required` já significa que a sessão
  // corporativa não foi montada.
  if (input.authStatus === 'password_change_required') return 'password_change';

  if (input.onboardingPhase === 'password_setup') return 'password_setup';
  if (
    input.onboardingPhase === 'callback_error'
    || input.onboardingPhase === 'blocked'
    || input.onboardingPhase === 'no_profile'
  ) {
    return 'callback_error';
  }

  if (input.authStatus !== 'authenticated') return 'login';
  if (!input.hasOperationalUser) return 'no_scope';
  return 'app';
}
