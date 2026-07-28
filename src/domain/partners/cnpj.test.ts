/**
 * CNPJ do Parceiro AACE — normalização e dígitos verificadores.
 *
 * FIXTURES sintéticos, gerados por `cnpjFixture` a partir de uma base de 12
 * dígitos. Nenhum CNPJ real de empresa é usado (§23).
 */
import { describe, it, expect } from 'vitest';
import {
  CNPJ_AUSENTE,
  CNPJ_DIGITS,
  displayCnpj,
  formatCnpj,
  formatCnpjInput,
  isValidCnpj,
  normalizeCnpj,
  validateCnpj,
} from './cnpj';

/** Gera um CNPJ sintético válido a partir de 12 dígitos base. */
function cnpjFixture(base12: string): string {
  const dv = (digits: string, pesos: number[]) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i += 1) soma += Number(digits[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(`${base12}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${d2}`;
}

const CNPJ_A = cnpjFixture('123456780001');
const CNPJ_B = cnpjFixture('987654320001');

describe('normalizeCnpj', () => {
  it('aceita com e sem pontuação', () => {
    const formatado = formatCnpj(CNPJ_A);
    expect(normalizeCnpj(formatado)).toBe(CNPJ_A);
    expect(normalizeCnpj(CNPJ_A)).toBe(CNPJ_A);
    expect(normalizeCnpj(`  ${formatado} `)).toBe(CNPJ_A);
  });

  it('devolve vazio para entrada não textual', () => {
    for (const v of [null, undefined, {}, [], true]) expect(normalizeCnpj(v)).toBe('');
  });
});

describe('validateCnpj', () => {
  it('aceita CNPJ sintético válido e normaliza para 14 dígitos', () => {
    for (const entrada of [CNPJ_A, formatCnpj(CNPJ_A), CNPJ_B]) {
      const r = validateCnpj(entrada);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.cnpj).toHaveLength(CNPJ_DIGITS);
    }
  });

  it('recusa vazio, tamanho errado e sequência repetida', () => {
    expect(validateCnpj('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(validateCnpj('1234567800019')).toMatchObject({ ok: false, reason: 'length' });
    expect(validateCnpj(`${CNPJ_A}9`)).toMatchObject({ ok: false, reason: 'length' });
    for (let d = 0; d <= 9; d += 1) {
      expect(validateCnpj(String(d).repeat(14))).toMatchObject({ ok: false, reason: 'repeated' });
    }
  });

  it('recusa dígitos verificadores inválidos', () => {
    const errado = `${CNPJ_A.slice(0, 12)}00`;
    expect(validateCnpj(errado)).toMatchObject({ ok: false, reason: 'check_digits' });
    const alterado = `${CNPJ_A.slice(0, 4)}9${CNPJ_A.slice(5)}`;
    expect(validateCnpj(alterado).ok).toBe(false);
  });

  it('isValidCnpj concorda com validateCnpj', () => {
    expect(isValidCnpj(CNPJ_A)).toBe(true);
    expect(isValidCnpj('11111111111111')).toBe(false);
  });
});

describe('formatCnpj', () => {
  it('formata no padrão cadastral', () => {
    expect(formatCnpj(CNPJ_A)).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
  });

  it('devolve os dígitos crus quando o tamanho não fecha', () => {
    expect(formatCnpj('123')).toBe('123');
  });
});

describe('fronteira: parceiro não é usuário', () => {
  it('o módulo não expõe nada relacionado a identidade ou credencial', async () => {
    const mod = await import('./cnpj');
    const exportados = Object.keys(mod).sort();
    expect(exportados).toEqual([
      'CNPJ_AUSENTE', 'CNPJ_DIGITS', 'displayCnpj', 'formatCnpj', 'formatCnpjInput',
      'isValidCnpj', 'normalizeCnpj', 'validateCnpj',
    ]);
    // Nada de authUserId, senha, login ou e-mail neste domínio.
    for (const nome of exportados) {
      expect(nome).not.toMatch(/auth|password|senha|login|email/i);
    }
  });
});

describe('formatCnpjInput — máscara progressiva', () => {
  it('aceita de 0 a 14 dígitos, pontuando conforme o operador digita', () => {
    expect(formatCnpjInput('')).toBe('');
    expect(formatCnpjInput('1')).toBe('1');
    expect(formatCnpjInput('12')).toBe('12');
    expect(formatCnpjInput('123')).toBe('12.3');
    expect(formatCnpjInput('12345')).toBe('12.345');
    expect(formatCnpjInput('123456')).toBe('12.345.6');
    expect(formatCnpjInput('12345678')).toBe('12.345.678');
    expect(formatCnpjInput('123456780')).toBe('12.345.678/0');
    expect(formatCnpjInput('123456780001')).toBe('12.345.678/0001');
    expect(formatCnpjInput('12345678000195')).toBe('12.345.678/0001-95');
  });

  it('aceita colagem já formatada sem duplicar pontuação', () => {
    expect(formatCnpjInput('12.345.678/0001-95')).toBe('12.345.678/0001-95');
    expect(formatCnpjInput('  12.345.678/0001-95  ')).toBe('12.345.678/0001-95');
  });

  it('trunca o excedente de 14 dígitos de forma determinística', () => {
    expect(formatCnpjInput('123456780001959999')).toBe('12.345.678/0001-95');
    expect(normalizeCnpj(formatCnpjInput('123456780001959999'))).toHaveLength(14);
  });

  it('ignora letras e símbolos colados', () => {
    expect(formatCnpjInput('CNPJ: 12345678000195')).toBe('12.345.678/0001-95');
  });
});

describe('displayCnpj — texto para listagem, detalhes e relatório', () => {
  it('formata quando há 14 dígitos', () => {
    expect(displayCnpj('12345678000195')).toBe('12.345.678/0001-95');
    expect(displayCnpj('12.345.678/0001-95')).toBe('12.345.678/0001-95');
  });

  it('nunca mostra null, undefined ou vazio ao usuário', () => {
    for (const ausente of [null, undefined, '', '   ', '123']) {
      expect(displayCnpj(ausente as string | null)).toBe(CNPJ_AUSENTE);
      expect(displayCnpj(ausente as string | null)).toBe('Não informado');
    }
  });
});
