/**
 * Política da senha inicial do provisionamento.
 *
 * Senhas fictícias, jamais reais. As asserções verificam sobretudo AUSÊNCIA:
 * nenhuma mensagem pode ecoar a senha recebida.
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_INITIAL_PASSWORD_LENGTH,
  checkInitialPassword,
  isValidInitialPassword,
} from './initialPassword';

const EMAIL = 'fulano.silva@sintetico.test';
const SENHA_OK = 'Aacex2026Prov';

describe('checkInitialPassword', () => {
  it('aceita senha com letras, números e comprimento suficiente', () => {
    expect(checkInitialPassword(SENHA_OK, EMAIL)).toEqual({ ok: true });
    expect(isValidInitialPassword(SENHA_OK, EMAIL)).toBe(true);
  });

  it('recusa senha vazia', () => {
    expect(checkInitialPassword('', EMAIL)).toMatchObject({ ok: false, issue: 'empty' });
  });

  it('recusa senha só de espaços', () => {
    expect(checkInitialPassword('            ', EMAIL)).toMatchObject({
      ok: false,
      issue: 'only_whitespace',
    });
  });

  it(`recusa senha com menos de ${MIN_INITIAL_PASSWORD_LENGTH} caracteres`, () => {
    expect(checkInitialPassword('Aacex2026', EMAIL)).toMatchObject({ ok: false, issue: 'too_short' });
    // Exatamente no limite é aceito.
    expect(checkInitialPassword('Aacex20261', EMAIL).ok).toBe(true);
  });

  it('exige letras E números', () => {
    expect(checkInitialPassword('1234567890', EMAIL)).toMatchObject({
      ok: false,
      issue: 'needs_letter_and_digit',
    });
    expect(checkInitialPassword('SomenteLetras', EMAIL)).toMatchObject({
      ok: false,
      issue: 'needs_letter_and_digit',
    });
  });

  it('recusa senha igual ao e-mail', () => {
    expect(checkInitialPassword(EMAIL, EMAIL)).toMatchObject({ ok: false, issue: 'equals_email' });
    // Diferença de caixa não escapa da regra.
    expect(checkInitialPassword('Fulano.Silva@Sintetico.TEST', EMAIL)).toMatchObject({
      ok: false,
      issue: 'equals_email',
    });
  });

  it('recusa senha que contém o e-mail ou a parte local', () => {
    expect(checkInitialPassword(`x1${EMAIL}`, EMAIL)).toMatchObject({
      ok: false,
      issue: 'contains_email',
    });
    expect(checkInitialPassword('fulano.silva2026', EMAIL)).toMatchObject({
      ok: false,
      issue: 'contains_email',
    });
  });

  it('parte local muito curta não bloqueia senha legítima', () => {
    // Local com menos de 4 caracteres não é usado como substring proibida.
    expect(checkInitialPassword('abcDef12345', 'ab@sintetico.test').ok).toBe(true);
  });

  it('nenhuma mensagem ecoa a senha recebida', () => {
    const senhas = ['', '   ', 'curta1', '1234567890', 'SomenteLetras', EMAIL, 'fulano.silva2026'];
    for (const senha of senhas) {
      const r = checkInitialPassword(senha, EMAIL);
      if (!r.ok && senha.trim() !== '') {
        expect(r.message).not.toContain(senha);
      }
    }
  });

  it('tolera entrada não textual sem lançar', () => {
    for (const invalida of [null, undefined, 42, {}]) {
      expect(checkInitialPassword(invalida as unknown as string, EMAIL).ok).toBe(false);
    }
  });

  it('e-mail vazio não impede a validação das demais regras', () => {
    expect(checkInitialPassword(SENHA_OK, '').ok).toBe(true);
    expect(checkInitialPassword('curta1', '')).toMatchObject({ ok: false, issue: 'too_short' });
  });
});
