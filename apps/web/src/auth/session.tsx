import type { ApiClient, BusinessType, PlatformUser, Session } from '@inkypos/core';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeClient } from '@/lib/api';

/**
 * Who is signed in to the web app: a business manager (back office) or a
 * member of Inkgenius Technologies staff (platform portal). Kept in
 * sessionStorage, so it survives a page reload but ends with the browser tab.
 */
export interface BusinessSession {
  kind: 'business';
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  tenantId: string;
  businessName: string;
  businessType: BusinessType;
  userName: string;
  /** Signed in with a temporary password: the back office stays closed until it is replaced. */
  mustChangePassword?: boolean;
}

export interface PlatformSessionState {
  kind: 'platform';
  accessToken: string;
  accessExpiresAt: string;
  user: PlatformUser;
}

export type WebSession = BusinessSession | PlatformSessionState;

type Membership = Session['memberships'][number];

export type BusinessSignIn =
  | { kind: 'signed_in' }
  | { kind: 'choose'; memberships: Membership[]; session: Session }
  | { kind: 'refused'; message: string };

const STORAGE_KEY = 'inkypos.web.session';

function load(): WebSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WebSession) : null;
  } catch {
    return null;
  }
}

function store(session: WebSession | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows may refuse storage; the session then lasts until reload.
  }
}

/** Why a membership cannot open the back office, or null when it can. */
export function refusal(m: Membership): string | null {
  if (m.role !== 'manager') return 'Only managers can use the back office. Cashiers sign in on the till with their PIN.';
  if (m.active === false) return 'Your access to this business has been switched off. Ask another manager.';
  if (m.tenant_status === 'pending') return 'Your business is waiting for Inkgenius Technologies to activate it. We will be in touch soon.';
  if (m.tenant_status === 'suspended') return 'This business is suspended. Please contact Inkgenius Technologies support.';
  return null;
}

interface AuthState {
  session: WebSession | null;
  /** Authenticated client for the current session (business or platform). */
  client: ApiClient;
  signInBusiness: (email: string, password: string) => Promise<BusinessSignIn>;
  chooseBusiness: (session: Session, tenantId: string) => void;
  /** `code`: from the authenticator app; without it the server may answer two_factor_required. */
  signInPlatform: (email: string, password: string, code?: string) => Promise<void>;
  /** Sets a new password for whoever is signed in; their other sessions end. */
  changePassword: (currentPassword: string, password: string) => Promise<void>;
  /** After an authenticator change (or anything else that updates the signed-in staff member). */
  setPlatformUser: (user: PlatformUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WebSession | null>(load);
  const current = useRef(session);
  current.current = session;
  const refreshing = useRef<Promise<string | null> | null>(null);

  const update = useCallback((next: WebSession | null) => {
    current.current = next;
    store(next);
    setSession(next);
  }, []);

  const anonymous = useMemo(() => makeClient(), []);

  // Business access tokens last 15 minutes: refresh shortly before they expire, once at a time.
  const token = useCallback(async (): Promise<string | null> => {
    const s = current.current;
    if (!s) return null;
    if (s.kind === 'platform' || Date.parse(s.accessExpiresAt) - Date.now() > 60_000) return s.accessToken;
    refreshing.current ??= anonymous
      .refresh(s.refreshToken)
      .then(({ tokens }) => {
        const latest = current.current;
        if (latest?.kind !== 'business') return null;
        update({ ...latest, accessToken: tokens.access_token, accessExpiresAt: tokens.access_expires_at, refreshToken: tokens.refresh_token });
        return tokens.access_token;
      })
      .catch(() => {
        update(null);
        return null;
      })
      .finally(() => {
        refreshing.current = null;
      });
    return refreshing.current;
  }, [anonymous, update]);

  const client = useMemo(
    () => makeClient({ token, tenantId: () => (current.current?.kind === 'business' ? current.current.tenantId : null) }),
    [token],
  );

  const chooseBusiness = useCallback(
    (s: Session, tenantId: string) => {
      const m = s.memberships.find((x) => x.tenant_id === tenantId);
      if (!m) return;
      update({
        kind: 'business',
        accessToken: s.tokens.access_token,
        accessExpiresAt: s.tokens.access_expires_at,
        refreshToken: s.tokens.refresh_token,
        tenantId,
        businessName: m.tenant_name,
        businessType: m.business_type ?? 'retail',
        userName: s.user.name,
        mustChangePassword: s.user.must_change_password,
      });
    },
    [update],
  );

  const signInBusiness = useCallback(
    async (email: string, password: string): Promise<BusinessSignIn> => {
      const s = await anonymous.login({ email, password, device_name: 'Web back office' });
      const usable = s.memberships.filter((m) => refusal(m) === null);
      if (usable.length === 0) {
        const first = s.memberships[0];
        return { kind: 'refused', message: first ? refusal(first)! : 'This account is not part of any business yet.' };
      }
      if (usable.length > 1) return { kind: 'choose', memberships: usable, session: s };
      chooseBusiness(s, usable[0]!.tenant_id);
      return { kind: 'signed_in' };
    },
    [anonymous, chooseBusiness],
  );

  const signInPlatform = useCallback(
    async (email: string, password: string, code?: string) => {
      const s = await anonymous.platform.login(email, password, code);
      update({ kind: 'platform', accessToken: s.access_token, accessExpiresAt: s.access_expires_at, user: s.user });
    },
    [anonymous, update],
  );

  const setPlatformUser = useCallback(
    (user: PlatformUser) => {
      const s = current.current;
      if (s?.kind === 'platform') update({ ...s, user });
    },
    [update],
  );

  const changePassword = useCallback(
    async (currentPassword: string, password: string) => {
      const s = current.current;
      if (s?.kind === 'platform') {
        setPlatformUser(await client.platform.changePassword(currentPassword, password));
      } else if (s?.kind === 'business') {
        await client.changePassword(currentPassword, password);
        const latest = current.current;
        if (latest?.kind === 'business') update({ ...latest, mustChangePassword: false });
      }
    },
    [client, setPlatformUser, update],
  );

  const signOut = useCallback(() => {
    const s = current.current;
    if (s) void (s.kind === 'platform' ? client.platform.logout() : client.logout()).catch(() => undefined);
    update(null);
  }, [client, update]);

  return <AuthContext.Provider value={{ session, client, signInBusiness, chooseBusiness, signInPlatform, changePassword, setPlatformUser, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

export function useBusinessSession(): BusinessSession {
  const { session } = useAuth();
  if (session?.kind !== 'business') throw new Error('Not signed in to a business');
  return session;
}

export function usePlatformSession(): PlatformSessionState {
  const { session } = useAuth();
  if (session?.kind !== 'platform') throw new Error('Not signed in as Inkgenius staff');
  return session;
}
