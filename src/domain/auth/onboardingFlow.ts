/**
 * Máquina de estados do onboarding por link (convite e recuperação de senha).
 *
 * Módulo PURO: sem React, sem SDK, sem I/O. As dependências assíncronas são
 * injetadas, então cada regra abaixo é testável isoladamente — inclusive a
 * falha intermediária, que é a parte que mais dá errado na prática.
 *
 * REGRA CENTRAL: o parâmetro `type` da URL é uma DICA, nunca a autorização.
 * Quem decide o que liberar é o `status` do perfil vindo do servidor. Um link
 * dizendo "invite" para um perfil `suspended` não reativa ninguém.
 */

/** Status do perfil corporativo (public.users.status). */
export type ProfileStatus = 'invited' | 'active' | 'suspended' | 'inactive';

/** Fase da aplicação enquanto o link está sendo tratado. */
export type OnboardingPhase =
  /** Sem callback: boot normal (login ou sessão restaurada). */
  | 'none'
  /** Link válido consumido: há sessão temporária, falta definir a senha. */
  | 'password_setup'
  /** Link inválido, expirado ou já usado. */
  | 'callback_error'
  /** Autenticado no Auth, mas sem perfil corporativo. */
  | 'no_profile'
  /** Perfil suspenso ou inativo: não se reativa por link. */
  | 'blocked';

export interface PhaseDecision {
  phase: OnboardingPhase;
  /** Mensagem pronta para a tela; null quando não há erro. */
  message: string | null;
  /** true quando o fluxo ainda precisa chamar activate_self ao final. */
  needsActivation: boolean;
}

/**
 * Decide a fase a partir do que o SERVIDOR devolveu depois de consumir o link.
 * `profileStatus` null significa sessão sem linha em public.users.
 */
export function decidePhase(profileStatus: ProfileStatus | null): PhaseDecision {
  if (profileStatus === null) {
    return {
      phase: 'no_profile',
      message: 'Seu acesso foi autenticado, mas ainda não há um perfil corporativo vinculado. '
        + 'Procure o Administrador.',
      needsActivation: false,
    };
  }
  if (profileStatus === 'suspended' || profileStatus === 'inactive') {
    return {
      phase: 'blocked',
      message: 'Este acesso está suspenso ou inativo. Um link de convite não reativa a conta — '
        + 'procure o Administrador.',
      needsActivation: false,
    };
  }
  // 'invited' precisa ativar ao final; 'active' (recuperação) apenas troca a senha.
  return { phase: 'password_setup', message: null, needsActivation: profileStatus === 'invited' };
}

// ---------------------------------------------------------------------------
// Conclusão: trocar a senha e, quando for convite, ativar.
// ---------------------------------------------------------------------------

export interface CompletionDeps {
  updatePassword(password: string): Promise<{ ok: boolean; message?: string }>;
  activateSelf(): Promise<{ ok: boolean; message?: string }>;
}

/**
 * Progresso do envio. Sobrevive entre tentativas para que um RETRY após falha
 * de ativação NÃO troque a senha de novo — trocar duas vezes é desnecessário,
 * confunde o usuário e, se a segunda falhar, deixaria a conta pior do que estava.
 */
export interface CompletionProgress {
  passwordSet: boolean;
  activated: boolean;
}

export const INITIAL_PROGRESS: CompletionProgress = { passwordSet: false, activated: false };

export interface CompletionResult {
  ok: boolean;
  progress: CompletionProgress;
  /** Mensagem para a tela: sucesso ou motivo seguro da falha. */
  message: string;
  /** true quando vale oferecer "tentar novamente" sem refazer tudo. */
  retryable: boolean;
}

/**
 * Executa a conclusão de forma RETOMÁVEL.
 *
 * Sequência: updatePassword → (se convite) activateSelf. Se a senha já foi
 * trocada numa tentativa anterior, pula direto para a ativação. Só declara
 * sucesso quando TUDO que era necessário concluiu — nunca libera acesso porque
 * "a senha funcionou".
 */
export async function completePasswordSetup(
  deps: CompletionDeps,
  password: string,
  needsActivation: boolean,
  progress: CompletionProgress = INITIAL_PROGRESS,
): Promise<CompletionResult> {
  const atual: CompletionProgress = { ...progress };

  if (!atual.passwordSet) {
    const senha = await deps.updatePassword(password);
    if (!senha.ok) {
      return {
        ok: false,
        progress: atual,
        message: senha.message || 'Não foi possível definir a senha. Tente novamente.',
        retryable: true,
      };
    }
    atual.passwordSet = true;
  }

  if (needsActivation && !atual.activated) {
    const ativacao = await deps.activateSelf();
    if (!ativacao.ok) {
      // Ponto crítico: a senha JÁ vale, mas o acesso não foi liberado. Dizer
      // "sucesso" aqui seria mentira, e refazer a senha seria inútil.
      return {
        ok: false,
        progress: atual,
        message: 'Sua senha foi definida, mas a liberação do acesso não pôde ser concluída. '
          + 'Toque em tentar novamente — sua senha já está salva e não será alterada.',
        retryable: true,
      };
    }
    atual.activated = true;
  }

  return {
    ok: true,
    progress: atual,
    message: needsActivation
      ? 'Acesso liberado. Sua senha foi definida e seu perfil está ativo.'
      : 'Senha atualizada com sucesso.',
    retryable: false,
  };
}
