/**
 * Peças de PLATAFORMA da entrega do PDF (SDK 57). A ORDEM da exportação vive em
 * `domain/report/exportarRelatorioOficial`, testável e sem `window`.
 *
 * WEB — download direto, nunca `window.open`. O arquivo é gerado no próprio
 * dispositivo, então não há URL a abrir: cria-se um Blob, uma object URL
 * temporária, um `<a download>`, dispara-se o clique e revoga-se a URL. Download
 * não depende da ativação do gesto e não é tratado como pop-up, de modo que o
 * usuário NUNCA precisa liberar pop-up para receber o relatório — o mesmo
 * princípio já usado em `baixarArquivo` para as comprovações.
 *
 * NATIVO — o PDF é escrito em arquivo temporário no diretório de cache e
 * oferecido pela folha de compartilhamento do sistema, que é por onde o usuário
 * escolhe salvar, enviar ou imprimir. Nenhuma permissão nova é pedida: o cache
 * do próprio aplicativo não exige acesso ao armazenamento externo.
 *
 * Docs SDK 57:
 *   https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/
 *   https://docs.expo.dev/versions/v57.0.0/sdk/sharing/
 */
import { Platform } from 'react-native';
import type { ResultadoDaEntrega } from '../domain/report/exportarRelatorioOficial';
import { MENSAGENS } from '../domain/report/exportarRelatorioOficial';

const MIME_PDF = 'application/pdf';

/** Entrega pelo caminho da plataforma corrente. */
export function entregarPdf(): (bytes: Uint8Array, fileName: string) => Promise<ResultadoDaEntrega> {
  return Platform.OS === 'web' ? baixarPdfNoNavegador : compartilharPdfNoDispositivo;
}

// ---------------------------------------------------------------------------
// Web
// ---------------------------------------------------------------------------
async function baixarPdfNoNavegador(bytes: Uint8Array, fileName: string): Promise<ResultadoDaEntrega> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return { ok: false, motivo: 'salvamento', message: MENSAGENS.salvamento };
  }

  let objectUrl: string | null = null;
  try {
    // `slice()` desprende os bytes de qualquer buffer compartilhado antes de
    // entregá-los ao Blob.
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: MIME_PDF });
    objectUrl = URL.createObjectURL(blob);

    const ancora = document.createElement('a');
    ancora.href = objectUrl;
    ancora.download = fileName;
    ancora.rel = 'noopener';
    ancora.style.display = 'none';
    document.body.appendChild(ancora);
    ancora.click();
    ancora.remove();

    return { ok: true, via: 'download' };
  } catch {
    return { ok: false, motivo: 'salvamento', message: MENSAGENS.salvamento };
  } finally {
    // Só depois do clique: revogar de imediato cancelaria o próprio download.
    if (objectUrl) {
      const url = objectUrl;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }
}

// ---------------------------------------------------------------------------
// Android e iOS
// ---------------------------------------------------------------------------
async function compartilharPdfNoDispositivo(bytes: Uint8Array, fileName: string): Promise<ResultadoDaEntrega> {
  // Importação tardia: no bundle web estes módulos não precisam ser carregados,
  // e `expo-sharing` no navegador cairia na Web Share API, que não compartilha
  // arquivo local — o caminho web é o download acima.
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');

  if (!(await Sharing.isAvailableAsync())) {
    return {
      ok: false,
      motivo: 'compartilhamento-indisponivel',
      message: MENSAGENS['compartilhamento-indisponivel'],
    };
  }

  let arquivo: InstanceType<typeof File> | null = null;
  try {
    arquivo = new File(Paths.cache, fileName);
    if (arquivo.exists) arquivo.delete();
    arquivo.create();
    arquivo.write(bytes);
  } catch {
    return { ok: false, motivo: 'salvamento', message: MENSAGENS.salvamento };
  }

  try {
    await Sharing.shareAsync(arquivo.uri, {
      mimeType: MIME_PDF,
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Relatório Oficial de Auditoria',
    });
    return { ok: true, via: 'compartilhamento' };
  } catch {
    return { ok: false, motivo: 'salvamento', message: MENSAGENS.salvamento };
  } finally {
    // O arquivo temporário fica no cache do aplicativo, que o sistema limpa. Não
    // é apagado aqui de propósito: em Android e iOS a folha de compartilhamento
    // pode ler o arquivo DEPOIS de `shareAsync` resolver, e apagá-lo agora
    // entregaria um anexo vazio ao aplicativo escolhido.
  }
}
