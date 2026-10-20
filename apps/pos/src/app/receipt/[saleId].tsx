import { renderReceiptHtml } from '@inkypos/core';
import { printAsync } from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ReceiptScreen } from '@/features/receipt/ReceiptScreen';
import { useSession } from '@/services/session-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { loadReceipt } from '@/services/till-data';
import { Banner } from '@/ui/components';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadReceipt>>>;

export default function Receipt() {
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const router = useRouter();
  const storeState = useLocalStore();
  const { status } = useSession();
  const sync = useSync();
  const [loaded, setLoaded] = useState<Loaded | null | 'missing'>(null);
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const device = status?.phase === 'ready' || status?.phase === 'revoked' ? status.device : null;

  // Reload when sync finishes so the sync state shown is current.
  useEffect(() => {
    if (!store || !device || !saleId) return;
    void loadReceipt(store, device, saleId).then((r) => setLoaded(r ?? 'missing'));
  }, [store, device, saleId, sync.lastRun]);

  if (loaded === 'missing') {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="danger" title="Sale not found" body="This sale is not on this till." />
      </View>
    );
  }
  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <ReceiptScreen
      receipt={loaded.receipt}
      syncState={loaded.syncState}
      refunds={loaded.refunds}
      onRefund={loaded.refundable && status?.phase === 'ready' ? () => router.push(`/refund/${saleId}`) : null}
      onPrint={(doc) => printAsync({ html: renderReceiptHtml(doc, 'Receipt') })}
      onNewSale={() => router.replace('/checkout')}
      onDone={() => router.replace('/')}
    />
  );
}
