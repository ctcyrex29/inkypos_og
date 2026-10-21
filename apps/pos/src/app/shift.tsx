import type { CurrencyCode } from '@inkypos/core';
import { Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ShiftScreen, type ShiftSummaryView } from '@/features/shift/ShiftScreen';
import { useCashier } from '@/services/cashier-context';
import { useSession } from '@/services/session-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { closeShift, openShift, recordCash, shiftSummary } from '@/services/till-data';

export default function Shift() {
  const storeState = useLocalStore();
  const { status } = useSession();
  const sync = useSync();
  const { cashier } = useCashier();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const device = status?.phase === 'ready' ? status.device : null;
  const [state, setState] = useState<{ summary: ShiftSummaryView | null; currencies: CurrencyCode[] } | null>(null);

  const load = useCallback(async () => {
    if (!store) return null;
    const methods = await store.reference.paymentMethods();
    const cash = methods.filter((m) => m.kind === 'cash').flatMap((m) => m.currencies);
    const business = await store.reference.business();
    const currencies = [...new Set([business?.base_currency ?? 'USD', ...cash])] as CurrencyCode[];
    return { summary: await shiftSummary(store), currencies };
  }, [store]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => !cancelled && next && setState(next));
    return () => {
      cancelled = true;
    };
  }, [load, sync.lastRun]);

  const after = async (fn: () => Promise<void>) => {
    await fn();
    const next = await load();
    if (next) setState(next);
    void sync.syncNow();
  };

  if (!cashier) return <Redirect href={{ pathname: '/sign-in', params: { next: 'shift' } }} />;
  if (!store || !device || !state) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <ShiftScreen
      summary={state.summary}
      currencies={state.currencies}
      onOpen={(float) => after(() => openShift(store, device, cashier, float))}
      onCash={(input) => after(() => recordCash(store, device, cashier, input))}
      onClose={(counted, note) => after(() => closeShift(store, device, cashier, counted, note))}
    />
  );
}
