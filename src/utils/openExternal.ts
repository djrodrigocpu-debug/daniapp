/**
 * Abertura de um arquivo de evidência, de forma isomórfica (SDK 57).
 *
 * A URL que chega aqui é SEMPRE assinada e de curta duração, emitida pelo
 * `EvidenceRepository` com o JWT de quem pediu — o bucket é privado e não existe
 * URL pública em lugar nenhum do produto (§12, D-03).
 *
 *   - web ....: abre em nova aba; o navegador exibe imagem e PDF e baixa o resto.
 *               `noopener,noreferrer` evita que a aba aberta alcance esta.
 *   - nativo .: `Linking.openURL` entrega ao visualizador do sistema.
 *
 * Docs: https://docs.expo.dev/versions/v57.0.0/sdk/linking/
 */
import { Linking, Platform } from 'react-native';

export async function openExternalUrl(url: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const janela = window.open(url, '_blank', 'noopener,noreferrer');
    // `null` quando o bloqueador de pop-up barra: é falha honesta, não sucesso.
    return janela != null;
  }
  if (!(await Linking.canOpenURL(url))) return false;
  await Linking.openURL(url);
  return true;
}
