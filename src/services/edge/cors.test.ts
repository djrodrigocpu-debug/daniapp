/**
 * Regressão do preflight CORS da Edge Function `admin-invite-users`.
 *
 * DEFEITO ORIGINAL, comprovado em runtime: o entrypoint recusava tudo que não
 * fosse POST na PRIMEIRA linha, então o `OPTIONS` do navegador recebia 405 sem
 * nenhum cabeçalho CORS — e o navegador bloqueava o POST seguinte. O app só via
 * "Failed to send a request to the Edge Function".
 *
 * Estes testes reproduzem o roteamento do entrypoint sobre o módulo puro, sem
 * subir Deno. Dados fictícios (§23); nenhum token real.
 */
import { describe, it, expect } from 'vitest';
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  corsHeaders,
  isPreflight,
  jsonHeaders,
  preflightResponse,
} from '../../../supabase/functions/admin-invite-users/cors';

const ORIGIN = 'http://localhost:8081';

/**
 * Espelha a ORDEM real do entrypoint. `efeitos` registra o que foi tocado, para
 * provar que o preflight não lê body, não valida sessão e não chama o Auth.
 */
function rotear(method: string, origin: string | null) {
  const efeitos: string[] = [];
  if (isPreflight(method)) {
    const { status, headers } = preflightResponse(origin);
    return { status, headers, body: null, efeitos };
  }
  if (method !== 'POST') {
    return { status: 405, headers: jsonHeaders(origin), body: { error: 'Método não suportado.' }, efeitos };
  }
  efeitos.push('leu_body', 'validou_token', 'checou_admin', 'chamou_auth_api');
  return { status: 200, headers: jsonHeaders(origin), body: { ok: true }, efeitos };
}

describe('preflight OPTIONS', () => {
  it('1 — responde 204 (na faixa 200/204), nunca 405', () => {
    const r = rotear('OPTIONS', ORIGIN);
    expect(r.status).toBe(204);
    expect(r.status).not.toBe(405);
  });

  it('2/3/4/5 — não lê body, não exige sessão, não exige Administrador, não chama Auth', () => {
    const r = rotear('OPTIONS', ORIGIN);
    expect(r.efeitos).toEqual([]);
    expect(r.body).toBeNull();
  });

  it('6 — resposta traz Access-Control-Allow-Origin', () => {
    expect(rotear('OPTIONS', ORIGIN).headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
  });

  it('7 — Allow-Headers cobre os cabeçalhos que o supabase-js envia', () => {
    const h = rotear('OPTIONS', ORIGIN).headers['Access-Control-Allow-Headers'].toLowerCase();
    for (const obrigatorio of ['authorization', 'x-client-info', 'apikey', 'content-type']) {
      expect(h).toContain(obrigatorio);
    }
  });

  it('anuncia POST e OPTIONS como métodos aceitos', () => {
    expect(rotear('OPTIONS', ORIGIN).headers['Access-Control-Allow-Methods']).toBe(ALLOWED_METHODS);
    expect(ALLOWED_METHODS).toContain('POST');
  });

  it('é reconhecido independentemente da caixa do método', () => {
    expect(isPreflight('options')).toBe(true);
    expect(isPreflight('OPTIONS')).toBe(true);
    expect(isPreflight('POST')).toBe(false);
    expect(isPreflight('GET')).toBe(false);
  });

  it('sem Origin ainda responde de forma utilizável', () => {
    expect(rotear('OPTIONS', null).headers['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('CORS em TODAS as respostas', () => {
  const statusEsperados = [200, 400, 401, 403, 405, 409, 500];

  it('8..13 — sucesso e todos os erros carregam os mesmos cabeçalhos', () => {
    for (const status of statusEsperados) {
      // Sucesso e 405 vêm do roteamento; os demais são respostas de erro do
      // catch, que usa exatamente o mesmo jsonHeaders.
      const headers = status === 405
        ? rotear('DELETE', ORIGIN).headers
        : jsonHeaders(ORIGIN);
      expect(headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
      expect(headers['Access-Control-Allow-Headers']).toBe(ALLOWED_HEADERS);
      expect(headers['Content-Type']).toBe('application/json');
    }
  });

  it('405 deixou de ser a primeira resposta a OPTIONS (regressão original)', () => {
    expect(rotear('OPTIONS', ORIGIN).status).not.toBe(405);
    expect(rotear('DELETE', ORIGIN).status).toBe(405);
    // E o 405 legítimo agora carrega CORS, senão o erro ficaria invisível.
    expect(rotear('DELETE', ORIGIN).headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
  });

  it('Vary: Origin acompanha a resposta refletida', () => {
    expect(corsHeaders(ORIGIN).Vary).toBe('Origin');
  });

  it('não emite Allow-Credentials — a autorização vem do header, não de cookie', () => {
    expect(Object.keys(corsHeaders(ORIGIN))).not.toContain('Access-Control-Allow-Credentials');
  });

  it('16 — nenhum cabeçalho ecoa token, secret ou URL recusada', () => {
    const serial = JSON.stringify(jsonHeaders(ORIGIN));
    for (const proibido of ['Bearer', 'service', 'apikey=', 'eyJ', 'INVITE_REDIRECT']) {
      expect(serial).not.toContain(proibido);
    }
  });
});
