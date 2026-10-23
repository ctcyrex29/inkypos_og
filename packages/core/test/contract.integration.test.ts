import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiError,
  base64UrlEncode,
  buildSampleSale,
  createLocalStore,
  MemoryDriver,
  SyncWorker,
  createApiClient,
  deviceAuthMessage,
  deviceKeyPairFromSeed,
  evaluateEntitlement,
  sign,
  uuidv7,
  verifyEntitlement,
  type TrustedEntitlementKeys,
} from '../src';

/**
 * Cross-stack contract check: the shared TypeScript client against a running
 * Laravel API. Skipped unless INKYPOS_API_URL is set, e.g.
 *   php artisan serve --port=8000
 *   INKYPOS_API_URL=http://127.0.0.1:8000 INKYPOS_ENTITLEMENT_KEYS='{"k1":"…"}' \
 *   INKYPOS_PLATFORM_EMAIL=admin@… INKYPOS_PLATFORM_PASSWORD=… npx vitest run contract
 * New businesses wait for Inkgenius to activate them, so the lifecycle test signs in as
 * an Inkgenius administrator (php artisan inkypos:platform-admin) to do that.
 */
// Read via globalThis so the core keeps no Node type dependency.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const baseUrl = env.INKYPOS_API_URL;
const trustedKeys: TrustedEntitlementKeys = JSON.parse(env.INKYPOS_ENTITLEMENT_KEYS ?? '{}');

function client(token?: () => string | null, tenantId?: string) {
  return createApiClient({
    baseUrl: baseUrl ?? '',
    fetch: globalThis.fetch,
    generateId: () => uuidv7(),
    getAccessToken: async () => token?.() ?? null,
    tenantId: tenantId ? () => tenantId : undefined,
  });
}

const fail = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

/** Activates a newly signed-up business as an Inkgenius administrator (a no-op when sign-ups are active already). */
async function activate(tenantId: string, status: string | undefined) {
  if (status !== 'pending') return;
  const admin = await client().platform.login(env.INKYPOS_PLATFORM_EMAIL ?? '', env.INKYPOS_PLATFORM_PASSWORD ?? '');
  await client(() => admin.access_token).platform.activate(tenantId);
}

describe.runIf(baseUrl)('contract: TypeScript client <-> Laravel API', () => {
  it('GET /api/v1/health satisfies the shared schema', async () => {
    const health = await client().health();
    expect(health.status).toBe('ok');
    expect(health.api_version).toBe('v1');
  });

  it('unknown endpoints return the shared error envelope', async () => {
    const err = await fail(client().request({ method: 'GET', path: '/does-not-exist', data: z.unknown(), auth: false }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'not_found', status: 404, retryable: false });
  });

  it('runs the full device lifecycle against the real server', async () => {
    const suffix = uuidv7().slice(-12);

    // 1. A business signs up; the owner sets up a branch and a register.
    const owner = await client().signup({
      business_name: `Contract ${suffix}`,
      name: 'Owner',
      email: `owner-${suffix}@contract.test`,
      password: 'contract test password',
      device_name: 'contract',
    });
    const tenantId = owner.memberships[0]!.tenant_id;
    const ownerApi = client(() => owner.tokens.access_token, tenantId);
    if (owner.memberships[0]!.tenant_status === 'pending') {
      expect(await fail(ownerApi.listRegisters())).toMatchObject({ code: 'business_pending' });
    }
    await activate(tenantId, owner.memberships[0]!.tenant_status);
    const branch = await ownerApi.createBranch({ name: 'Main', code: 'MAIN' });
    const register = await ownerApi.createRegister(branch.id, { name: 'Till 1', code: 'T1' });

    // 2. The till generates its key (client-side noble) and is registered.
    const keys = deviceKeyPairFromSeed(globalThis.crypto.getRandomValues(new Uint8Array(32)));
    const device = await ownerApi.registerDevice({
      register_id: register.id,
      name: 'Front till',
      platform: 'web',
      public_key: base64UrlEncode(keys.publicKey),
    });
    expect(device.tenant_id).toBe(tenantId);

    // 3. Challenge-response sign-in: client signs, libsodium verifies.
    let deviceToken: string | null = null;
    const deviceApi = client(() => deviceToken);
    const { challenge } = await deviceApi.deviceChallenge(device.id);
    const signature = base64UrlEncode(sign(deviceAuthMessage(device.id, challenge), keys.secretKey));
    const issued = await deviceApi.deviceToken(device.id, challenge, signature);
    deviceToken = issued.access_token;

    // 4. Server signs the entitlement (libsodium); client verifies it (noble) and evaluates it offline.
    const doc = await deviceApi.entitlements();
    if (Object.keys(trustedKeys).length > 0) {
      const payload = verifyEntitlement(doc, trustedKeys);
      expect(payload).toMatchObject({ tenant_id: tenantId, device_id: device.id, status: 'trialing', plan_code: 'starter' });
      expect(
        evaluateEntitlement({ entitlement: payload, tenantId, now: Date.now(), lastTrustedServerTime: Date.parse(issued.server_time) }),
      ).toMatchObject({ mode: 'active' });
    }

    // 4b. Offline sales sync through the real worker, including a lost acknowledgement.
    const store = createLocalStore(new MemoryDriver());
    await store.migrate();
    const saleCtx = { newId: () => uuidv7(), tenantId, branchId: branch.id, registerId: register.id, deviceId: device.id, actorId: device.id };
    for (let i = 0; i < 3; i++) await store.sales.commitSale(buildSampleSale(saleCtx, 3));
    let loseNextAck = true;
    const worker = new SyncWorker({
      store,
      deviceId: () => device.id,
      newId: () => uuidv7(),
      backoff: { baseMs: 1, maxMs: 1 },
      transport: {
        push: async (batchId, deviceId, bodies) => {
          const response = await deviceApi.pushEvents(batchId, deviceId, bodies);
          if (loseNextAck) {
            loseNextAck = false; // the server committed, but the till never hears back
            throw new ApiError('Network error: connection reset', 'network_error', null, 'r', true);
          }
          return response;
        },
      },
    });
    expect(await worker.runOnce()).toMatchObject({ stoppedBy: 'transport' });
    await new Promise((r) => setTimeout(r, 5));
    expect(await worker.runOnce()).toMatchObject({ sent: 3, acknowledged: 3, stoppedBy: 'idle' });
    expect(await store.outbox.countByState()).toEqual({ local: 0, pending: 0, synced: 3, needs_review: 0 });

    // The same event id with altered content is a conflict, never an overwrite.
    const [first] = (await store.sales.listRecent(10)).slice(-1);
    const original = JSON.parse((await store.outbox.get(first!.event_id))!.body);
    original.payload.receipt_number = 'TAMPERED';
    const tampered = await deviceApi.pushEvents(uuidv7(), device.id, [JSON.stringify(original)]);
    expect(tampered.acknowledgements[0]).toMatchObject({ result: 'conflict' });

    // 5. Another business cannot see or touch any of it.
    const other = await client().signup({
      business_name: `Other ${suffix}`,
      name: 'Other',
      email: `other-${suffix}@contract.test`,
      password: 'contract test password',
      device_name: 'contract',
    });
    await activate(other.memberships[0]!.tenant_id, other.memberships[0]!.tenant_status);
    const otherApi = client(() => other.tokens.access_token, other.memberships[0]!.tenant_id);
    expect(await otherApi.listRegisters()).toEqual([]);
    expect(await fail(otherApi.revokeDevice(device.id))).toMatchObject({ code: 'not_found' });
    expect(await fail(client(() => other.tokens.access_token, tenantId).listRegisters())).toMatchObject({ code: 'forbidden' });

    // 6. The owner revokes the till: its token dies and it cannot sign in again.
    await ownerApi.revokeDevice(device.id, 'contract test');
    expect(await fail(deviceApi.entitlements())).toMatchObject({ code: 'unauthenticated' });
    expect(await fail(deviceApi.deviceChallenge(device.id))).toMatchObject({ code: 'device_revoked' });

    // 7. Refresh-token rotation and reuse detection.
    const rotated = await client().refresh(owner.tokens.refresh_token);
    expect(await fail(client().refresh(owner.tokens.refresh_token))).toMatchObject({ code: 'unauthenticated' });
    expect(await fail(client().refresh(rotated.tokens.refresh_token))).toMatchObject({ code: 'unauthenticated' });
  }, 30_000); // many round trips, incl. password sign-ins, to a single-threaded dev server
});
