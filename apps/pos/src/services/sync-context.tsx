import { buildSampleSale, CataloguePuller, SyncWorker, type LocalSale, type LocalSyncState, type PullResult, type SyncRunResult } from '@inkypos/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { newId } from './api';
import { useSession } from './session-context';
import { useLocalStore } from './store-context';

const SYNC_INTERVAL_MS = 30_000;

export interface SyncState {
  counts: Record<LocalSyncState, number> | null;
  recent: LocalSale[];
  lastRun: { at: string; result: SyncRunResult } | null;
  /** Last catalogue pull; `catalogueRevision` changes whenever new reference data was applied. */
  lastPull: { at: string; result: PullResult } | null;
  catalogueRevision: number;
  running: boolean;
  /** force: a person tapped Sync now, so retry delays are skipped. */
  syncNow: (force?: boolean) => Promise<void>;
  /** Development builds only: records a fake cash sale to exercise sync before checkout exists. */
  recordSampleSale: (() => Promise<void>) | null;
}

const SyncContext = createContext<SyncState | null>(null);

/**
 * Keeps the till in step with the server: each run first pulls catalogue and
 * reference changes, then drains the outbox. Runs on start, every 30 s, when
 * the app returns to the foreground, and on demand. A revoked or unenrolled
 * till never syncs.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const storeState = useLocalStore();
  const { session, status, reload } = useSession();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const device = status?.phase === 'ready' ? status.device : null;
  // The worker reads the current device through this ref; it is updated after render, never during.
  const deviceIdRef = useRef<string | null>(null);
  const deviceId = device?.device_id ?? null;
  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  const [counts, setCounts] = useState<SyncState['counts']>(null);
  const [recent, setRecent] = useState<LocalSale[]>([]);
  const [lastRun, setLastRun] = useState<SyncState['lastRun']>(null);
  const [running, setRunning] = useState(false);
  const [lastPull, setLastPull] = useState<SyncState['lastPull']>(null);
  const [catalogueRevision, setCatalogueRevision] = useState(0);

  const worker = useMemo(
    () =>
      store
        ? new SyncWorker({
            store,
            transport: { push: (batchId, deviceId, bodies) => session.pushEvents(batchId, deviceId, bodies) },
            deviceId: () => deviceIdRef.current,
            newId,
          })
        : null,
    [store, session],
  );

  const puller = useMemo(() => (store ? new CataloguePuller(store, { pull: (cursor) => session.pullChanges(cursor) }) : null), [store, session]);

  const loadSummary = useCallback(
    async () => (store ? { counts: await store.outbox.countByState(), recent: await store.sales.listRecent(10) } : null),
    [store],
  );

  const refresh = useCallback(async () => {
    const summary = await loadSummary();
    if (!summary) return;
    setCounts(summary.counts);
    setRecent(summary.recent);
  }, [loadSummary]);

  const syncNow = useCallback(async (force = false) => {
    if (!worker || !puller || !deviceIdRef.current) return;
    setRunning(true);
    try {
      const pulled = await puller.pullOnce();
      setLastPull({ at: new Date().toISOString(), result: pulled });
      if (pulled.changes > 0) setCatalogueRevision((r) => r + 1);
      const result = await worker.runOnce({ force });
      setLastRun({ at: new Date().toISOString(), result });
      // An auth stop may mean this device was just revoked; let the session re-evaluate.
      if (result.stoppedBy === 'auth') await reload();
    } finally {
      setRunning(false);
      await refresh();
    }
  }, [worker, puller, refresh, reload]);

  useEffect(() => {
    let cancelled = false;
    void loadSummary().then((summary) => {
      if (cancelled || !summary) return;
      setCounts(summary.counts);
      setRecent(summary.recent);
    });
    return () => {
      cancelled = true;
    };
  }, [loadSummary]);

  useEffect(() => {
    if (!worker || !device) return;
    void syncNow();
    const timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncNow();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [worker, device, syncNow]);

  const recordSampleSale = useMemo(() => {
    if (!__DEV__ || !store || !device) return null;
    return async () => {
      await store.sales.commitSale(
        buildSampleSale(
          {
            newId,
            tenantId: device.tenant_id,
            branchId: device.branch_id,
            registerId: device.register_id,
            deviceId: device.device_id,
            actorId: device.device_id,
          },
          3,
        ),
      );
      await refresh();
      void syncNow();
    };
  }, [store, device, refresh, syncNow]);

  return (
    <SyncContext.Provider value={{ counts, recent, lastRun, lastPull, catalogueRevision, running, syncNow, recordSampleSale }}>{children}</SyncContext.Provider>
  );
}

export function useSync(): SyncState {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
