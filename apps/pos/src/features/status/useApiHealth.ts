import { ApiError, type ApiClient, type Health } from '@inkypos/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export type HealthState =
  | { kind: 'checking' }
  | { kind: 'online'; health: Health; latencyMs: number }
  | { kind: 'offline'; message: string; code: string };

export function useApiHealth(client: ApiClient) {
  const [state, setState] = useState<HealthState>({ kind: 'checking' });
  const mounted = useRef(true);

  const check = useCallback(async () => {
    setState({ kind: 'checking' });
    const started = Date.now();
    try {
      const health = await client.health();
      if (mounted.current) setState({ kind: 'online', health, latencyMs: Date.now() - started });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'unknown';
      const message = e instanceof Error ? e.message : String(e);
      if (mounted.current) setState({ kind: 'offline', message, code });
    }
  }, [client]);

  useEffect(() => {
    mounted.current = true;
    void check();
    return () => {
      mounted.current = false;
    };
  }, [check]);

  return { state, recheck: check };
}
