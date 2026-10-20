import { ActivityIndicator, View } from 'react-native';
import { DiagnosticsScreen } from '@/features/diagnostics/DiagnosticsScreen';
import { storageHarness } from '@/platform/storage';
import { newId } from '@/services/api';
import { useLocalStore } from '@/services/store-context';
import { Banner } from '@/ui/components';

export default function Diagnostics() {
  const state = useLocalStore();
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
