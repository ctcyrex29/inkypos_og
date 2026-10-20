import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createDevicePorts } from '@/platform/device';
import { createAppApiClient, defaultApiBaseUrl, trustedEntitlementKeys } from './api';
import { DeviceSession, type SessionStatus } from './device-session';

interface SessionContextValue {
  session: DeviceSession;
  status: SessionStatus | null;
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useMemo(() => {
    const baseUrl = defaultApiBaseUrl();
    return new DeviceSession({
      ...createDevicePorts(),
      createClient: (auth) => createAppApiClient(baseUrl, auth),
      trustedKeys: trustedEntitlementKeys(),
    });
  }, []);
  const [status, setStatus] = useState<SessionStatus | null>(null);

  const reload = useCallback(async () => setStatus(await session.status()), [session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <SessionContext.Provider value={{ session, status, reload }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
