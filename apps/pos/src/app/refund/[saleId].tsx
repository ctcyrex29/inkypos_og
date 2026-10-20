import { buildRefund, buildVoid, type PaymentMethodInfo, type RefundIssuedPayload, type SaleCompletedPayload } from '@inkypos/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { RefundScreen } from '@/features/refund/RefundScreen';
import { newId } from '@/services/api';
import { useSession } from '@/services/session-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { commitRefund, refundContext } from '@/services/till-data';
import { Banner } from '@/ui/components';

type Loaded = { sale: SaleCompletedPayload; previous: RefundIssuedPayload[]; methods: PaymentMethodInfo[] };

export default function Refund() {
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const router = useRouter();
  const storeState = useLocalStore();
  const { status } = useSession();
  const sync = useSync();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const device = status?.phase === 'ready' ? status.device : null;
  const [loaded, setLoaded] = useState<Loaded | 'missing' | null>(null);

  useEffect(() => {
    if (!store || !saleId) return;
    let cancelled = false;
    void (async () => {
      const sale = await store.sales.get(saleId);
      if (!sale) return !cancelled && setLoaded('missing');
      const [previous, all] = await Promise.all([store.refunds.forSale(saleId), store.reference.paymentMethods()]);
      // Cash first: refunds normally go out of the drawer.
      const methods = [...all.filter((m) => m.gives_change), ...all.filter((m) => !m.gives_change)].filter((m) => m.currencies.includes(sale.sale.currency));
      if (!cancelled) setLoaded({ sale: sale.sale, previous, methods });
    })();
    return () => {
      cancelled = true;
    };
  }, [store, saleId]);

  if (loaded === 'missing') {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="danger" title="Sale not on this till" body="Refunds are made on the till that made the sale." />
      </View>
    );
  }
  if (!loaded || !store || !device) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const done = async (event: Parameters<typeof commitRefund>[2]) => {
    await commitRefund(store, device, event);
    void sync.syncNow();
    router.replace(`/receipt/${loaded.sale.sale_id}`);
  };

  return (
    <RefundScreen
      sale={loaded.sale}
      previous={loaded.previous}
      payoutMethods={loaded.methods}
      newId={newId}
      onRefund={(selections, reason, payoutCode, note) =>
        done(buildRefund(loaded.sale, loaded.previous, selections, { ...refundContext(device), payoutMethodCode: payoutCode, reason, ...(note ? { note } : {}) }))
      }
      onVoid={(payoutCode, note) => done(buildVoid(loaded.sale, loaded.previous, { ...refundContext(device), payoutMethodCode: payoutCode, ...(note ? { note } : {}) }))}
    />
  );
}
