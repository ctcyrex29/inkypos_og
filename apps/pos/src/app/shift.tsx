import type { CurrencyCode, ShiftRecord } from '@inkypos/core';
import { Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ShiftScreen, type ShiftSummaryView } from '@/features/shift/ShiftScreen';
import { useCashier } from '@/services/cashier-context';
import { printDocument } from '@/services/printer';
import { useSession } from '@/services/session-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { closeShift, lastClosedShift, openShift, recordCash, shiftReportDocument, shiftSummary } from '@/services/till-data';

export default function Shift() {
  const storeState = useLocalStore();
  const { status } = useSession();
  const sync = useSync();
  const { cashier } = useCashier();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const device = status?.phase === 'ready' ? status.device : null;
  const [state, setState] = useState<{ summary: ShiftSummaryView | null; currencies: CurrencyCode[]; lastClosed: ShiftRecord | null } | null>(null);

  const load = useCallback(async () => {
    if (!store) return null;
    const methods = await store.reference.paymentMethods();
    const cash = methods.filter((m) => m.kind === 'cash').flatMap((m) => m.currencies);
    const business = await store.reference.business();
    const currencies = [...new Set([business?.base_currency ?? 'USD', ...cash])] as CurrencyCode[];
    return { summary: await shiftSummary(store), currencies, lastClosed: await lastClosedShift(store) };
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

  const print = async (shift: ShiftRecord) => {
    if (!store || !device) return;
    const doc = await shiftReportDocument(store, device, shift, cashier?.name ?? null);
    await printDocument(store, 'report', doc, 'Shift report');
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
      onPrintCurrent={state.summary ? () => print(state.summary!.shift) : undefined}
      onPrintLast={state.lastClosed ? () => print(state.lastClosed!) : null}
    />
  );
}
