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
import { getRuntimeConfig } from '../config/env';
import { getSupabaseClient } from '../services/supabase/client';
import { createAuthBackend, AuthMode } from '../services/auth/authFactory';
import { AuthController, AuthState } from '../services/auth/AuthController';
import { operationalDemoDirectory } from '../data/demoDirectory';

interface AuthContextValue {
  state: AuthState;
  mode: AuthMode;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; message?: string }>;
  controller: AuthController;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const backend = useMemo(() => {
    const config = getRuntimeConfig();
    const client = getSupabaseClient(config);
    // Em modo demo, o diretório de perfis é derivado do seed operacional para
    // que a sessão corporativa mapeie 1:1 no `User` operacional (§9.3).
    return createAuthBackend(config, client, { demoDirectory: operationalDemoDirectory });
  }, []);

  const controllerRef = useRef<AuthController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new AuthController(backend.repository);
  }
  const controller = controllerRef.current;

  const [state, setState] = useState<AuthState>(controller.getState());

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void controller.restore();
    return unsubscribe;
  }, [controller]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      mode: backend.mode,
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
    [state, backend.mode, backend.repository, controller],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return ctx;
}
