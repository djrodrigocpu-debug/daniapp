/**
 * Dublê de `expo-constants` para os testes em Node (mesmo padrão do
 * `asyncStorageMock` para o AsyncStorage — ver alias em `vitest.config.ts`).
 *
 * `expo-constants` não importa fora do bundler do Expo (arrasta
 * `expo-modules-core`, que é TypeScript dentro de `node_modules`). O dublê lê o
 * `app.json` REAL do repositório, então o teste continua provando a verdade que
 * importa em D-05: a versão exibida é a do manifesto, e não um valor digitado
 * em outro lugar.
 */
import appJson from '../../app.json';

export default {
  expoConfig: appJson.expo as { version?: string },
};
