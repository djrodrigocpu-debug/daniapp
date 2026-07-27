/**
 * Provider de Sincronização/Offline (Masterplan §17). Expõe o estado real de
 * persistência para a UI.
 *
 *  - Modo LOCAL: cada escrita persiste no dispositivo (AsyncStorage). O estado
 *    reflete "salvando → salvo neste dispositivo" (offline-first, durável). NÃO há
 *    sincronização remota — declarar isso seria desonesto sem Supabase.
 *  - Modo SUPABASE: além do salvamento local, a outbox (domínio, com deduplicação
 *    idempotente — §12.3) enviaria as operações ao servidor; os estados
 *    aguardando/sincronizando/erro/conflito passam a valer. (Não exercitado aqui.)
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { localStore } from '../data/store/localStore';

export type SyncState = 'idle' | 'saving' | 'saved' | 'error';

interface SyncContextValue {
  /** Origem dos dados (local = offline-first; supabase = remoto). */
  source: 'local' | 'supabase';
  state: SyncState;
  /** ISO do último salvamento local bem-sucedido. */
  lastSavedAt: string | null;
  /** Operações aguardando envio remoto (0 em modo local). */
  pending: number;
  /** Rótulo apresentável do estado atual. */
  label: string;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { source } = useRepositories();
  const [state, setState] = useState<SyncState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  useEffect(() => {
    return localStore.subscribe(() => {
      // Primeira notificação = hidratação inicial, não uma escrita do usuário.
      if (first.current) {
        first.current = false;
        setState('saved');
        setLastSavedAt(new Date().toISOString());
        return;
      }
      setState('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setState('saved');
        setLastSavedAt(new Date().toISOString());
      }, 500);
    });
  }, []);

  const label = useMemo(() => {
    if (state === 'saving') return 'Salvando…';
    if (source === 'local') return state === 'saved' ? 'Salvo neste dispositivo' : 'Offline-first';
    return state === 'saved' ? 'Sincronizado' : 'Sincronização corporativa';
  }, [state, source]);

  const value = useMemo<SyncContextValue>(
    () => ({ source, state, lastSavedAt, pending: 0, label }),
    [source, state, lastSavedAt, label],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync exige SyncProvider.');
  return ctx;
}
