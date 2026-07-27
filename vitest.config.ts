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
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.expo/**'],
    globals: false,
    reporters: ['default'],
  },
});
