/**
 * Versão do aplicativo — FONTE ÚNICA (D-05).
 *
 * POR QUE ESTE ARQUIVO EXISTE. A versão exibida vinha de `EXPO_PUBLIC_APP_VERSION`,
 * uma variável mantida à mão no `.env` e no provedor de build. Ela derivou do
 * resto do produto e ficou marcando `2.0.0` enquanto `app.json` e `package.json`
 * diziam `1.3.0` — a tela de login anunciava uma versão que não existe e que o
 * proprietário reservou para uma evolução futura. Variável de ambiente separada
 * do manifesto é justamente o que permite esse tipo de divergência silenciosa.
 *
 * A versão passa a vir de `app.json` (`expo.version`), que é o mesmo campo que
 * carimba o build nativo e o export web. Não há segunda fonte a sincronizar, e
 * não há como a Vercel publicar uma versão diferente da que está no repositório:
 * o `expo-constants` embute o manifesto no bundle em tempo de build.
 */
import Constants from 'expo-constants';

/**
 * Versão do manifesto. `'0.0.0'` (neutro, tratado como "não configurado" por
 * `appVersion()`) apenas se o manifesto não chegar ao bundle — nunca um número
 * inventado, que reintroduziria o defeito de exibir versão falsa.
 */
export function manifestVersion(): string {
  const v = Constants.expoConfig?.version;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : '0.0.0';
}
