import {
  base64UrlDecode,
  base64UrlEncode,
  createApiClient,
  deviceAuthMessage,
  deviceKeyPairFromSeed,
  sign,
  utf8Encode,
  uuidv7,
  verify,
  type SecretKey,
  type SecureStore,
} from '@inkypos/core';
import { SeedSigner } from '@/platform/device-signer';
import { DeviceSession, type ClientAuth } from './device-session';

const T0 = Date.parse('2026-10-20T08:00:00Z');
const HOUR = 3_600_000;

class MemoryVault implements SecureStore {
  readonly hardwareBacked = false;
  readonly data = new Map<SecretKey, string>();
  async get(k: SecretKey) {
    return this.data.get(k) ?? null;
  }
  async set(k: SecretKey, v: string) {
    this.data.set(k, v);
  }
  async delete(k: SecretKey) {
    this.data.delete(k);
  }
}

/** Just enough of the Laravel API to drive the device lifecycle, with real signature checks. */
function fakeServer(clock: { now: number }) {
  const serverKey = deviceKeyPairFromSeed(new Uint8Array(32).fill(3));
  const state = {
    tenantId: uuidv7(),
    registerId: uuidv7(),
    branchId: uuidv7(),
    device: null as null | { id: string; publicKey: string; revoked: boolean },
    challenges: new Set<string>(),
    deviceTokens: new Set<string>(),
    managerLoggedOut: false,
    subscription: 'active' as 'active' | 'inactive',
    tamper: false,
    calls: [] as string[],
  };
  const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
  const ok = (data: unknown, status = 200) =>
    new Response(JSON.stringify({ data, meta: { request_id: 'r', api_version: 'v1' } }), { status });
  const err = (status: number, code: string) =>
    new Response(JSON.stringify({ error: { code, message: code }, meta: { request_id: 'r', api_version: 'v1' } }), { status });

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const path = String(input).replace('http://api.test/api/v1', '');
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const auth = (init?.headers as Record<string, string>).Authorization ?? '';
    state.calls.push(`${init?.method} ${path}`);

    switch (`${init?.method} ${path}`) {
      case 'POST /auth/login':
        return ok({
          user: { id: uuidv7(), name: 'Manager', email: 'm@shop.test' },
          memberships: [{ tenant_id: state.tenantId, tenant_name: 'Shop', role: 'manager' }],
          tokens: { access_token: 'manager-token-0123456789', access_expires_at: iso(clock.now + HOUR), refresh_token: 'refresh-0123456789abcdef', refresh_expires_at: iso(clock.now + 30 * 24 * HOUR) },
        });
      case 'GET /registers':
        return ok([{ id: state.registerId, branch_id: state.branchId, name: 'Till 1', code: 'T1', active_device_id: null }]);
      case 'POST /devices':
        if (auth !== 'Bearer manager-token-0123456789') return err(401, 'unauthenticated');
        state.device = { id: uuidv7(), publicKey: body.public_key, revoked: false };
        return ok(deviceJson(), 201);
      case 'POST /auth/logout':
        state.managerLoggedOut = true;
        return ok({ revoked: true });
      case 'POST /auth/device/challenge': {
        if (state.device?.revoked) return err(403, 'device_revoked');
        const challenge = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
        state.challenges.add(challenge);
        return ok({ challenge, expires_at: iso(clock.now + 120_000) });
      }
      case 'POST /auth/device/token': {
        const valid =
          state.device &&
          state.challenges.delete(body.challenge) &&
          verify(base64UrlDecode(body.signature), deviceAuthMessage(body.device_id, body.challenge), base64UrlDecode(state.device.publicKey));
        if (!valid) return err(401, 'unauthenticated');
        const token = `device-token-${uuidv7()}`;
        state.deviceTokens.add(token);
        return ok({ access_token: token, access_expires_at: iso(clock.now + HOUR), device: deviceJson(), server_time: iso(clock.now) });
      }
      case 'POST /sync/events': {
        if (state.device?.revoked) return err(403, 'device_revoked');
        if (!state.deviceTokens.has(auth.replace('Bearer ', ''))) return err(401, 'unauthenticated');
        const acknowledgements = (body.events as { event_id: string }[]).map((e) => ({ event_id: e.event_id, result: 'accepted', server_sequence: 1 }));
        return ok({ batch_id: body.batch_id, server_time: iso(clock.now), acknowledgements });
      }
      case 'GET /entitlements': {
        if (!state.deviceTokens.has(auth.replace('Bearer ', ''))) return err(401, 'unauthenticated');
        const payload = {
          v: 1,
          tenant_id: state.tenantId,
          device_id: state.device!.id,
          plan_code: 'starter',
          status: state.subscription,
          features: ['offline_sales'],
          limits: { max_branches: 1, max_registers: 2 },
          issued_at: iso(clock.now),
          valid_until: iso(clock.now + 72 * HOUR),
          grace_until: iso(clock.now + (72 + 7 * 24) * HOUR),
        };
        const encoded = base64UrlEncode(utf8Encode(JSON.stringify(payload)));
        const signature = base64UrlEncode(sign(utf8Encode(encoded), serverKey.secretKey));
        return ok({ payload: state.tamper ? encoded.slice(0, -2) + 'AA' : encoded, signature, key_id: 'k1' });
      }
    }
    return err(404, 'not_found');
  };

  function deviceJson() {
    return {
      id: state.device!.id,
      tenant_id: state.tenantId,
      branch_id: state.branchId,
      register_id: state.registerId,
      name: 'Front till',
      platform: 'android',
      registered_at: iso(T0),
      last_seen_at: null,
      revoked_at: state.device!.revoked ? iso(clock.now) : null,
    };
  }

  return { fetch, state, trustedKeys: { k1: base64UrlEncode(serverKey.publicKey) } };
}

function setup() {
  const clock = { now: T0 };
  const server = fakeServer(clock);
  const vault = new MemoryVault();
  let n = 0;
  const signer = new SeedSigner(vault, (len) => new Uint8Array(len).fill(++n));
  const createClient = (auth: ClientAuth) =>
    createApiClient({
      baseUrl: 'http://api.test',
      fetch: server.fetch,
      generateId: () => uuidv7(),
      getAccessToken: async () => auth.token(),
      tenantId: auth.tenantId,
    });
  const session = new DeviceSession({ createClient, vault, signer, trustedKeys: server.trustedKeys, now: () => clock.now });
  return { clock, server, vault, session };
}

async function enrolled() {
  const ctx = setup();
  const manager = await ctx.session.signInManager('m@shop.test', 'pw', 'Front till');
  const [register] = await ctx.session.listRegisters(manager, manager.tenants[0]!.id);
  await ctx.session.enroll(manager, { tenantId: manager.tenants[0]!.id, registerId: register!.id, name: 'Front till', platform: 'android' });
  return ctx;
}

describe('DeviceSession', () => {
  it('starts unenrolled', async () => {
    expect(await setup().session.status()).toEqual({ phase: 'unenrolled' });
  });

  it('enrols with a fresh key, drops the manager session and fetches a verified entitlement', async () => {
    const { session, server, vault } = await enrolled();

    expect(server.state.managerLoggedOut).toBe(true);
    expect(vault.data.has('auth.access_token')).toBe(false);
    expect(server.state.device?.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const status = await session.status();
    expect(status).toMatchObject({ phase: 'ready', entitlement: { mode: 'active' }, plan: { plan_code: 'starter' } });
  });

  it('keeps selling offline through grace, then restricts', async () => {
    const { session, clock } = await enrolled();

    clock.now = T0 + 80 * HOUR;
    expect((await session.status()).phase === 'ready' && (await session.status() as { entitlement: { mode: string } }).entitlement.mode).toBe('grace');

    clock.now = T0 + 300 * HOUR;
    expect(await session.status()).toMatchObject({ entitlement: { mode: 'restricted', reason: 'grace_expired' } });
  });

  it('detects the device clock being wound back', async () => {
    const { session, clock } = await enrolled();
    clock.now = T0 - 24 * HOUR;
    expect(await session.status()).toMatchObject({ entitlement: { mode: 'restricted', reason: 'clock_rollback' } });
  });

  it('ignores a locally tampered entitlement', async () => {
    const { session, vault } = await enrolled();
    const doc = JSON.parse(vault.data.get('device.entitlement')!);
    vault.data.set('device.entitlement', JSON.stringify({ ...doc, payload: doc.payload.slice(0, -2) + 'AA' }));

    expect(await session.status()).toMatchObject({ entitlement: { mode: 'restricted', reason: 'no_entitlement' } });
  });

  it('refuses a forged document from the network and keeps the good one', async () => {
    const { session, server, vault } = await enrolled();
    const before = vault.data.get('device.entitlement');
    server.state.tamper = true;

    await expect(session.refreshEntitlement()).rejects.toThrow(/signature/);
    expect(vault.data.get('device.entitlement')).toBe(before);
  });

  it('signs in again when its token has been invalidated', async () => {
    const { session, server } = await enrolled();
    server.state.deviceTokens.clear();

    await expect(session.refreshEntitlement()).resolves.toMatchObject({ status: 'active' });
    expect(server.state.calls.filter((c) => c === 'POST /auth/device/token')).toHaveLength(2);
  });

  it('locks the till when the server reports the device revoked', async () => {
    const { session, server } = await enrolled();
    server.state.device!.revoked = true;
    server.state.deviceTokens.clear();

    await expect(session.refreshEntitlement()).rejects.toMatchObject({ code: 'device_revoked' });
    expect(await session.status()).toMatchObject({ phase: 'revoked' });
  });

  it('uploads events as the device, signing in again when the token has expired', async () => {
    const { session, server } = await enrolled();
    server.state.deviceTokens.clear();
    const eventId = uuidv7();

    const response = await session.pushEvents(uuidv7(), (await session.deviceId())!, [JSON.stringify({ event_id: eventId })]);

    expect(response.acknowledgements).toEqual([{ event_id: eventId, result: 'accepted', server_sequence: 1 }]);
    expect(server.state.calls.filter((c) => c === 'POST /sync/events')).toHaveLength(2);
  });

  it('locks the till when it is revoked during sync', async () => {
    const { session, server } = await enrolled();
    server.state.device!.revoked = true;

    await expect(session.pushEvents(uuidv7(), (await session.deviceId())!, ['{}'])).rejects.toMatchObject({ code: 'device_revoked' });
    expect(await session.status()).toMatchObject({ phase: 'revoked' });
  });

  it('reports a cancelled subscription as restricted', async () => {
    const { session, server } = await enrolled();
    server.state.subscription = 'inactive';
    await session.refreshEntitlement();

    expect(await session.status()).toMatchObject({ entitlement: { mode: 'restricted', reason: 'subscription_inactive' } });
  });
});
