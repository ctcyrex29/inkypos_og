import { ApiError, type ApiClient, type Health } from '@inkypos/core';
import { useCallback, useEffect, useState } from 'react';

export type HealthState =
  | { kind: 'checking' }
  | { kind: 'online'; health: Health; latencyMs: number }
  | { kind: 'offline'; message: string; code: string };

async function probe(client: ApiClient): Promise<HealthState> {
  const started = Date.now();
  try {
    const health = await client.health();
    return { kind: 'online', health, latencyMs: Date.now() - started };
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'unknown';
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'offline', message, code };
  }
}

export function useApiHealth(client: ApiClient) {
  const [state, setState] = useState<HealthState>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    void probe(client).then((next) => !cancelled && setState(next));
    return () => {
      cancelled = true;
    };
  }, [client]);

  const recheck = useCallback(async () => {
    setState({ kind: 'checking' });
    setState(await probe(client));
  }, [client]);

  return { state, recheck };
}
