/**
 * Entrega do arquivo de EXPORTAÇÃO (CSV/XLSX), pelo caminho da plataforma.
 *
 * Mesma forma de `entregarPdf`, e é reuso deliberado: o requisito de entrega já
 * foi resolvido uma vez — download real no navegador, sem `window.open` e sem
 * pop-up; folha de compartilhamento no dispositivo, a partir do cache do próprio
 * aplicativo, sem pedir permissão de armazenamento externo.
 *
 * O que muda em relação ao PDF é só o MIME e o UTI. Reescrever o mecanismo teria
 * criado uma segunda forma de entregar arquivo, que divergiria da primeira no
 * próximo conserto.
 *
 * Docs SDK 57:
 *   https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/
 *   https://docs.expo.dev/versions/v57.0.0/sdk/sharing/
 */
import { Platform } from 'react-native';
import { ExportFormat } from '../domain/exporting/dataset';

export interface ResultadoDaExportacao {
  ok: boolean;
  via?: 'download' | 'compartilhamento';
  message?: string;
}

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const UTI: Record<ExportFormat, string> = {
  csv: 'public.comma-separated-values-text',
  xlsx: 'org.openxmlformats.spreadsheetml.sheet',
};

const FALHA_SALVAMENTO =
  'Não foi possível salvar o arquivo. Verifique o espaço disponível e tente novamente.';

export function entregarExport(): (
  bytes: Uint8Array, fileName: string, format: ExportFormat,
) => Promise<ResultadoDaExportacao> {
  return Platform.OS === 'web' ? baixarNoNavegador : compartilharNoDispositivo;
}

async function baixarNoNavegador(
  bytes: Uint8Array, fileName: string, format: ExportFormat,
): Promise<ResultadoDaExportacao> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return { ok: false, message: FALHA_SALVAMENTO };
  }

  let objectUrl: string | null = null;
  try {
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: MIME[format] });
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
    return { ok: false, message: FALHA_SALVAMENTO };
  } finally {
    // Só depois do clique: revogar de imediato cancelaria o próprio download.
    if (objectUrl) {
      const url = objectUrl;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }
}

async function compartilharNoDispositivo(
  bytes: Uint8Array, fileName: string, format: ExportFormat,
): Promise<ResultadoDaExportacao> {
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');

  if (!(await Sharing.isAvailableAsync())) {
    return { ok: false, message: 'Compartilhamento indisponível neste dispositivo.' };
  }

  try {
    const arquivo = new File(Paths.cache, fileName);
    if (arquivo.exists) arquivo.delete();
    arquivo.create();
    arquivo.write(bytes);
    await Sharing.shareAsync(arquivo.uri, {
      mimeType: MIME[format],
      UTI: UTI[format],
      dialogTitle: 'Exportação AAPEx',
    });
    return { ok: true, via: 'compartilhamento' };
  } catch {
    return { ok: false, message: FALHA_SALVAMENTO };
  }
}
