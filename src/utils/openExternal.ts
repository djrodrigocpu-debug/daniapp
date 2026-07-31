/**
 * Peças de PLATAFORMA da abertura de comprovação (SDK 57). A ordem das
 * operações — que é onde estava o defeito — vive em
 * `domain/evidence/abrirEvidencia`, testável e sem `window`.
 *
 * A URL que passa por aqui é SEMPRE assinada e de curta duração, emitida com o
 * JWT de quem pediu. O bucket é privado e o produto não gera URL pública em
 * lugar nenhum (§12, D-03).
 *
 * Docs: https://docs.expo.dev/versions/v57.0.0/sdk/linking/
 */
import { Linking, Platform } from 'react-native';
import type { CanalDeAbertura } from '../domain/evidence/abrirEvidencia';

/**
 * Reserva o destino do arquivo. TEM que ser chamada de forma SÍNCRONA dentro do
 * manipulador do toque: no web é a abertura da aba que consome a ativação do
 * gesto, e ela expira no primeiro `await`.
 *
 * A aba nasce em branco e é navegada depois. Não passamos `'noopener'` porque
 * isso faz `window.open` devolver `null` por especificação, e aí não haveria
 * como navegar a aba nem como distinguir sucesso de bloqueio; o isolamento é
 * feito zerando `opener` antes de sair do nosso domínio.
 */
export function reservarAbertura(): CanalDeAbertura {
  if (Platform.OS !== 'web') {
    return {
      reservado: true,
      async concluir(url) {
        if (!(await Linking.canOpenURL(url))) return false;
        await Linking.openURL(url);
        return true;
      },
      cancelar() { /* nada a desfazer no nativo */ },
    };
  }

  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  return {
    reservado: aba != null,
    async concluir(url) {
      if (!aba) return false;
      try {
        // Corta a referência de volta antes de navegar para fora.
        aba.opener = null;
      } catch {
        // Navegador que não permite mexer em `opener`: seguimos assim mesmo.
      }
      aba.location.replace(url);
      return true;
    },
    cancelar() {
      try { aba?.close(); } catch { /* aba já fechada pelo usuário */ }
    },
  };
}

/**
 * Saída alternativa do web: baixa o arquivo autenticado e o entrega por
 * download. Existe porque download NÃO depende da ativação do gesto — então,
 * mesmo com a aba barrada por bloqueador estrito, o usuário recebe a
 * comprovação sem precisar liberar pop-up para o site.
 *
 * A object URL é revogada logo depois: nada de blob acumulado em memória. O
 * nome do arquivo é o ORIGINAL da evidência, nunca o caminho interno do bucket.
 */
export function baixarArquivo(nome: string): (url: string) => Promise<boolean> {
  return async (url: string) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
    let objectUrl: string | null = null;
    try {
      const resposta = await fetch(url);
      if (!resposta.ok) return false;
      const blob = await resposta.blob();     // preserva o MIME que o Storage devolveu
      objectUrl = URL.createObjectURL(blob);
      const ancora = document.createElement('a');
      ancora.href = objectUrl;
      ancora.download = nome;
      ancora.rel = 'noopener';
      document.body.appendChild(ancora);
      ancora.click();
      ancora.remove();
      return true;
    } catch {
      return false;
    } finally {
      // Só depois do clique: revogar antes cancelaria o próprio download.
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
    }
  };
}

/** true quando a plataforma oferece o download alternativo (só web). */
export const temDownloadAlternativo = Platform.OS === 'web';
