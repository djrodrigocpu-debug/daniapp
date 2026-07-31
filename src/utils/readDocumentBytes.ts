/**
 * Lê os bytes de um documento escolhido via expo-document-picker, de forma
 * isomórfica (SDK 57):
 *   - web: usa o File do navegador exposto em asset.file (arrayBuffer);
 *   - nativo: usa a File API nova do expo-file-system (bytes()).
 * Docs: https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/
 */
import { Platform } from 'react-native';
import type { DocumentPickerAsset } from 'expo-document-picker';

export async function readDocumentBytes(asset: DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === 'web' && asset.file) {
    return new Uint8Array(await asset.file.arrayBuffer());
  }
  return readBytesFromUri(asset.uri);
}

/**
 * Mesma leitura isomórfica a partir de uma URI só — é o que a evidência precisa,
 * porque ela vem tanto da câmera (expo-image-picker, sem `file`) quanto do
 * seletor de documentos. No web, `blob:` e `data:` são acessíveis por `fetch`.
 *
 * Usada pelo upload de evidência: são estes bytes, e não o tamanho informado
 * pelo seletor, que definem o que sobe ao bucket (D-02).
 */
export async function readBytesFromUri(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  // A File API nova (SDK 54+) lança se importada no bundle web — import dinâmico
  // apenas no caminho nativo.
  const { File } = await import('expo-file-system');
  return await new File(uri).bytes();
}
