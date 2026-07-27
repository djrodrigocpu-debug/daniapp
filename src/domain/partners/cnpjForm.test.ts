/**
 * Decisão do campo CNPJ no formulário de Parceiro AACE.
 *
 * Estes testes existem no lugar de testes de tela: o Vitest só inclui
 * `src/**\/*.test.ts` e o projeto não tem testing-library, então a regra que a
 * tela precisa acertar foi extraída para cá e é coberta aqui.
 *
 * CNPJs 100% SINTÉTICOS (§23).
 */
import { describe, it, expect } from 'vitest';
import { applyCnpjToPayload, resolveCnpjField } from './cnpjForm';
import { formatCnpj } from './cnpj';

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

const A = cnpjFixture('880000010001');
const B = cnpjFixture('880000020001');
const INVALIDO = '12345678000100';

describe('resolveCnpjField — criação', () => {
  const criar = (typed: string) => resolveCnpjField({ typed, current: null, creating: true });

  it('exige CNPJ', () => {
    expect(criar('')).toMatchObject({ ok: false, error: 'obrigatorio' });
    expect(criar('   ')).toMatchObject({ ok: false, error: 'obrigatorio' });
  });

  it('recusa CNPJ inválido', () => {
    expect(criar(INVALIDO)).toMatchObject({ ok: false, error: 'invalido' });
    expect(criar('11111111111111')).toMatchObject({ ok: false, error: 'invalido' });
    expect(criar('123')).toMatchObject({ ok: false, error: 'invalido' });
  });

  it('aceita válido e envia SOMENTE os 14 dígitos, mesmo digitado formatado', () => {
    for (const entrada of [A, formatCnpj(A), ` ${formatCnpj(A)} `]) {
      const d = criar(entrada);
      expect(d.ok).toBe(true);
      expect(d.patch).toEqual({ action: 'send', value: A });
    }
  });

  it('nenhuma mensagem ecoa o valor digitado', () => {
    for (const entrada of [INVALIDO, '11111111111111', '99']) {
      const d = criar(entrada);
      expect(d.message).toBeDefined();
      expect(d.message).not.toContain(entrada);
    }
  });
});

describe('resolveCnpjField — edição de parceiro COM CNPJ', () => {
  const editar = (typed: string) => resolveCnpjField({ typed, current: A, creating: false });

  it('não alterado é OMITIDO do patch', () => {
    for (const igual of [A, formatCnpj(A), ` ${formatCnpj(A)} `]) {
      const d = editar(igual);
      expect(d.ok).toBe(true);
      expect(d.patch).toEqual({ action: 'omit' });
    }
  });

  it('apagar um CNPJ cadastrado impede o envio', () => {
    const d = editar('');
    expect(d.ok).toBe(false);
    expect(d.error).toBe('remocao_nao_permitida');
    expect(d.patch).toEqual({ action: 'omit' });
    expect(d.message).toMatch(/não é possível remover/i);
  });

  it('novo CNPJ válido é normalizado e enviado', () => {
    const d = editar(formatCnpj(B));
    expect(d.ok).toBe(true);
    expect(d.patch).toEqual({ action: 'send', value: B });
  });

  it('novo CNPJ inválido impede o envio', () => {
    expect(editar(INVALIDO)).toMatchObject({ ok: false, error: 'invalido' });
  });
});

describe('resolveCnpjField — edição de parceiro LEGADO (current null)', () => {
  const legado = (typed: string) => resolveCnpjField({ typed, current: null, creating: false });

  it('campo vazio é OMITIDO — nunca vira string vazia no patch', () => {
    for (const vazio of ['', '   ', '   -  /  ']) {
      const d = legado(vazio);
      expect(d.ok).toBe(true);
      expect(d.patch).toEqual({ action: 'omit' });
    }
  });

  it('editar apenas outros campos de um legado continua possível', () => {
    const d = legado('');
    const payload = applyCnpjToPayload({ city: 'Maringa' }, d);
    expect(d.ok).toBe(true);
    expect(payload).toEqual({ city: 'Maringa' });
    expect('cnpj' in payload).toBe(false);
  });

  it('preencher o CNPJ que faltava envia os 14 dígitos', () => {
    const d = legado(formatCnpj(B));
    expect(d.patch).toEqual({ action: 'send', value: B });
  });

  it('preencher com inválido impede o envio', () => {
    expect(legado(INVALIDO)).toMatchObject({ ok: false, error: 'invalido' });
  });
});

describe('applyCnpjToPayload', () => {
  it('omit não cria a chave nem como undefined', () => {
    const payload = applyCnpjToPayload(
      { city: 'Curitiba' },
      resolveCnpjField({ typed: A, current: A, creating: false }),
    );
    expect(Object.keys(payload)).toEqual(['city']);
    expect(JSON.stringify(payload)).not.toContain('cnpj');
  });

  it('send acrescenta somente dígitos', () => {
    const payload = applyCnpjToPayload(
      { city: 'Curitiba' },
      resolveCnpjField({ typed: formatCnpj(B), current: null, creating: true }),
    );
    expect(payload).toEqual({ city: 'Curitiba', cnpj: B });
    expect(payload.cnpj).toHaveLength(14);
    expect(payload.cnpj).not.toContain('.');
  });

  it('NENHUM caminho produz cnpj vazio ou nulo no payload', () => {
    const casos = [
      { typed: '', current: null, creating: false },
      { typed: '', current: A, creating: false },
      { typed: A, current: A, creating: false },
      { typed: formatCnpj(B), current: A, creating: false },
      { typed: INVALIDO, current: null, creating: false },
    ];
    for (const caso of casos) {
      const payload = applyCnpjToPayload({}, resolveCnpjField(caso)) as { cnpj?: unknown };
      if ('cnpj' in payload) {
        expect(typeof payload.cnpj).toBe('string');
        expect(payload.cnpj).toHaveLength(14);
      }
    }
  });
});
