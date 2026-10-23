import Constants from 'expo-constants';
import { canStartSale, hasRestaurant } from '@inkypos/core';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { CashierPanel } from '@/features/staff/CashierPanel';
import { DevicePanel } from '@/features/status/DevicePanel';
import { LockedScreen } from '@/features/status/LockedScreen';
import { StatusScreen } from '@/features/status/StatusScreen';
import { SyncPanel } from '@/features/sync/SyncPanel';
import { backOfficeUrl, createAppApiClient, defaultApiBaseUrl } from '@/services/api';
import { useCashier } from '@/services/cashier-context';
import { useSession } from '@/services/session-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { Button } from '@/ui/components';

export default function Index() {
  const { session, status, reload } = useSession();
  const router = useRouter();
  const sync = useSync();
  const { cashier, signOut, can } = useCashier();
  const baseUrl = defaultApiBaseUrl();
  const client = useMemo(() => createAppApiClient(baseUrl), [baseUrl]);
  const enrolled = status?.phase === 'ready';
  const storeState = useLocalStore();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  // Restaurants get orders and the kitchen screen; the setting arrives with the catalogue.
  const [restaurant, setRestaurant] = useState(false);
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void store.reference.business().then((b) => !cancelled && setRestaurant(hasRestaurant(b?.business_type)));
    return () => {
      cancelled = true;
    };
  }, [store, sync.catalogueRevision]);

  // Best effort: refresh the signed entitlement whenever the server is reachable.
  useEffect(() => {
    if (!enrolled) return;
    void session
      .refreshEntitlement()
      .catch(() => undefined)
      .finally(() => void reload());
  }, [enrolled, session, reload]);

  if (!status) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (status.phase === 'unenrolled') return <Redirect href="/setup" />;
  if (status.phase === 'revoked') {
    return <LockedScreen device={status.device} unsynced={sync.counts ? sync.counts.local + sync.counts.pending + sync.counts.needs_review : null} />;
  }

  return (
    <StatusScreen client={client} apiBaseUrl={baseUrl} appVersion={Constants.expoConfig?.version ?? 'dev'}>
      <CashierPanel
        cashier={cashier}
        onSignIn={() => router.push('/sign-in')}
        onSwitch={() => {
          signOut();
          router.push('/sign-in');
        }}
        onSignOut={signOut}
      />
      {restaurant ? <Button label="Orders" onPress={() => router.push('/orders')} disabled={!canStartSale(status.entitlement)} /> : null}
      {restaurant ? <Button label="Kitchen" tone="secondary" onPress={() => router.push('/kitchen')} /> : null}
      <Button label={restaurant ? 'Quick sale' : 'New sale'} tone={restaurant ? 'secondary' : 'primary'} onPress={() => router.push('/checkout')} disabled={!canStartSale(status.entitlement)} />
      <Button label="Shift and cash drawer" tone="secondary" onPress={() => router.push('/shift')} />
      {/* The back office is the web app (apps/web); it opens in the browser. */}
      <Button label="Back office (opens in browser)" tone="secondary" onPress={() => void Linking.openURL(backOfficeUrl())} />
      <DevicePanel device={status.device} entitlement={status.entitlement} />
      <SyncPanel
        counts={sync.counts}
        recent={sync.recent}
        lastRun={sync.lastRun}
        running={sync.running}
        onSyncNow={() => void sync.syncNow(true)}
        onRecordSample={sync.recordSampleSale && can('record_sample_sale') ? () => void sync.recordSampleSale?.() : null}
        onOpenSale={(saleId) => router.push(`/receipt/${saleId}`)}
      />
      {can('printer_settings') ? <Button label="Printer" tone="secondary" onPress={() => router.push('/printer')} /> : null}
      {can('view_diagnostics') ? <Button label="Diagnostics" tone="secondary" onPress={() => router.push('/diagnostics')} /> : null}
    </StatusScreen>
  );
}
