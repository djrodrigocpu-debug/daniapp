/**
 * Contrato de toda mutação administrativa: gravar e, só em caso de sucesso,
 * recarregar a fonte ANTES de devolver o resultado à tela.
 *
 * POR QUE ISTO EXISTE COMO MÓDULO PRÓPRIO. Em modo corporativo a assinatura
 * reativa do store fica desligada — ela serve só ao modo demonstração —, então
 * nada além desta recarga atualiza a lista depois de uma escrita. Sem ela o
 * servidor gravava e a tela seguia velha: indicador criado não aparecia, "nova
 * versão" parecia sumir, papel e ativação de usuário pareciam não ter efeito.
 *
 * O prejuízo não era só visual: como a tela não mudava, o operador clicava de
 * novo, e cada clique gravava outra vez — chegaram a existir 12 versões
 * duplicadas de indicador em produção.
 *
 * Extraído do provider para que o contrato seja exercitado por comportamento
 * (o projeto não tem renderizador de componentes nos testes), não por leitura
 * do próprio código.
 */

export interface MutationOutcome {
  ok: boolean;
  error?: { message: string };
}

export type AdminMutationResult =
  | { ok: true }
  | { ok: false; message: string };

export const FALHA_GENERICA = 'Falha na operação.';

/**
 * `load` roda **apenas** quando a mutação deu certo, e o resultado só é
 * entregue depois que ela termina — quem recebe `{ ok: true }` pode confiar que
 * a lista já reflete a escrita.
 *
 * Mutação com erro não recarrega: nada mudou no servidor, e recarregar só
 * gastaria uma ida à rede escondendo a falha atrás de um estado de carregamento.
 */
export async function aplicarMutacao(
  op: Promise<MutationOutcome>,
  load: () => Promise<unknown>,
): Promise<AdminMutationResult> {
  const res = await op;
  if (!res.ok) return { ok: false, message: res.error?.message ?? FALHA_GENERICA };
  await load();
  return { ok: true };
}
