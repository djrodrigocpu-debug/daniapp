/**
 * Contrato de mutação administrativa — teste de COMPORTAMENTO.
 *
 * Defeito de origem: em modo corporativo a assinatura reativa do store está
 * desligada (serve só ao modo demonstração), e `wrap` gravava sem recarregar.
 * O servidor persistia, a tela seguia velha, o operador clicava de novo — e
 * cada clique gravava outra vez. Chegaram a existir 12 versões duplicadas de
 * indicador em produção.
 *
 * O que importa provar não é o texto do código, e sim o contrato: recarrega uma
 * única vez, só no sucesso, e só responde depois que a recarga terminou.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aplicarMutacao, FALHA_GENERICA } from './adminMutation';

const sucesso = () => Promise.resolve({ ok: true });
const falha = (message: string) => Promise.resolve({ ok: false, error: { message } });

describe('aplicarMutacao — recarga após mutação', () => {
  it('sucesso recarrega exatamente uma vez', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const res = await aplicarMutacao(sucesso(), load);
    expect(res).toEqual({ ok: true });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('falha não recarrega: nada mudou no servidor', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const res = await aplicarMutacao(falha('operacao recusada'), load);
    expect(res).toEqual({ ok: false, message: 'operacao recusada' });
    expect(load).not.toHaveBeenCalled();
  });

  it('falha sem mensagem cai na mensagem genérica, sem inventar sucesso', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const res = await aplicarMutacao(Promise.resolve({ ok: false }), load);
    expect(res).toEqual({ ok: false, message: FALHA_GENERICA });
    expect(load).not.toHaveBeenCalled();
  });

  it('o resultado só chega à tela DEPOIS que a recarga termina — nada de otimismo', async () => {
    const ordem: string[] = [];
    let liberarLoad: () => void = () => {};
    const load = vi.fn(() => new Promise<void>((resolve) => {
      ordem.push('load:inicio');
      liberarLoad = () => { ordem.push('load:fim'); resolve(); };
    }));

    const promessa = aplicarMutacao(sucesso(), load).then(() => ordem.push('tela:respondida'));

    // A resposta ainda NÃO pode ter chegado: o load está pendente de propósito.
    await Promise.resolve();
    expect(ordem).toEqual(['load:inicio']);

    liberarLoad();
    await promessa;
    expect(ordem).toEqual(['load:inicio', 'load:fim', 'tela:respondida']);
  });

  it('duas chamadas sequenciais recarregam duas vezes — uma por mutação, sem acumular', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    await aplicarMutacao(sucesso(), load);
    await aplicarMutacao(sucesso(), load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('erro lançado pela mutação propaga — não vira sucesso silencioso', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    await expect(aplicarMutacao(Promise.reject(new Error('rede caiu')), load)).rejects.toThrow('rede caiu');
    expect(load).not.toHaveBeenCalled();
  });
});

/**
 * Complemento estrutural — não é a prova principal. Garante que as sete
 * mutações administrativas continuam roteadas pelo contrato acima, e que os
 * dois importadores seguem fora dele (eles já recarregam sozinhos; passar por
 * `wrap` os faria recarregar duas vezes).
 */
describe('AdminProvider — roteamento das mutações', () => {
  const fonte = readFileSync(join(__dirname, 'AdminProvider.tsx'), 'utf8');

  const MUTACOES = [
    'createUser', 'setUserActive', 'updateUserRole',
    'createIndicator', 'addIndicatorVersion', 'deactivateIndicator', 'removeIndicator',
  ];

  it.each(MUTACOES)('%s passa por wrap', (op) => {
    expect(fonte).toMatch(new RegExp(`${op}:[^\\n]*wrap\\(`));
  });

  it('wrap delega ao contrato e declara load como dependência', () => {
    // Sem `load` nas dependências o wrap ficaria preso à primeira versão da
    // função e recarregaria com um fechamento velho.
    expect(fonte).toMatch(/aplicarMutacao\(op,\s*load\)[\s\S]{0,80}\[\s*load\s*\]/);
  });

  it('os importadores recarregam por conta própria e não passam por wrap', () => {
    expect(fonte).toMatch(/importPartners[\s\S]{0,400}?if \(commit\) void load\(\)/);
    expect(fonte).toMatch(/importUsers[\s\S]{0,400}?if \(commit\) void load\(\)/);
    expect(fonte).not.toMatch(/importPartners:[^\n]*wrap\(/);
    expect(fonte).not.toMatch(/importUsers:[^\n]*wrap\(/);
  });

  it('a assinatura reativa continua restrita ao modo demonstração', () => {
    expect(fonte).toMatch(/if \(source !== 'local'\) return undefined/);
  });
});
