import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Testes de domínio AAPEX/AACE V2.
 *
 * A camada de domínio (`src/domain`, `src/config`) é deliberadamente independente
 * de React Native (Masterplan §9.3, §17.1), portanto roda em ambiente Node puro.
 * Telas e componentes RN não são cobertos aqui — exigiriam jest-expo/RN testing
 * library e ficam para E2E na fase de homologação.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Store local usa AsyncStorage (React Native); em Node testamos com um mock
      // em memória — a lógica de store/repositório é RN-independente.
      '@react-native-async-storage/async-storage': fileURLToPath(
        new URL('./src/testing/asyncStorageMock.ts', import.meta.url),
      ),
      // `expo-constants` (fonte única da versão exibida, D-05) não importa fora
      // do bundler do Expo; o dublê lê o `app.json` real.
      'expo-constants': fileURLToPath(
        new URL('./src/testing/expoConstantsMock.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // `scripts/` entra porque o preflight de build é JS puro de Node, executado
    // antes do `expo export` — fora de `src/`, mas com lógica que precisa de
    // teste: é ele que impede um build sem configuração virar deploy silencioso
    // em modo demonstração.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: ['node_modules/**', 'dist/**', '.expo/**'],
    globals: false,
    reporters: ['default'],
    /**
     * Os testes de banco sobem um PostgreSQL em WASM (PGlite) e, em vários
     * arquivos, o `beforeEach` chama `db.reset()` — que reaplica TODAS as
     * migrations. Esse custo cresce a cada migration nova: com as 0031–0034 da
     * 1.3.2 o reset passou a estourar, de forma intermitente e só sob a carga
     * paralela da suíte inteira, o limite padrão de 10s do vitest. O sintoma era
     * um arquivo inteiro pulado num rodar e verde no seguinte.
     *
     * O limite alto não esconde lentidão de teste: `testTimeout` continua no
     * padrão, então só a PREPARAÇÃO ganha folga. Um hook realmente travado
     * continua falhando — apenas mais tarde.
     */
    hookTimeout: 60_000,
  },
});
