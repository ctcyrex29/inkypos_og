import type { LocalStore, MigrationReport } from '@inkypos/core';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { openLocalStore, requestPersistentStorage } from '@/platform/storage';

type StoreState =
  | { phase: 'opening' }
  | { phase: 'ready'; store: LocalStore; migration: MigrationReport; persistenceGranted: boolean }
  | { phase: 'failed'; message: string };

const StoreContext = createContext<StoreState>({ phase: 'opening' });

/** Opens and migrates the local database once per app start. Nothing that sells may run before it is ready. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>({ phase: 'opening' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const persistenceGranted = await requestPersistentStorage();
        const store = await openLocalStore();
        const migration = await store.migrate();
        if (!cancelled) setState({ phase: 'ready', store, migration, persistenceGranted });
      } catch (e) {
        if (!cancelled) setState({ phase: 'failed', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <StoreContext.Provider value={state}>{children}</StoreContext.Provider>;
}

export function useLocalStore(): StoreState {
  return useContext(StoreContext);
}
