import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { DevicePanel } from '@/features/status/DevicePanel';
import { StatusScreen } from '@/features/status/StatusScreen';
import { SyncPanel } from '@/features/sync/SyncPanel';
import { createAppApiClient, defaultApiBaseUrl } from '@/services/api';
import { useCashier } from '@/services/cashier-context';
import { useSession } from '@/services/session-context';
import { useSync } from '@/services/sync-context';
import { Screen } from '@/ui/components';

/** Everything about getting sales to the server, in one place and out of the cashier's way. */
export default function Sync() {
  const router = useRouter();
  const sync = useSync();
  const { status } = useSession();
  const { can } = useCashier();
  const baseUrl = defaultApiBaseUrl();
  const client = useMemo(() => createAppApiClient(baseUrl), [baseUrl]);

  return (
    <Screen>
      <SyncPanel
        counts={sync.counts}
        recent={sync.recent}
        lastRun={sync.lastRun}
        running={sync.running}
        onSyncNow={() => void sync.syncNow(true)}
        onRecordSample={sync.recordSampleSale && can('record_sample_sale') ? () => void sync.recordSampleSale?.() : null}
        onOpenSale={(saleId) => router.push(`/receipt/${saleId}`)}
      />
      {status?.phase === 'ready' ? <DevicePanel device={status.device} entitlement={status.entitlement} /> : null}
      <StatusScreen client={client} apiBaseUrl={baseUrl} appVersion={Constants.expoConfig?.version ?? 'dev'} />
    </Screen>
  );
}
