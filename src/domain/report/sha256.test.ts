/**
 * O SHA-256 próprio confere com os vetores publicados e com o do Node.
 *
 * Um resumo criptográfico escrito à mão só vale se for provado contra uma
 * referência externa — caso contrário estaria apenas concordando consigo mesmo.
 * Aqui a referência é dupla: os vetores canônicos do FIPS 180-4 e o
 * `node:crypto`, que não participa do código de produção.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Hex, utf8Bytes } from './sha256';

describe('sha256', () => {
  it('confere com os vetores do FIPS 180-4 e com node:crypto em todo comprimento crítico', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');

    // 55/56/63/64/65 e 119/120 cercam cada fronteira de preenchimento.
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000]) {
      const texto = 'a'.repeat(n);
      expect(sha256Hex(texto)).toBe(createHash('sha256').update(texto, 'utf8').digest('hex'));
    }
  });

  it('codifica UTF-8 real: acentos portugueses e pares substitutos', () => {
    const acentos = 'Avaliação de conformidade — não aplicável, justificação órfã çÇãõ';
    expect(sha256Hex(acentos)).toBe(createHash('sha256').update(acentos, 'utf8').digest('hex'));

    const comEmoji = 'auditoria 🧾 concluída';
    expect(Array.from(utf8Bytes(comEmoji))).toEqual(Array.from(Buffer.from(comEmoji, 'utf8')));
    expect(sha256Hex(comEmoji)).toBe(createHash('sha256').update(comEmoji, 'utf8').digest('hex'));
  });

  it('é determinístico e muda por completo com um único caractere diferente', () => {
    expect(sha256Hex('Relatório Oficial')).toBe(sha256Hex('Relatório Oficial'));
    const a = sha256Hex('score=87.5');
    const b = sha256Hex('score=87.6');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
