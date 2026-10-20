import { ActivityIndicator, View } from 'react-native';
import { DiagnosticsScreen } from '@/features/diagnostics/DiagnosticsScreen';
import { storageHarness } from '@/platform/storage';
import { newId } from '@/services/api';
import { useCashier } from '@/services/cashier-context';
import { useLocalStore } from '@/services/store-context';
import { Banner } from '@/ui/components';

export default function Diagnostics() {
  const state = useLocalStore();
  const { cashier, can } = useCashier();
  if (!can('view_diagnostics')) {
    return (
      <View style={{ padding: 24 }}>
        <Banner
          tone="warning"
          title="Manager sign-in required"
          body={cashier ? 'Diagnostics are for owners and managers. Switch cashier to continue.' : 'Sign in as an owner or manager to open diagnostics.'}
        />
      </View>
    );
  }
  if (state.phase === 'opening') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (state.phase === 'failed') {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="danger" title="Local database could not open" body={state.message} />
      </View>
    );
  }
  return <DiagnosticsScreen store={state.store} makeHarness={storageHarness} newId={newId} />;
}
