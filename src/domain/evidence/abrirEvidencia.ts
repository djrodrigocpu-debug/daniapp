/**
 * Orquestração da abertura de uma comprovação (D-03, correção web).
 *
 * O DEFEITO QUE ISTO FECHA. A versão anterior fazia, no toque do usuário:
 *
 *     const url = await obterUrlAssinada();   // ida ao servidor
 *     window.open(url, '_blank', 'noopener'); // ← tarde demais
 *
 * Medido no Chrome com clique real: `navigator.userActivation.isActive` é
 * `true` na entrada do manipulador e `false` depois do `await`. Sem ativação, o
 * Chrome trata `window.open` como pop-up e bloqueia. Pior: `'noopener'` faz
 * `window.open` devolver `null` POR ESPECIFICAÇÃO, mesmo quando a aba abre — de
 * modo que, depois de liberar o pop-up, o usuário ainda via mensagem de erro.
 *
 * A ORDEM CORRETA, que este módulo impõe: a aba é reservada PRIMEIRO, ainda
 * dentro do gesto, e só depois se busca a URL assinada. A aba em branco espera;
 * quando a URL chega, ela é navegada. Se a URL não vier, a aba é fechada.
 *
 * E se o navegador barrar a reserva mesmo assim (bloqueador estrito, política
 * corporativa), há a segunda saída: baixar o arquivo autenticado e entregá-lo
 * por download. Download não é gate de ativação, então o usuário recebe a
 * comprovação sem precisar liberar pop-up para o site — que é o requisito.
 *
 * Este arquivo é PURO de propósito: nada de `window`, nada de React Native. As
 * duas peças de plataforma entram como dependências, e é isso que permite
 * testar a ORDEM — que era exatamente o que o teste anterior não via, porque
 * ele substituía `window.open` por um dublê e media o dublê.
 */

export type ResultadoUrl = { ok: true; url: string } | { ok: false; message: string };

/** Destino já reservado para receber o arquivo. */
export interface CanalDeAbertura {
  /** false no web quando o navegador recusou a aba. */
  readonly reservado: boolean;
  /** Leva o destino à URL. `false` quando não foi possível exibir. */
  concluir(url: string): Promise<boolean>;
  /** Desfaz a reserva quando a URL não veio ou não pôde ser usada. */
  cancelar(): void;
}

export interface DependenciasDeAbertura {
  /** DEVE ser síncrona e chamada dentro do gesto do usuário. */
  reservar: () => CanalDeAbertura;
  obterUrl: () => Promise<ResultadoUrl>;
  /** Saída alternativa quando a aba foi barrada. Ausente no nativo. */
  baixar?: (url: string) => Promise<boolean>;
}

export type MotivoDaFalha = 'acesso' | 'bloqueado' | 'exibicao';

export type ResultadoDaAbertura =
  | { ok: true; via: 'aba' | 'download' }
  | { ok: false; motivo: MotivoDaFalha; message: string };

/**
 * Mensagens distintas por causa. "Erro" sozinho não diz ao usuário se ele deve
 * pedir acesso, avisar quem enviou o arquivo, ou mexer no navegador.
 */
export const MENSAGENS = {
  bloqueado:
    'O navegador impediu a abertura e o download não pôde ser concluído. '
    + 'Verifique as permissões desta página e tente novamente.',
  exibicao:
    'A comprovação foi localizada, mas o dispositivo não conseguiu abrir este tipo de arquivo.',
} as const;

export async function abrirEvidencia(deps: DependenciasDeAbertura): Promise<ResultadoDaAbertura> {
  // PRIMEIRA LINHA, SEM `await` ANTES: é o que preserva a ativação do gesto.
  const canal = deps.reservar();

  const url = await deps.obterUrl();
  if (!url.ok) {
    // Sem endereço não há o que exibir: a aba reservada não pode ficar aberta
    // em branco.
    canal.cancelar();
    return { ok: false, motivo: 'acesso', message: url.message };
  }

  if (canal.reservado) {
    if (await canal.concluir(url.url)) return { ok: true, via: 'aba' };
    canal.cancelar();
    // Destino reservado que não exibiu: no nativo é tipo não suportado, e aí
    // não há download alternativo a oferecer.
    if (!deps.baixar) return { ok: false, motivo: 'exibicao', message: MENSAGENS.exibicao };
  }

  if (deps.baixar && (await deps.baixar(url.url))) return { ok: true, via: 'download' };

  return { ok: false, motivo: 'bloqueado', message: MENSAGENS.bloqueado };
}
