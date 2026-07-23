/**
 * Mock em memória de `@react-native-async-storage/async-storage` para os testes
 * Node (vitest). Aliased em `vitest.config.ts`. Não é usado em runtime.
 */
const memory = new Map<string, string>();

const AsyncStorageMock = {
  async getItem(key: string): Promise<string | null> {
    return memory.has(key) ? (memory.get(key) as string) : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memory.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    memory.delete(key);
  },
  async clear(): Promise<void> {
    memory.clear();
  },
  /** Helper de teste (não faz parte da API real). */
  __reset(): void {
    memory.clear();
  },
};

export default AsyncStorageMock;
