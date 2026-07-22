import { defineConfig } from 'vitest/config';

/**
 * Testes de domínio AAPEX/AACE V2.
 *
 * A camada de domínio (`src/domain`, `src/config`) é deliberadamente independente
 * de React Native (Masterplan §9.3, §17.1), portanto roda em ambiente Node puro.
 * Telas e componentes RN não são cobertos aqui — exigiriam jest-expo/RN testing
 * library e ficam para E2E na fase de homologação.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.expo/**'],
    globals: false,
    reporters: ['default'],
  },
});
