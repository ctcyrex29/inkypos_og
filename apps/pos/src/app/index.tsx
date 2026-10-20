import Constants from 'expo-constants';
import { useMemo } from 'react';
import { StatusScreen } from '@/features/status/StatusScreen';
import { createAppApiClient, defaultApiBaseUrl } from '@/services/api';

export default function Index() {
  const baseUrl = defaultApiBaseUrl();
  const client = useMemo(() => createAppApiClient(baseUrl), [baseUrl]);
  return <StatusScreen client={client} apiBaseUrl={baseUrl} appVersion={Constants.expoConfig?.version ?? 'dev'} />;
}
