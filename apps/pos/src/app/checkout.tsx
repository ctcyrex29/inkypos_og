import { canStartSale } from '@inkypos/core';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { CheckoutScreen, type CheckoutServices } from '@/features/checkout/CheckoutScreen';
import { newId } from '@/services/api';
import { useSession } from '@/services/session-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { completeSale, loadCheckoutData } from '@/services/till-data';
import { Banner } from '@/ui/components';

type Data = NonNullable<Awaited<ReturnType<typeof loadCheckoutData>>>;

export default function Checkout() {
  const router = useRouter();
  const storeState = useLocalStore();
  const { status } = useSession();
  const sync = useSync();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const device = status?.phase === 'ready' ? status.device : null;
  const [data, setData] = useState<Data | null | 'missing'>(null);

  useEffect(() => {
    if (!store) return;
    void loadCheckoutData(store).then((d) => setData(d ?? 'missing'));
  }, [store, sync.catalogueRevision]);

  const services = useMemo<CheckoutServices | null>(() => {
    if (!store || !device || !data || data === 'missing') return null;
    return {
      business: data.business,
      paymentMethods: data.paymentMethods,
      rateFor: (quote) => data.rates.get(quote) ?? null,
      findByBarcode: (code) => store.catalogue.findByBarcode(code),
      search: (text) => store.catalogue.search(text, 8),
      newId,
      complete: async (cart) => {
        const saleId = await completeSale(store, device, cart);
        void sync.syncNow();
        return saleId;
      },
      cameraAvailable: Platform.OS !== 'web',
    };
  }, [store, device, data, sync]);

  if (status?.phase === 'ready' && !canStartSale(status.entitlement)) {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="danger" title="Selling is paused" body="See the main screen for the reason. Sales already made still sync." />
      </View>
    );
  }
  if (data === 'missing') {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="warning" title="Catalogue not downloaded yet" body="Connect to the internet and tap Sync now on the main screen." />
      </View>
    );
  }
  if (!services) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <CheckoutScreen services={services} onCompleted={(saleId) => router.replace(`/receipt/${saleId}`)} />;
}
