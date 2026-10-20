import { ApiError, createApiClient, uuidv7, type ApiClient } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { StatusScreen } from './StatusScreen';

const health = {
  status: 'ok' as const,
  service: 'inkypos-api' as const,
  api_version: 'v1' as const,
  server_time: '2026-10-20T07:00:00+00:00',
};

function fakeClient(health: () => Promise<Awaited<ReturnType<ApiClient['health']>>>): ApiClient {
  const real = createApiClient({ baseUrl: 'http://x', fetch: globalThis.fetch, generateId: () => uuidv7() });
  return { ...real, health };
}

describe('StatusScreen', () => {
  it('shows the API as online with server details', async () => {
    await render(<StatusScreen client={fakeClient(async () => health)} apiBaseUrl="http://api.test" appVersion="0.1.0" />);
    expect(await screen.findByText('API online')).toBeOnTheScreen();
    expect(screen.getByText('2026-10-20T07:00:00+00:00')).toBeOnTheScreen();
    expect(screen.getByText('http://api.test')).toBeOnTheScreen();
  });

  it('shows a typed offline error and recovers on recheck', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const client = fakeClient(async () => {
      calls++;
      if (calls === 1) throw new ApiError('Network error: Failed to fetch', 'network_error', null, 'r1', true);
      return health;
    });
    await render(<StatusScreen client={client} apiBaseUrl="http://api.test" appVersion="0.1.0" />);
    expect(await screen.findByText('API unreachable')).toBeOnTheScreen();
    expect(screen.getByText('network_error')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('API online')).toBeOnTheScreen();
    expect(calls).toBe(2);
  });
});
