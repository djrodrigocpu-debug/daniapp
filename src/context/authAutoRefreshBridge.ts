/**
 * Ciclo de vida do auto-refresh do token Supabase no runtime NATIVO.
 *
 * O auth-js só renova o token enquanto o timer está ligado. No navegador ele se
 * vira sozinho, mas no nativo o app é congelado em background: o timer para de
 * disparar e o refresh token vence sem ninguém perceber. A recomendação do
 * próprio auth-js é ligar/desligar o refresh conforme o `AppState`.
 *
 * A lógica testável recebe `auth` e o `AppState` por injeção; o acoplamento com
 * a plataforma fica isolado em `installNativeAutoRefresh`.
 */

/** Superfície mínima do `supabase.auth` usada aqui. */
export interface AutoRefreshAuth {
  startAutoRefresh(): unknown;
  stopAutoRefresh(): unknown;
}

/** Superfície mínima do `AppState` do React Native. */
export interface AppStateAdapter {
  currentState: string | null;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

/**
 * Nem `startAutoRefresh` nem `stopAutoRefresh` são aguardados: são efeitos de
 * ciclo de vida. Uma rejeição aqui viraria unhandled rejection e derrubaria o
 * app por um refresh que será tentado de novo no próximo evento.
 */
function callSafely(fn: () => unknown): void {
  try {
    const result = fn();
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // silencioso de propósito
  }
}

/**
 * Liga o refresh enquanto o app está em `active` e desliga em qualquer outro
 * estado (`background`, `inactive` ou desconhecido — na dúvida, desliga).
 *
 * Devolve o cleanup, que é IDEMPOTENTE: remove o listener e desliga o refresh
 * na primeira chamada e não repete efeito nenhum nas seguintes (o Strict Mode
 * do React e trocas de cliente podem invocá-lo mais de uma vez).
 */
export function installAutoRefreshLifecycle(auth: AutoRefreshAuth, appState: AppStateAdapter): () => void {
  let encerrado = false;

  const aplicar = (estado: string | null): void => {
    if (encerrado) return;
    if (estado === 'active') callSafely(() => auth.startAutoRefresh());
    else callSafely(() => auth.stopAutoRefresh());
  };

  // Assina antes de aplicar o estado inicial para não perder uma transição que
  // aconteça durante a instalação.
  const subscription = appState.addEventListener('change', aplicar);
  aplicar(appState.currentState);

  return () => {
    if (encerrado) return;
    encerrado = true;
    subscription.remove();
    callSafely(() => auth.stopAutoRefresh());
  };
}

/**
 * `react-native` NÃO é importado no topo, pelo mesmo motivo documentado em
 * `authCallbackBridge.ts`: este módulo entra na cadeia do AuthProvider, que é
 * alcançado por testes rodando em Node puro, e o pacote RN traz sintaxe Flow que
 * o parser do vitest não lê. O `AppState` é carregado sob demanda no nativo.
 */
async function nativeAppState(): Promise<AppStateAdapter | null> {
  try {
    const rn = await import('react-native');
    return rn.AppState as never;
  } catch {
    return null;
  }
}

/**
 * Instala o ciclo de vida para o `auth` de um cliente Supabase.
 *
 *  - sem cliente (modo demo/local): não instala nada;
 *  - no web: não instala nada e nem carrega `AppState` — o auth-js já cuida do
 *    refresh no navegador e o fluxo web fica intocado;
 *  - no nativo: carrega o `AppState` e delega a `installAutoRefreshLifecycle`.
 *
 * Falhar ao obter o `react-native` não derruba o AuthProvider: o app segue sem
 * o controle de ciclo de vida em vez de quebrar no boot.
 *
 * `loadAppState` existe para injeção nos testes; o padrão é o carregamento real.
 */
export function installNativeAutoRefresh(
  auth: AutoRefreshAuth | null,
  loadAppState: () => Promise<AppStateAdapter | null> = nativeAppState,
): () => void {
  const isWebRuntime = typeof document !== 'undefined';
  if (!auth || isWebRuntime) return () => {};

  let dispose: (() => void) | null = null;
  let cancelado = false;

  void loadAppState().then((appState) => {
    // O cleanup pode chegar antes do AppState resolver; então nada é instalado.
    if (!appState || cancelado) return;
    dispose = installAutoRefreshLifecycle(auth, appState);
  });

  return () => {
    if (cancelado) return;
    cancelado = true;
    dispose?.();
    dispose = null;
  };
}
