import { buildTestPage, type PrinterSettings, type ReceiptDocument } from '@inkypos/core';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { PrinterScreen } from '@/features/printing/PrinterScreen';
import { useCashier } from '@/services/cashier-context';
import { loadPrinterSettings, printDocument, rawBtAvailable, savePrinterSettings } from '@/services/printer';
import { useLocalStore } from '@/services/store-context';
import { Banner } from '@/ui/components';

type Width = ReceiptDocument['widthChars'];

export default function Printer() {
  const storeState = useLocalStore();
  const { can } = useCashier();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const [loaded, setLoaded] = useState<{ settings: PrinterSettings; width: Width } | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void Promise.all([loadPrinterSettings(store), store.settings.get('receipt_width')]).then(([settings, stored]) => {
      const width = Number(stored ?? 42);
      if (!cancelled) setLoaded({ settings, width: ([32, 42, 48].includes(width) ? width : 42) as Width });
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  if (!can('printer_settings')) {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="warning" title="Manager sign-in required" body="Printer settings are for owners and managers." />
      </View>
    );
  }
  if (!store || !loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <PrinterScreen
      settings={loaded.settings}
      width={loaded.width}
      rawBtAvailable={rawBtAvailable()}
      onSave={async (settings, width) => {
        await savePrinterSettings(store, settings);
        await store.settings.set('receipt_width', String(width));
        setLoaded({ settings, width });
      }}
      onTestPrint={async (target, width) => {
        const page = buildTestPage(width, target, new Date().toLocaleString());
        // Print with the choice on screen, even before it is saved.
        await printDocument(store, 'receipt', page, 'Test print', undefined, { receipt: target });
      }}
    />
  );
}
