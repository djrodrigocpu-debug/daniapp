/**
 * Diálogo de aviso/confirmação que FUNCIONA nas duas plataformas.
 *
 * `Alert.alert` do React Native não é implementado pelo react-native-web: no
 * build web ele simplesmente não faz nada. Como a app roda em web (Vercel) e em
 * nativo com o MESMO código de tela, toda mensagem de erro emitida por Alert
 * ficava INVISÍVEL no navegador — o usuário via o botão "não reagir" quando na
 * verdade a operação havia sido recusada com um motivo. Este módulo mantém a
 * mesma assinatura de `Alert.alert` e escolhe o canal por plataforma.
 *
 * Mantém a semântica dos botões: com um botão "cancel" + um de ação, vira
 * window.confirm (confirmar ⇒ onPress da ação; cancelar ⇒ onPress do cancel);
 * caso contrário vira window.alert e dispara o onPress do único botão.
 */
import { Alert, AlertButton, Platform } from 'react-native';

export function alertDialog(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;
  const cancel = buttons?.find((b) => b.style === 'cancel');
  const action = buttons?.find((b) => b.style !== 'cancel');

  if (cancel && action) {
    // eslint-disable-next-line no-alert
    if (window.confirm(text)) action.onPress?.();
    else cancel.onPress?.();
    return;
  }

  // eslint-disable-next-line no-alert
  window.alert(text);
  action?.onPress?.();
}
