/**
 * Índice de identidades já existentes no Supabase Auth.
 *
 * DEFEITO QUE ISTO CORRIGE: a busca anterior chamava
 * `listUsers({ page: 1, perPage: 1 })` e procurava o e-mail no ÚNICO usuário
 * devolvido. O SDK não oferece filtro por e-mail — `PageParams` aceita apenas
 * `page` e `perPage` —, então a consulta praticamente sempre respondia "não
 * existe". A consequência não era só um convite repetido: o provedor recusa o
 * e-mail já registrado, a linha vira `failed`, o lote não avança para o commit
 * transacional e a operação fica travada. Pior, a trava é auto-infligida — uma
 * falha parcial deixa identidades criadas SEM perfil, e toda reexecução volta a
 * cair no mesmo ponto até alguém apagar identidades à mão.
 *
 * A varredura acontece UMA VEZ por requisição e resolve o lote inteiro contra o
 * mapa resultante. Uma varredura por e-mail multiplicaria as chamadas pelo
 * tamanho do lote (até 200) e esbarraria no rate limit do GoTrue.
 *
 * Este arquivo é PURO de propósito: sem `Deno`, sem `esm.sh`, sem variável de
 * ambiente, sem cliente Supabase. Assim o vitest exercita a paginação em Node —
 * era exatamente a ausência dessa cobertura que deixou o defeito passar, já que
 * `index.ts` não é alcançável por nenhum runner do projeto.
 */

/** Página inteira por chamada: é o máximo prático aceito pelo GoTrue. */
export const PER_PAGE = 1000;

/**
 * Teto defensivo: 50 páginas × 1000 = 50.000 identidades. Protege contra loop
 * por `nextPage` inconsistente e contra consumo descontrolado no isolate.
 */
export const MAX_PAGES = 50;

/** Erro de varredura. Nunca carrega e-mail, id ou detalhe do provedor. */
export class IdentityIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityIndexError';
  }
}

/** Forma mínima do usuário devolvido pela Auth Admin API. */
export interface AuthUserLike {
  id?: string | null;
  email?: string | null;
  deleted_at?: string | null;
  banned_until?: string | null;
}

/** Forma mínima da resposta paginada da Auth Admin API. */
export interface ListUsersResult {
  data?: { users?: AuthUserLike[] | null; nextPage?: number | null } | null;
  error?: unknown;
}

/** `admin.auth.admin.listUsers` reduzido ao que usamos — injetável no teste. */
export type ListUsersFn = (params: { page: number; perPage: number }) => Promise<ListUsersResult>;

/**
 * Percorre todas as páginas e devolve `Map<e-mail normalizado, uuid>`.
 *
 * FALHA FECHADA: erro de página, ciclo ou estouro do teto LANÇAM. Devolver um
 * índice parcial seria pior que não consultar nada — os e-mails que ficaram de
 * fora seriam classificados como novos e receberiam convite duplicado.
 *
 * O índice é local à chamada. Guardá-lo em escopo de módulo pareceria uma
 * otimização, mas o isolate do Deno é reaproveitado entre requisições: um
 * índice velho não enxergaria identidade criada nesse meio-tempo e reenviaria
 * convite. Cada requisição constrói o seu.
 */
export async function buildIdentityIndex(listUsers: ListUsersFn): Promise<Map<string, string>> {
  const indice = new Map<string, string>();
  const visitadas = new Set<number>();
  let page = 1;

  for (;;) {
    if (visitadas.size >= MAX_PAGES) {
      throw new IdentityIndexError('Varredura de identidades excedeu o limite de páginas.');
    }
    if (visitadas.has(page)) {
      throw new IdentityIndexError('Paginação de identidades entrou em ciclo.');
    }
    visitadas.add(page);

    const resposta = await listUsers({ page, perPage: PER_PAGE });
    if (resposta.error) {
      // Mensagem genérica: o detalhe do provedor não sai daqui.
      throw new IdentityIndexError('Falha ao consultar as identidades existentes.');
    }

    const usuarios = resposta.data?.users ?? [];
    for (const u of usuarios) {
      const id = u?.id;
      if (typeof id !== 'string' || id === '') continue;
      const email = typeof u?.email === 'string' ? u.email.trim().toLowerCase() : '';
      if (email === '') continue;
      // Identidade removida não é reaproveitável: reusar o uuid colaria o perfil
      // corporativo numa credencial morta.
      if (u.deleted_at) continue;
      // Banido CONTINUA sendo identidade existente: o uuid é real e o bloqueio é
      // aplicado pelo próprio Auth no login. Convidar de novo só produziria
      // "already registered" e travaria o lote.
      if (!indice.has(email)) indice.set(email, id);
    }

    const proxima = resposta.data?.nextPage ?? null;
    if (proxima === null) break;
    if (usuarios.length === 0) break;
    if (usuarios.length < PER_PAGE) break;
    if (!Number.isInteger(proxima) || proxima <= 0) {
      throw new IdentityIndexError('Paginação de identidades devolveu página inválida.');
    }
    page = proxima;
  }

  return indice;
}
