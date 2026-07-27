/**
 * Interpretação do link de callback e política de senha. Dados fictícios (§23);
 * nenhum token real — os valores são marcadores sintéticos.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTH_CALLBACK_PATH,
  isAuthCallbackPath,
  parseAuthCallback,
  requiresPasswordSetup,
  stripAuthParams,
} from './callbackLink';
import { MIN_PASSWORD_LENGTH, checkPassword } from './passwordPolicy';

const WEB = `http://localhost:8081${AUTH_CALLBACK_PATH}`;
const NATIVE = `aaceexcelencia:/${AUTH_CALLBACK_PATH}`;

describe('parseAuthCallback — formatos que o Supabase realmente entrega', () => {
  it('1 — code PKCE (recuperação iniciada no cliente)', () => {
    expect(parseAuthCallback(`${WEB}?code=cod-sint-1&type=recovery`)).toEqual({
      kind: 'pkce_code', code: 'cod-sint-1', purpose: 'recovery',
    });
  });

  it('2 — token_hash (template {{ .TokenHash }}, funciona sem code_verifier)', () => {
    expect(parseAuthCallback(`${WEB}?token_hash=hash-sint-1&type=invite`)).toEqual({
      kind: 'token_hash', tokenHash: 'hash-sint-1', purpose: 'invite',
    });
  });

  it('3 — tokens no fragmento (fluxo implícito, template padrão)', () => {
    const url = `${WEB}#access_token=at-sint&refresh_token=rt-sint&expires_in=3600&token_type=bearer&type=invite`;
    expect(parseAuthCallback(url)).toEqual({
      kind: 'tokens', accessToken: 'at-sint', refreshToken: 'rt-sint', purpose: 'invite',
    });
  });

  it('4 — deep link nativo válido é lido igual ao web', () => {
    expect(parseAuthCallback(`${NATIVE}?token_hash=hash-sint-2&type=invite`)).toEqual({
      kind: 'token_hash', tokenHash: 'hash-sint-2', purpose: 'invite',
    });
  });

  it('5 — callback sem nenhum parâmetro utilizável é malformado', () => {
    const r = parseAuthCallback(WEB);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.code).toBe('missing_parameters');
      expect(r.message).toMatch(/incompleto/i);
    }
  });

  it('6 — URL comum (fora do callback, sem parâmetros) não é callback', () => {
    expect(parseAuthCallback('http://localhost:8081/')).toEqual({ kind: 'none' });
    expect(parseAuthCallback('http://localhost:8081/?utm=abc')).toEqual({ kind: 'none' });
    expect(parseAuthCallback(null)).toEqual({ kind: 'none' });
    expect(parseAuthCallback(undefined)).toEqual({ kind: 'none' });
    expect(parseAuthCallback('')).toEqual({ kind: 'none' });
  });

  it('7 — deep link inválido não é confundido com callback', () => {
    expect(parseAuthCallback('aaceexcelencia://qualquer/outra/rota')).toEqual({ kind: 'none' });
  });

  it('8 — link expirado vira erro compreensível', () => {
    const r = parseAuthCallback(`${WEB}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toMatch(/expirou/i);
  });

  it('9 — link já utilizado vira erro compreensível', () => {
    const r = parseAuthCallback(`${WEB}?error=access_denied&error_description=Token+has+already+been+used`);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toMatch(/já foi utilizado/i);
  });

  it('10 — erro do servidor tem mensagem própria', () => {
    const r = parseAuthCallback(`${WEB}?error_code=server_error`);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toMatch(/serviço de autenticação/i);
  });

  it('11 — o erro tem precedência sobre qualquer código presente na URL', () => {
    const r = parseAuthCallback(`${WEB}?code=cod-sint&error_code=otp_expired`);
    expect(r.kind).toBe('error');
  });

  it('12 — a mensagem de erro nunca ecoa a descrição crua do provedor', () => {
    const r = parseAuthCallback(`${WEB}?error_code=weird&error_description=token+abc123secreto`);
    if (r.kind === 'error') expect(r.message).not.toContain('abc123secreto');
  });

  it('13 — code vazio ou só espaços não é aceito', () => {
    expect(parseAuthCallback(`${WEB}?code=`).kind).toBe('error');
    expect(parseAuthCallback(`${WEB}?code=%20%20`).kind).toBe('error');
  });

  it('14 — tokens incompletos (sem refresh) não viram sessão', () => {
    expect(parseAuthCallback(`${WEB}#access_token=at-sint`).kind).toBe('error');
  });
});

describe('requiresPasswordSetup', () => {
  it('convite e recuperação exigem definir senha; os demais não', () => {
    expect(requiresPasswordSetup('invite')).toBe(true);
    expect(requiresPasswordSetup('recovery')).toBe(true);
    expect(requiresPasswordSetup('signup')).toBe(false);
    expect(requiresPasswordSetup('email_change')).toBe(false);
    expect(requiresPasswordSetup('unknown')).toBe(false);
  });
});

describe('isAuthCallbackPath', () => {
  it('reconhece web e deep link, e recusa outras rotas', () => {
    expect(isAuthCallbackPath(`${WEB}?code=x`)).toBe(true);
    expect(isAuthCallbackPath(`${NATIVE}?code=x`)).toBe(true);
    expect(isAuthCallbackPath('http://localhost:8081/parceiros')).toBe(false);
  });
});

describe('stripAuthParams — limpeza da URL após consumo', () => {
  it('remove TODOS os parâmetros sensíveis, de query e de fragmento', () => {
    const sujo = `${WEB}?code=cod-sint&type=invite#access_token=at&refresh_token=rt`;
    const limpo = stripAuthParams(sujo);
    for (const p of ['code=', 'type=', 'access_token', 'refresh_token', '#']) {
      expect(limpo).not.toContain(p);
    }
    expect(limpo).toBe(WEB);
  });

  it('preserva parâmetros legítimos que não são de autenticação', () => {
    expect(stripAuthParams(`${WEB}?code=x&origem=email`)).toBe(`${WEB}?origem=email`);
  });

  it('é idempotente — reaplicar não muda nada', () => {
    const uma = stripAuthParams(`${WEB}?code=x`);
    expect(stripAuthParams(uma)).toBe(uma);
  });
});

describe('checkPassword', () => {
  const forte = 'senha-sintetica-forte-1';

  it('1 — senha válida com confirmação igual', () => {
    expect(checkPassword(forte, forte)).toEqual({ ok: true });
  });

  it('2 — senha curta é recusada', () => {
    const curta = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    const r = checkPassword(curta, curta);
    expect(r.ok).toBe(false);
    expect(r.issue).toBe('too_short');
    expect(r.message).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('3 — confirmação divergente é recusada', () => {
    const r = checkPassword(forte, `${forte}x`);
    expect(r.ok).toBe(false);
    expect(r.issue).toBe('mismatch');
  });

  it('4 — senha só de espaços é recusada mesmo se longa', () => {
    const espacos = ' '.repeat(MIN_PASSWORD_LENGTH + 5);
    const r = checkPassword(espacos, espacos);
    expect(r.ok).toBe(false);
    expect(r.issue).toBe('only_whitespace');
  });

  it('5 — senha vazia é recusada', () => {
    expect(checkPassword('', '').issue).toBe('empty');
  });

  it('6 — espaço interno é caractere legítimo', () => {
    const comEspaco = 'duas palavras sinteticas';
    expect(checkPassword(comEspaco, comEspaco)).toEqual({ ok: true });
  });

  it('7 — nenhuma mensagem de erro contém a senha', () => {
    for (const [p, c] of [['curta', 'curta'], [forte, 'outra'], ['   ', '   '], ['', '']]) {
      const r = checkPassword(p, c);
      if (!r.ok && p !== '') expect(r.message).not.toContain(p);
    }
  });
});
