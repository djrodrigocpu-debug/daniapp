/**
 * CORS da Edge Function — núcleo puro e testável.
 *
 * DEFEITO QUE ISTO CORRIGE: o entrypoint recusava tudo que não fosse POST antes
 * de qualquer outra coisa, então o preflight `OPTIONS` do navegador recebia 405
 * SEM cabeçalho CORS algum. O navegador então bloqueava o POST seguinte, e o app
 * via apenas "Failed to send a request to the Edge Function".
 *
 * Regras que este módulo garante:
 *   1. OPTIONS é respondido ANTES de método, body, JWT, papel ou Supabase;
 *   2. TODA resposta — sucesso e erro — carrega os mesmos cabeçalhos.
 *
 * Fica separado de `index.ts` porque este arquivo não importa nada de Deno,
 * então o vitest exercita as regras sem subir a função.
 */

/**
 * Cabeçalhos que o supabase-js envia no navegador. `apikey` e `x-client-info`
 * são obrigatórios: sem eles o preflight falha mesmo respondendo 200.
 */
export const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

/** Métodos que a função aceita de fato. */
export const ALLOWED_METHODS = 'POST, OPTIONS';

/**
 * Origem permitida. `*` é aceitável aqui porque a função NÃO usa cookies nem
 * credenciais de navegador: a autorização vem do header `Authorization`, que o
 * preflight não dispensa. Com `Allow-Credentials` isto seria inseguro — por
 * isso ele não é emitido.
 */
export function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && origin !== '' ? origin : '*',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** true quando a requisição é o preflight do navegador. */
export function isPreflight(method: string): boolean {
  return method.toUpperCase() === 'OPTIONS';
}

/**
 * Resposta do preflight: 204, sem corpo, só cabeçalhos. Nada é lido da
 * requisição — nem body, nem token — porque o preflight não os carrega.
 */
export function preflightResponse(origin?: string | null): { status: number; headers: Record<string, string> } {
  return { status: 204, headers: corsHeaders(origin) };
}

/** Cabeçalhos de qualquer resposta JSON, de sucesso ou de erro. */
export function jsonHeaders(origin?: string | null): Record<string, string> {
  return { ...corsHeaders(origin), 'Content-Type': 'application/json' };
}
