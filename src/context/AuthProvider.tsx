/**
 * Provider de AUTENTICAÇÃO CORPORATIVA (Masterplan §8, §10). Fonte de verdade da
 * sessão para a UI — dirige o AuthController sobre o backend escolhido pela
 * fábrica (Supabase quando configurado; demo apenas em dev; recusa em prod sem
 * config). Restaura a sessão no boot e expõe login/logout tipados.
 *
 * Estratégia strangler (§9.3, §28): coexiste com o AppContext demonstrativo. As
 * telas migram deste provider progressivamente; a autenticação já passa por aqui.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { runtimeConfig } from '../config/runtime';
import { parseAuthCallback } from '../domain/auth/callbackLink';
import { OnboardingPhase, ProfileStatus, decidePhase } from '../domain/auth/onboardingFlow';
import { cleanBrowserUrl, getInitialUrl, subscribeToLinks } from './authCallbackBridge';
import { installNativeAutoRefresh } from './authAutoRefreshBridge';
import { getSupabaseClient } from '../services/supabase/client';
import { createAuthBackend, AuthMode } from '../services/auth/authFactory';
import { AuthController, AuthState } from '../services/auth/AuthController';
import { currentOperationalDemoDirectory } from '../data/demoDirectory';

/** Situacao do fluxo de link (convite/recuperacao). */
export interface OnboardingState {
  phase: OnboardingPhase;
  message: string | null;
  needsActivation: boolean;
  accountLabel: string | null;
}

const SEM_ONBOARDING: OnboardingState = {
  phase: 'none', message: null, needsActivation: false, accountLabel: null,
};

interface AuthContextValue {
  state: AuthState;
  mode: AuthMode;
  /** Fase do onboarding por link; 'none' no boot normal. */
  onboarding: OnboardingState;
  /** Chamado pela tela de senha apos sucesso completo. */
  finishOnboarding: () => Promise<void>;
  /** Cancela: encerra a sessao temporaria e volta ao login. */
  cancelOnboarding: () => Promise<void>;
  /** Descarta a mensagem de erro de callback e volta ao login. */
  dismissOnboardingError: () => void;
  /** Define a senha do usuario autenticado pelo link. */
  updatePassword: (password: string) => Promise<{ ok: boolean; message?: string }>;
  /**
   * Troca a senha temporaria do primeiro acesso (gate). Delega ao controlador,
   * que so libera apos RELER `password_change_status` no servidor.
   */
  changeInitialPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Ativa o proprio perfil apos o convite (RPC activate_self). */
  activateSelf: () => Promise<{ ok: boolean; message?: string }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; message?: string }>;
  controller: AuthController;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const backend = useMemo(() => {
    const config = runtimeConfig;
    const client = getSupabaseClient(config);
    // Em modo demo, o diretório de perfis é derivado do estado operacional VIVO
    // (não do seed) para que a sessão mapeie 1:1 no `User` operacional (§9.3) e
    // para que quem foi cadastrado/importado na aba Admin consiga entrar.
    return createAuthBackend(config, client, { demoDirectory: currentOperationalDemoDirectory });
  }, []);

  // `getSupabaseClient` é singleton: devolve exatamente a mesma instância usada
  // pela fábrica acima, sem criar um segundo cliente. `null` em modo demo/local.
  const supabaseAuth = useMemo(() => getSupabaseClient(runtimeConfig)?.auth ?? null, []);

  // Liga o refresh do token com o app em foreground e desliga em background
  // (só no nativo — no web o bridge é um no-op).
  useEffect(() => installNativeAutoRefresh(supabaseAuth), [supabaseAuth]);

  const controllerRef = useRef<AuthController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new AuthController(backend.repository);
  }
  const controller = controllerRef.current;

  const [state, setState] = useState<AuthState>(controller.getState());
  const [onboarding, setOnboarding] = useState<OnboardingState>(SEM_ONBOARDING);
  /**
   * Trava de consumo unico. O React Strict Mode monta o efeito duas vezes em
   * desenvolvimento; sem isto o mesmo `code` seria trocado duas vezes e a
   * segunda tentativa falharia com "link ja utilizado" sem motivo real.
   */
  const callbackConsumido = useRef(false);

  /** Consome um link de convite/recuperacao. Nunca registra a URL nem o token. */
  const consumirCallback = React.useCallback(async (url: string | null) => {
    const intent = parseAuthCallback(url);
    if (intent.kind === 'none') return;

    if (intent.kind === 'error') {
      callbackConsumido.current = true;
      cleanBrowserUrl(url ?? '');
      setOnboarding({ phase: 'callback_error', message: intent.message, needsActivation: false, accountLabel: null });
      return;
    }

    if (callbackConsumido.current) return;
    callbackConsumido.current = true;

    const repo = backend.repository;
    if (!repo.completeAuthCallback) {
      // Modo demonstracao nao tem link de e-mail para consumir.
      cleanBrowserUrl(url ?? '');
      return;
    }

    const res = await repo.completeAuthCallback(
      intent.kind === 'pkce_code'
        ? { kind: 'pkce_code', code: intent.code }
        : intent.kind === 'token_hash'
          ? { kind: 'token_hash', tokenHash: intent.tokenHash, purpose: intent.purpose }
          : { kind: 'tokens', accessToken: intent.accessToken, refreshToken: intent.refreshToken },
    );

    // A URL e limpa SEMPRE, deu certo ou nao: token gasto nao volta a barra.
    cleanBrowserUrl(url ?? '');

    if (!res.ok) {
      setOnboarding({ phase: 'callback_error', message: res.error.message, needsActivation: false, accountLabel: null });
      return;
    }

    // A decisao vem do STATUS REAL do perfil, nunca do `type` da URL.
    const decisao = decidePhase((res.value.user.status as ProfileStatus) ?? null);
    setOnboarding({ ...decisao, accountLabel: res.value.user.corporateEmail ?? null });
  }, [backend.repository]);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void (async () => {
      await consumirCallback(await getInitialUrl());
      await controller.restore();
    })();
    // Links recebidos com o app ja aberto (nativo).
    const unsubscribeLinks = subscribeToLinks((url) => { void consumirCallback(url); });
    return () => {
      unsubscribe();
      unsubscribeLinks();
    };
  }, [controller, consumirCallback]);

  const finishOnboarding = React.useCallback(async () => {
    setOnboarding(SEM_ONBOARDING);
    await controller.restore();
  }, [controller]);

  const cancelOnboarding = React.useCallback(async () => {
    setOnboarding(SEM_ONBOARDING);
    await controller.signOut();
  }, [controller]);

  const dismissOnboardingError = React.useCallback(() => setOnboarding(SEM_ONBOARDING), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      mode: backend.mode,
      onboarding,
      finishOnboarding,
      cancelOnboarding,
      dismissOnboardingError,
      updatePassword: async (password: string) => {
        const r = await backend.repository.updatePassword?.(password);
        if (!r) return { ok: false, message: 'Indisponível neste modo de autenticação.' };
        return r.ok ? { ok: true } : { ok: false, message: r.error.message };
      },
      activateSelf: async () => {
        const r = await backend.repository.activateSelf?.();
        if (!r) return { ok: false, message: 'Indisponível neste modo de autenticação.' };
        return r.ok ? { ok: true } : { ok: false, message: r.error.message };
      },
      changeInitialPassword: (currentPassword, newPassword) =>
        controller.completePasswordChange(currentPassword, newPassword),
      signIn: (email, password) => controller.signIn(email, password),
      signOut: () => controller.signOut(),
      requestPasswordReset: async (email: string) => {
        const res = await backend.repository.requestPasswordReset(email);
        return res.ok
          ? { ok: true }
          : { ok: false, message: res.error.message };
      },
      controller,
    }),
    [state, backend.mode, backend.repository, controller, onboarding, finishOnboarding, cancelOnboarding, dismissOnboardingError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return ctx;
}
