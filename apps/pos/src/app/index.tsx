import Constants from 'expo-constants';
import { canStartSale } from '@inkypos/core';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DevicePanel } from '@/features/status/DevicePanel';
import { LockedScreen } from '@/features/status/LockedScreen';
import { StatusScreen } from '@/features/status/StatusScreen';
import { SyncPanel } from '@/features/sync/SyncPanel';
import { createAppApiClient, defaultApiBaseUrl } from '@/services/api';
import { useSession } from '@/services/session-context';
import { useSync } from '@/services/sync-context';
import { Button } from '@/ui/components';

export default function Index() {
  const { session, status, reload } = useSession();
  const router = useRouter();
  const sync = useSync();
  const baseUrl = defaultApiBaseUrl();
  const client = useMemo(() => createAppApiClient(baseUrl), [baseUrl]);
  const enrolled = status?.phase === 'ready';

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
      <Button label="New sale" onPress={() => router.push('/checkout')} disabled={!canStartSale(status.entitlement)} />
      <Button label="Shift and cash drawer" tone="secondary" onPress={() => router.push('/shift')} />
      <Button label="Back office" tone="secondary" onPress={() => router.push('/admin')} />
      <DevicePanel device={status.device} entitlement={status.entitlement} />
      <SyncPanel
        counts={sync.counts}
        recent={sync.recent}
        lastRun={sync.lastRun}
        running={sync.running}
        onSyncNow={() => void sync.syncNow(true)}
        onRecordSample={sync.recordSampleSale ? () => void sync.recordSampleSale?.() : null}
        onOpenSale={(saleId) => router.push(`/receipt/${saleId}`)}
      />
      <Button label="Diagnostics" tone="secondary" onPress={() => router.push('/diagnostics')} />
    </StatusScreen>
  );
}
