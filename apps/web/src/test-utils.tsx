import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import { AuthProvider, type BusinessSession } from './auth/session';

const meta = { request_id: 'r', api_version: 'v1' };
export const id = (n: number) => `01a16873-0000-7000-8000-${String(n).padStart(12, '0')}`;
export const later = new Date(Date.now() + 3600_000).toISOString();

export type Call = { url: string; method: string; body: unknown };
type Route = (url: string, init: RequestInit) => { status?: number; body: unknown } | undefined;

/** A fake InkyPOS API: each route answers the requests it matches; everything else gets an empty list. */
export function serve(...routes: Route[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
    for (const route of routes) {
      const hit = route(url, init);
      if (hit) {
        const failed = hit.status !== undefined && hit.status >= 400;
        return new Response(JSON.stringify({ ...(failed ? (hit.body as object) : { data: hit.body }), meta }), { status: hit.status ?? 200 });
      }
    }
    return new Response(JSON.stringify({ data: [], meta }), { status: 200 });
  });
  return calls;
}

/** Answers requests whose URL contains `path` (and, if given, use `method`). */
export const on =
  (path: string, body: unknown, method?: string, status?: number): Route =>
  (url, init) =>
    url.includes(path) && (!method || (init.method ?? 'GET') === method) ? { body, status } : undefined;

/** Renders the app at `path`, already signed in to a business as a manager. */
export function startAsManager(path: string, businessType: BusinessSession['businessType'] = 'retail') {
  const session: BusinessSession = {
    kind: 'business',
    accessToken: 'a'.repeat(40),
    accessExpiresAt: later,
    refreshToken: 'r'.repeat(40),
    tenantId: id(2),
    businessName: 'Kwa Mai',
    businessType,
    userName: 'Rudo Moyo',
  };
  sessionStorage.setItem('inkypos.web.session', JSON.stringify(session));
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}
