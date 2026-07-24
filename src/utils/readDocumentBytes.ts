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
  if (Platform.OS === 'web') {
    if (asset.file) {
      return new Uint8Array(await asset.file.arrayBuffer());
    }
    // Fallback web: blob: URIs são acessíveis via fetch.
    const response = await fetch(asset.uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  // A File API nova (SDK 54+) lança se importada no bundle web — import dinâmico
  // apenas no caminho nativo.
  const { File } = await import('expo-file-system');
  return await new File(asset.uri).bytes();
}
