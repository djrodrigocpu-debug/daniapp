/**
 * Interpretação do link de callback do Supabase Auth (convite e recuperação).
 *
 * Função PURA: recebe a URL como texto e devolve a INTENÇÃO. Sem React, sem
 * SDK, sem I/O — por isso é integralmente testável e serve igual para web
 * (window.location) e nativo (deep link `aaceexcelencia://auth/callback`).
 *
 * POR QUE TRATAR QUATRO FORMATOS E NÃO SÓ PKCE
 * O SDK instalado (@supabase/auth-js 2.110.8) tem `flowType: 'implicit'` por
 * padrão, e `_exchangeCodeForSession` LANÇA `AuthPKCECodeVerifierMissingError`
 * quando não encontra o `code-verifier` no storage. Esse verifier só existe
 * quando o PRÓPRIO cliente iniciou o fluxo — caso da recuperação de senha.
 * O convite é gerado no SERVIDOR pela Auth Admin API: o navegador de quem
 * recebe o e-mail nunca teve verifier, então `exchangeCodeForSession` não
 * serve para convite. Em vez de presumir um formato, lemos o que chegou:
 *
 *   ?code=...                      → PKCE (recuperação iniciada no cliente)
 *   ?token_hash=...&type=...       → template com {{ .TokenHash }} (verifyOtp)
 *   #access_token=...&refresh_token=...  → implícito (template padrão)
 *   ?error=... | #error=...        → erro devolvido pelo GoTrue
 *
 * NUNCA registrar em log o valor de code, token_hash ou tokens.
 */

/** Tipos de fluxo que exigem que o usuário defina uma senha ao final. */
export type CallbackPurpose = 'invite' | 'recovery' | 'signup' | 'email_change' | 'unknown';

export type CallbackIntent =
  /** Trocar `code` por sessão (exchangeCodeForSession). */
  | { kind: 'pkce_code'; code: string; purpose: CallbackPurpose }
  /** Verificar `token_hash` (verifyOtp) — funciona sem code_verifier. */
  | { kind: 'token_hash'; tokenHash: string; purpose: CallbackPurpose }
  /** Sessão já veio pronta no fragmento (fluxo implícito). */
  | { kind: 'tokens'; accessToken: string; refreshToken: string; purpose: CallbackPurpose }
  /** O provedor devolveu erro (link expirado, já usado, etc.). */
  | { kind: 'error'; code: string | null; message: string }
  /** Não é um callback de autenticação — seguir o boot normal. */
  | { kind: 'none' };

/** Marca que o app deve levar o usuário para a tela de definir senha. */
export function requiresPasswordSetup(purpose: CallbackPurpose): boolean {
  return purpose === 'invite' || purpose === 'recovery';
}

function normalizePurpose(raw: string | null): CallbackPurpose {
  switch ((raw ?? '').toLowerCase()) {
    case 'invite': return 'invite';
    case 'recovery': return 'recovery';
    case 'signup': return 'signup';
    case 'email_change': return 'email_change';
    default: return 'unknown';
  }
}

/**
 * Mensagem para o operador. O GoTrue devolve `error_code`/`error_description`;
 * traduzimos os casos conhecidos e NUNCA ecoamos a descrição crua, que pode
 * conter fragmento do link.
 */
export function describeCallbackError(code: string | null, rawDescription: string | null): string {
  const key = (code ?? '').toLowerCase();
  const desc = (rawDescription ?? '').toLowerCase();

  if (key.includes('expired') || desc.includes('expired')) {
    return 'Este link expirou. Peça um novo convite ao Administrador.';
  }
  if (key === 'access_denied' || desc.includes('already') || desc.includes('used')) {
    return 'Este link já foi utilizado. Se você ainda não definiu sua senha, peça um novo convite.';
  }
  if (key === 'otp_expired') {
    return 'Este link expirou. Peça um novo convite ao Administrador.';
  }
  if (key === 'server_error' || key === 'unexpected_failure') {
    return 'O serviço de autenticação falhou ao validar o link. Tente novamente em alguns minutos.';
  }
  return 'Não foi possível validar este link de acesso. Peça um novo convite ao Administrador.';
}

/** Extrai os pares chave=valor de uma query string ou de um fragmento. */
function parsePairs(raw: string): URLSearchParams {
  return new URLSearchParams(raw.startsWith('?') || raw.startsWith('#') ? raw.slice(1) : raw);
}

/**
 * Separa a URL em query e fragmento sem depender de `new URL()` — o deep link
 * `aaceexcelencia://auth/callback?...` não é aceito por todos os parsers.
 */
function splitUrl(url: string): { path: string; query: URLSearchParams; hash: URLSearchParams } {
  const hashAt = url.indexOf('#');
  const withoutHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const hashRaw = hashAt >= 0 ? url.slice(hashAt + 1) : '';
  const queryAt = withoutHash.indexOf('?');
  const path = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
  const queryRaw = queryAt >= 0 ? withoutHash.slice(queryAt + 1) : '';
  return { path, query: parsePairs(queryRaw), hash: parsePairs(hashRaw) };
}

/** Caminho reconhecido como callback, em web e em deep link. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

export function isAuthCallbackPath(url: string): boolean {
  const { path } = splitUrl(url);
  return path.includes(AUTH_CALLBACK_PATH) || path.includes('auth/callback');
}

/**
 * Interpreta a URL. Aceita callback em qualquer caminho DESDE QUE traga
 * parâmetros de autenticação — o provedor às vezes devolve na raiz do site.
 * Sem parâmetros reconhecíveis, devolve `none` e o boot segue normal.
 */
export function parseAuthCallback(url: string | null | undefined): CallbackIntent {
  if (!url || typeof url !== 'string') return { kind: 'none' };
  const { query, hash } = splitUrl(url);

  // 1) Erro tem precedência: se o provedor recusou, nada mais importa.
  const errCode = query.get('error_code') ?? hash.get('error_code')
    ?? query.get('error') ?? hash.get('error');
  if (errCode) {
    const description = query.get('error_description') ?? hash.get('error_description');
    return { kind: 'error', code: errCode, message: describeCallbackError(errCode, description) };
  }

  const purpose = normalizePurpose(query.get('type') ?? hash.get('type'));

  // 2) PKCE — só existe quando o próprio cliente iniciou o fluxo.
  const code = query.get('code');
  if (code && code.trim() !== '') {
    return { kind: 'pkce_code', code: code.trim(), purpose };
  }

  // 3) token_hash — caminho recomendado para links gerados no servidor.
  const tokenHash = query.get('token_hash') ?? hash.get('token_hash');
  if (tokenHash && tokenHash.trim() !== '') {
    return { kind: 'token_hash', tokenHash: tokenHash.trim(), purpose };
  }

  // 4) Implícito — o template padrão devolve os tokens no fragmento.
  const accessToken = hash.get('access_token') ?? query.get('access_token');
  const refreshToken = hash.get('refresh_token') ?? query.get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken, purpose };
  }

  // Callback declarado (caminho /auth/callback) mas sem nada utilizável:
  // malformado. Fora desse caminho, é só uma navegação comum.
  if (isAuthCallbackPath(url)) {
    return {
      kind: 'error',
      code: 'missing_parameters',
      message: 'O link de acesso está incompleto. Peça um novo convite ao Administrador.',
    };
  }
  return { kind: 'none' };
}

/**
 * URL equivalente sem NENHUM parâmetro de autenticação, para reescrever o
 * histórico do navegador depois de consumir o link. Preserva os demais
 * parâmetros, para não quebrar navegação legítima.
 */
const SENSITIVE_PARAMS = [
  'code', 'token_hash', 'token', 'access_token', 'refresh_token', 'provider_token',
  'provider_refresh_token', 'expires_in', 'expires_at', 'token_type', 'type',
  'error', 'error_code', 'error_description',
];

export function stripAuthParams(url: string): string {
  const hashAt = url.indexOf('#');
  const withoutHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = withoutHash.indexOf('?');
  const base = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;

  const kept = new URLSearchParams();
  if (queryAt >= 0) {
    parsePairs(withoutHash.slice(queryAt + 1)).forEach((value, key) => {
      if (!SENSITIVE_PARAMS.includes(key)) kept.append(key, value);
    });
  }
  const query = kept.toString();
  return query === '' ? base : `${base}?${query}`;
}
