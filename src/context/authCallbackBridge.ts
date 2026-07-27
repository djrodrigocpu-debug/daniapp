/**
 * Ponte entre a URL de entrada do app e o fluxo de onboarding.
 *
 * Isola o que é específico de plataforma (window.location no web,
 * Linking no nativo) para que o AuthProvider fique com a orquestração e este
 * módulo possa ser testado injetando as dependências.
 *
 * NUNCA registra a URL completa nem qualquer parâmetro: `code`, `token_hash`,
 * `access_token` e `refresh_token` jamais aparecem em log.
 */
import { stripAuthParams } from '../domain/auth/callbackLink';

/**
 * `react-native` NÃO é importado no topo de propósito: este módulo entra na
 * cadeia do AuthProvider, que é carregado por testes de domínio rodando em Node
 * puro — e o pacote RN traz sintaxe Flow que o parser do vitest não lê. O
 * `Linking` do core é carregado sob demanda, só no caminho nativo.
 */
const isWeb = typeof document !== 'undefined';

async function nativeLinking(): Promise<{
  getInitialURL(): Promise<string | null>;
  addEventListener(t: string, h: (e: { url: string }) => void): { remove(): void };
} | null> {
  try {
    const rn = await import('react-native');
    return rn.Linking as never;
  } catch {
    return null;
  }
}

/** Lê a URL de entrada. null quando não há nada a interpretar. */
export async function getInitialUrl(): Promise<string | null> {
  if (isWeb) {
    // `globalThis.location` evita quebrar em SSR/teste, onde window não existe.
    const loc = (globalThis as { location?: { href?: string } }).location;
    return loc?.href ?? null;
  }
  const linking = await nativeLinking();
  if (!linking) return null;
  try {
    return await linking.getInitialURL();
  } catch {
    return null;
  }
}

/**
 * Assina links recebidos com o app já aberto (só faz sentido no nativo).
 * Devolve a função de cancelamento — o chamador DEVE invocá-la no unmount,
 * senão um segundo listener consumiria o mesmo link duas vezes.
 */
export function subscribeToLinks(onUrl: (url: string) => void): () => void {
  if (isWeb) return () => {};
  let sub: { remove(): void } | null = null;
  let cancelado = false;
  void nativeLinking().then((linking) => {
    if (!linking || cancelado) return;
    sub = linking.addEventListener('url', (event: { url: string }) => onUrl(event.url));
  });
  return () => {
    cancelado = true;
    sub?.remove();
  };
}

/**
 * Remove os parâmetros sensíveis da barra de endereço depois de consumir o
 * link. Usa replaceState (não pushState) para que o botão Voltar do navegador
 * não reabra uma URL com token já gasto.
 */
export function cleanBrowserUrl(currentUrl: string): void {
  if (!isWeb) return;
  const history = (globalThis as { history?: { replaceState?: (a: unknown, b: string, c: string) => void } }).history;
  if (!history?.replaceState) return;
  const limpa = stripAuthParams(currentUrl);
  if (limpa !== currentUrl) history.replaceState(null, '', limpa);
}
