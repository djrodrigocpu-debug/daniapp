/**
 * Store local persistente — a "base de dados" REAL LOCAL do app (§5, §17).
 *
 * Fonte única de verdade operacional: um único `AppData` persistido em
 * `AsyncStorage`. Tanto os repositórios locais quanto o `AppContext` (durante a
 * migração strangler) leem/escrevem AQUI, evitando dessincronização enquanto as
 * telas migram uma a uma para a camada de repositório.
 *
 * Classificação: REAL LOCAL (persistência executável), não DEMONSTRATIVO — o
 * seed `mock.ts` é usado apenas para a PRIMEIRA hidratação de desenvolvimento,
 * nunca como fallback silencioso em runtime. Em um build com Supabase, os
 * repositórios Supabase substituem este store como fonte (ver RepositoryProvider).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '../../types';
import { initialData } from '../mock';

/** Chave de persistência (compatível com o histórico local já existente). */
export const STORE_KEY = '@aace_excelencia:data:v1.2';

type Listener = () => void;

export class LocalStore {
  private data: AppData;
  private ready = false;
  private initStarted = false;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly seed: AppData = initialData, private readonly key: string = STORE_KEY) {
    this.data = seed;
  }

  /** Assina mudanças (compatível com `useSyncExternalStore`). */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Snapshot estável — mesma referência até a próxima `update`. */
  getSnapshot = (): AppData => this.data;

  /** true após a hidratação inicial do armazenamento. */
  isReady = (): boolean => this.ready;

  /** Hidrata a partir do armazenamento (idempotente). Chamado uma vez no boot. */
  async init(): Promise<void> {
    if (this.initStarted) return;
    this.initStarted = true;
    try {
      const stored = await AsyncStorage.getItem(this.key);
      if (stored) this.data = JSON.parse(stored) as AppData;
    } catch {
      // Mantém o seed em caso de armazenamento corrompido; boot não quebra.
    } finally {
      this.ready = true;
      this.emit();
    }
  }

  /** Aplica uma transição imutável, persiste e notifica. */
  update(mutator: (previous: AppData) => AppData): AppData {
    this.data = mutator(this.data);
    this.emit();
    void AsyncStorage.setItem(this.key, JSON.stringify(this.data));
    return this.data;
  }

  /** Restaura o seed (uso exclusivo do modo demonstração de desenvolvimento). */
  async reset(): Promise<void> {
    this.data = this.seed;
    this.emit();
    await AsyncStorage.setItem(this.key, JSON.stringify(this.data));
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Instância única do app. */
export const localStore = new LocalStore();
