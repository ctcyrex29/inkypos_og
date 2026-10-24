import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import { AuthProvider } from './auth/session';

const meta = { request_id: 'r', api_version: 'v1' };
const id = (n: number) => `01a16873-0000-7000-8000-${String(n).padStart(12, '0')}`;
const later = new Date(Date.now() + 3600_000).toISOString();
const tokens = { access_token: 'a'.repeat(40), access_expires_at: later, refresh_token: 'r'.repeat(40), refresh_expires_at: later };

type Route = (url: string, init: RequestInit) => { status?: number; body: unknown } | undefined;

/** A fake InkyPOS API: each test lists the answers it needs. */
function serve(...routes: Route[]) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
    for (const route of routes) {
      const hit = route(url, init);
      if (hit) return new Response(JSON.stringify({ ...(hit.status && hit.status >= 400 ? hit.body as object : { data: hit.body }), meta }), { status: hit.status ?? 200 });
    }
    return new Response(JSON.stringify({ data: [], meta }), { status: 200 });
  });
  return calls;
}

const on = (path: string, body: unknown, status?: number): Route => (url) => (url.includes(path) ? { body, status } : undefined);

function session(membership: Record<string, unknown>) {
  return {
    user: { id: id(1), name: 'Rudo Moyo', email: 'rudo@shop.test' },
    memberships: [{ tenant_id: id(2), tenant_name: 'Kwa Mai', role: 'manager', tenant_status: 'active', business_type: 'both', active: true, ...membership }],
    tokens,
  };
}

async function start(path: string) {
  sessionStorage.clear();
  const view = render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
  // Pages are lazy-loaded: wait until the page itself is on screen.
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull());
  return view;
}

afterEach(() => vi.unstubAllGlobals());

describe('business sign-in', () => {
  it('opens the back office with the values the browser actually holds (autofill-safe)', async () => {
    const calls = serve(on('/auth/login', session({})), on('/reports/sales', null, 404));
    await start('/login');
    // Like a password manager: values set on the inputs without typing.
    (screen.getByLabelText('Email') as HTMLInputElement).value = 'rudo@shop.test';
    (screen.getByLabelText('Password') as HTMLInputElement).value = 'long enough pass';
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/Good day, Rudo/)).toBeInTheDocument();
    expect(calls[0]!.body).toMatchObject({ email: 'rudo@shop.test', password: 'long enough pass' });
  });

  it('says what is missing instead of doing nothing', async () => {
    serve();
    await start('/login');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email and password.')).toBeInTheDocument();
  });

  it('explains a business that is waiting for activation, and cashiers', async () => {
    serve(on('/auth/login', session({ tenant_status: 'pending' })));
    await start('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'rudo@shop.test');
    await userEvent.type(screen.getByLabelText('Password'), 'long enough pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/waiting for Inkgenius Technologies to activate it/)).toBeInTheDocument();

    serve(on('/auth/login', session({ role: 'cashier' })));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Cashiers sign in on the till with their PIN/)).toBeInTheDocument();
  });

  it('shows a wrong password plainly', async () => {
    serve(on('/auth/login', { error: { code: 'unauthenticated', message: 'Invalid email or password.' } }, 401));
    await start('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'rudo@shop.test');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
  });
});

describe('Inkgenius portal', () => {
  const staff = (role: string, permissions: string[]) => ({
    user: { id: id(9), name: 'Tariro', email: 't@inkgenius.test', role, role_label: role, active: true, last_login_at: null, permissions },
    access_token: 'p'.repeat(40),
    access_expires_at: later,
  });

  it('signs staff in and only shows the team page to administrators', async () => {
    serve(on('/platform/auth/login', staff('support', ['businesses.view', 'businesses.support', 'audit.view'])), on('/platform/businesses', []));
    await start('/inkgenius/login');
    await userEvent.type(screen.getByLabelText('Work email'), 't@inkgenius.test');
    await userEvent.type(screen.getByLabelText('Password'), 'long enough pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Welcome, Tariro')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Businesses/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Inkgenius team/ })).toBeNull();
  });

  it('lets Accounts activate a waiting business from the overview', async () => {
    const pending = { id: id(3), name: 'Mbare Hardware', status: 'pending', status_reason: null, business_type: 'retail', created_at: later, activated_at: null, subscription: null };
    const calls = serve(
      on('/platform/auth/login', staff('accounts', ['businesses.view', 'businesses.activate', 'subscriptions.manage', 'businesses.create'])),
      on('/activate', { ...pending, status: 'active' }),
      on('/platform/businesses', [pending]),
    );
    await start('/inkgenius/login');
    await userEvent.type(screen.getByLabelText('Work email'), 't@inkgenius.test');
    await userEvent.type(screen.getByLabelText('Password'), 'long enough pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    expect(await screen.findByText(/Mbare Hardware is active/)).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.url.endsWith(`/platform/businesses/${id(3)}/activate`))).toBe(true));
  });

  it('sends people who are not signed in to the right sign-in page', async () => {
    serve();
    await start('/inkgenius/businesses');
    expect(screen.getByText('Inkgenius staff sign-in')).toBeInTheDocument();
    await start('/app/staff');
    expect(screen.getByText('Sign in to your business')).toBeInTheDocument();
  });
});

describe('account security', () => {
  const staff = (extra: Record<string, unknown> = {}) => ({
    id: id(9), name: 'Tariro', email: 't@inkgenius.test', role: 'support', role_label: 'Support', active: true, last_login_at: null,
    permissions: ['businesses.view'], two_factor_enabled: true, setup_required: null, ...extra,
  });

  it('makes a manager replace a temporary password before the back office opens', async () => {
    const temporary = session({});
    const calls = serve(
      on('/auth/login', { ...temporary, user: { ...temporary.user, must_change_password: true } }),
      on('/me/password', { user: { ...temporary.user, must_change_password: false }, memberships: temporary.memberships }),
    );
    await start('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'rudo@shop.test');
    await userEvent.type(screen.getByLabelText('Password'), 'Temporary123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Choose your own password')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Products/ })).toBeNull();
    await userEvent.type(screen.getByLabelText('Temporary password'), 'Temporary123456');
    await userEvent.type(screen.getByLabelText('New password'), 'my own long password');
    await userEvent.type(screen.getByLabelText('New password again'), 'my own long passwrd');
    await userEvent.click(screen.getByRole('button', { name: 'Save my new password' }));
    expect(await screen.findByText('The two new passwords do not match.')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('New password again'));
    await userEvent.type(screen.getByLabelText('New password again'), 'my own long password');
    await userEvent.click(screen.getByRole('button', { name: 'Save my new password' }));
    expect((await screen.findAllByRole('link', { name: /Products/ })).length).toBeGreaterThan(0);
    expect(calls.find((c) => c.url.endsWith('/me/password'))!.body).toEqual({ current_password: 'Temporary123456', password: 'my own long password' });
  });

  it('asks Inkgenius staff for their authenticator code after the password', async () => {
    const calls = serve((url, init) => {
      if (!url.includes('/platform/auth/login')) return undefined;
      const body = JSON.parse(String(init.body)) as { code?: string };
      return body.code
        ? { body: { user: staff(), access_token: 'p'.repeat(40), access_expires_at: later } }
        : { status: 401, body: { error: { code: 'two_factor_required', message: 'Enter the 6-digit code from your authenticator app.' } } };
    });
    await start('/inkgenius/login');
    await userEvent.type(screen.getByLabelText('Work email'), 't@inkgenius.test');
    await userEvent.type(screen.getByLabelText('Password'), 'long enough pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await userEvent.type(await screen.findByLabelText('Code from your authenticator app'), '123 456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Welcome, Tariro')).toBeInTheDocument();
    expect(calls.at(-2)!.body).toMatchObject({ email: 't@inkgenius.test', code: '123456' });
  });

  it('walks new Inkgenius staff through setting up an authenticator', async () => {
    const calls = serve(
      on('/platform/auth/login', { user: staff({ two_factor_enabled: false, setup_required: 'two_factor_setup_required' }), access_token: 'p'.repeat(40), access_expires_at: later }),
      on('/two-factor/confirm', staff()),
      on('/platform/me/two-factor', { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauth_url: 'otpauth://totp/InkyPOS:t%40inkgenius.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' }),
    );
    await start('/inkgenius/login');
    await userEvent.type(screen.getByLabelText('Work email'), 't@inkgenius.test');
    await userEvent.type(screen.getByLabelText('Password'), 'long enough pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Set up authenticator codes')).toBeInTheDocument();
    expect(await screen.findByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Code from the app'), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on authenticator codes' }));
    expect(await screen.findByText('Welcome, Tariro')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/two-factor/confirm'))!.body).toEqual({ code: '654321' });
  });
});
