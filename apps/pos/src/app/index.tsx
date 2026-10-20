import Constants from 'expo-constants';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DevicePanel } from '@/features/status/DevicePanel';
import { LockedScreen } from '@/features/status/LockedScreen';
import { StatusScreen } from '@/features/status/StatusScreen';
import { createAppApiClient, defaultApiBaseUrl } from '@/services/api';
import { useSession } from '@/services/session-context';
import { Button } from '@/ui/components';

export default function Index() {
  const { session, status, reload } = useSession();
  const router = useRouter();
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
  if (status.phase === 'revoked') return <LockedScreen device={status.device} />;

  return (
    <StatusScreen client={client} apiBaseUrl={baseUrl} appVersion={Constants.expoConfig?.version ?? 'dev'}>
      <DevicePanel device={status.device} entitlement={status.entitlement} />
      <Button label="Diagnostics" tone="secondary" onPress={() => router.push('/diagnostics')} />
    </StatusScreen>
  );
}
