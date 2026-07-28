/**
 * Paginação do índice de identidades da Edge Function `admin-invite-users`.
 *
 * Cobre o defeito que travava a reexecução: a busca lia UMA página do Auth e
 * respondia "não existe" para quase todo mundo. `listUsers` é injetado — o
 * GoTrue real nunca é tocado. Dados 100% fictícios (§23).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildIdentityIndex,
  IdentityIndexError,
  ListUsersResult,
  AuthUserLike,
  PER_PAGE,
  MAX_PAGES,
} from '../../../supabase/functions/_shared/identityIndex';

/** Página com `nextPage` explícito (null encerra). */
function pagina(users: AuthUserLike[], nextPage: number | null): ListUsersResult {
  return { data: { users, nextPage } };
}

/** Gera uma página CHEIA (PER_PAGE usuários) com e-mails determinísticos. */
function paginaCheia(indiceDaPagina: number, nextPage: number | null): ListUsersResult {
  const users: AuthUserLike[] = Array.from({ length: PER_PAGE }, (_, i) => ({
    id: `id-${indiceDaPagina}-${i}`,
    email: `u${indiceDaPagina}-${i}@fic.example`,
  }));
  return pagina(users, nextPage);
}

/** Devolve as páginas na ordem pedida e conta as chamadas. */
function fake(paginas: ListUsersResult[]) {
  const chamadas: Array<{ page: number; perPage: number }> = [];
  const fn = vi.fn(async (params: { page: number; perPage: number }) => {
    chamadas.push(params);
    return paginas[params.page - 1] ?? pagina([], null);
  });
  return { fn, chamadas };
}

describe('buildIdentityIndex', () => {
  it('1 — base vazia devolve índice vazio numa única chamada', async () => {
    const { fn, chamadas } = fake([pagina([], null)]);
    const indice = await buildIdentityIndex(fn);

    expect(indice.size).toBe(0);
    expect(chamadas).toEqual([{ page: 1, perPage: PER_PAGE }]);
  });

  it('2 — identidade na primeira página é encontrada com o uuid real', async () => {
    const { fn } = fake([pagina([{ id: 'auth-ana', email: 'ana@fic.example' }], null)]);
    const indice = await buildIdentityIndex(fn);

    expect(indice.get('ana@fic.example')).toBe('auth-ana');
  });

  it('3 — identidade em página posterior é encontrada (a paginação continua)', async () => {
    const { fn, chamadas } = fake([
      paginaCheia(1, 2),
      paginaCheia(2, 3),
      pagina([{ id: 'auth-tarde', email: 'tarde@fic.example' }], null),
    ]);
    const indice = await buildIdentityIndex(fn);

    expect(indice.get('tarde@fic.example')).toBe('auth-tarde');
    expect(chamadas.map((c) => c.page)).toEqual([1, 2, 3]);
  });

  it('4 — vários e-mails em páginas diferentes, cada uuid no seu e-mail', async () => {
    const alvoA = { id: 'auth-a', email: 'a@fic.example' };
    const alvoC = { id: 'auth-c', email: 'c@fic.example' };
    const p1 = paginaCheia(1, 2);
    p1.data!.users![0] = alvoA;
    const p2 = paginaCheia(2, 3);
    p2.data!.users![PER_PAGE - 1] = { id: 'auth-b', email: 'b@fic.example' };

    const { fn } = fake([p1, p2, pagina([alvoC], null)]);
    const indice = await buildIdentityIndex(fn);

    expect(indice.get('a@fic.example')).toBe('auth-a');
    expect(indice.get('b@fic.example')).toBe('auth-b');
    expect(indice.get('c@fic.example')).toBe('auth-c');
  });

  it('5 — normaliza maiúsculas e espaços laterais', async () => {
    const { fn } = fake([pagina([{ id: 'auth-x', email: '  Ana.Maria@FIC.Example  ' }], null)]);
    const indice = await buildIdentityIndex(fn);

    expect(indice.get('ana.maria@fic.example')).toBe('auth-x');
    expect(indice.size).toBe(1);
  });

  it('6 — usuário sem e-mail (ou sem id) é ignorado', async () => {
    const { fn } = fake([
      pagina(
        [
          { id: 'sem-email', email: null },
          { id: 'vazio', email: '   ' },
          { id: undefined, email: 'sem-id@fic.example' },
          { id: '', email: 'id-vazio@fic.example' },
          { id: 'ok', email: 'ok@fic.example' },
        ],
        null,
      ),
    ]);
    const indice = await buildIdentityIndex(fn);

    expect([...indice.keys()]).toEqual(['ok@fic.example']);
  });

  it('7 — usuário com deleted_at é ignorado (credencial morta não se reaproveita)', async () => {
    const { fn } = fake([
      pagina(
        [
          { id: 'auth-morto', email: 'morto@fic.example', deleted_at: '2026-01-01T00:00:00Z' },
          { id: 'auth-vivo', email: 'vivo@fic.example' },
        ],
        null,
      ),
    ]);
    const indice = await buildIdentityIndex(fn);

    expect(indice.has('morto@fic.example')).toBe(false);
    expect(indice.get('vivo@fic.example')).toBe('auth-vivo');
  });

  it('8 — usuário banido é preservado como identidade existente', async () => {
    const { fn } = fake([
      pagina([{ id: 'auth-banido', email: 'banido@fic.example', banned_until: '2030-01-01T00:00:00Z' }], null),
    ]);
    const indice = await buildIdentityIndex(fn);

    // O uuid é real; o bloqueio continua sendo aplicado pelo Auth no login.
    expect(indice.get('banido@fic.example')).toBe('auth-banido');
  });

  it('9 — duplicidade entre páginas: a primeira ocorrência vence', async () => {
    const p1 = paginaCheia(1, 2);
    p1.data!.users![0] = { id: 'auth-primeiro', email: 'dup@fic.example' };

    const { fn } = fake([p1, pagina([{ id: 'auth-segundo', email: 'DUP@fic.example' }], null)]);
    const indice = await buildIdentityIndex(fn);

    expect(indice.get('dup@fic.example')).toBe('auth-primeiro');
  });

  it('10 — erro em página intermediária lança e não devolve índice parcial', async () => {
    const { fn, chamadas } = fake([
      paginaCheia(1, 2),
      { error: { message: 'rate limit' } },
      pagina([{ id: 'auth-nunca', email: 'nunca@fic.example' }], null),
    ]);

    await expect(buildIdentityIndex(fn)).rejects.toBeInstanceOf(IdentityIndexError);
    // Parou na página com erro: a terceira nunca foi buscada.
    expect(chamadas.map((c) => c.page)).toEqual([1, 2]);
  });

  it('11 — a mensagem do erro não vaza detalhe do provedor nem e-mail', async () => {
    const { fn } = fake([{ error: { message: 'segredo-do-provedor-xyz' } }]);
    const erro = await buildIdentityIndex(fn).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(IdentityIndexError);
    expect((erro as Error).message).toBe('Falha ao consultar as identidades existentes.');
    expect(String(erro)).not.toContain('segredo-do-provedor-xyz');
  });

  it('12 — página menor que PER_PAGE encerra mesmo com nextPage preenchido', async () => {
    const { fn, chamadas } = fake([
      pagina([{ id: 'auth-a', email: 'a@fic.example' }], 2),
      pagina([{ id: 'auth-b', email: 'b@fic.example' }], null),
    ]);
    const indice = await buildIdentityIndex(fn);

    expect(chamadas.map((c) => c.page)).toEqual([1]);
    expect(indice.has('b@fic.example')).toBe(false);
  });

  it('13 — página cheia seguida de página vazia encerra sem loop', async () => {
    const { fn, chamadas } = fake([paginaCheia(1, 2), pagina([], 3)]);
    const indice = await buildIdentityIndex(fn);

    expect(chamadas.map((c) => c.page)).toEqual([1, 2]);
    expect(indice.size).toBe(PER_PAGE);
  });

  it('14 — nextPage repetida lança erro de ciclo', async () => {
    const chamadas: number[] = [];
    const fn = vi.fn(async ({ page }: { page: number; perPage: number }) => {
      chamadas.push(page);
      return paginaCheia(page, page === 1 ? 2 : 1); // 1 → 2 → 1
    });

    await expect(buildIdentityIndex(fn)).rejects.toBeInstanceOf(IdentityIndexError);
    expect(chamadas).toEqual([1, 2]);
  });

  it('15 — nextPage inválida lança', async () => {
    for (const invalida of [0, -3, 1.5, Number.NaN]) {
      const { fn } = fake([paginaCheia(1, invalida)]);
      await expect(buildIdentityIndex(fn)).rejects.toBeInstanceOf(IdentityIndexError);
    }
  });

  it('16 — MAX_PAGES lança sem ultrapassar o teto de chamadas', async () => {
    const chamadas: number[] = [];
    const fn = vi.fn(async ({ page }: { page: number; perPage: number }) => {
      chamadas.push(page);
      return paginaCheia(page, page + 1); // nunca termina
    });

    await expect(buildIdentityIndex(fn)).rejects.toBeInstanceOf(IdentityIndexError);
    expect(chamadas.length).toBe(MAX_PAGES);
  });

  it('17 — sempre pede a página inteira (PER_PAGE)', async () => {
    const { fn, chamadas } = fake([paginaCheia(1, 2), pagina([], null)]);
    await buildIdentityIndex(fn);

    expect(chamadas.every((c) => c.perPage === PER_PAGE)).toBe(true);
  });
});
