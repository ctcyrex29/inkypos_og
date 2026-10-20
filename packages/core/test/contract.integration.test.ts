import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiError,
  base64UrlEncode,
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
 *   INKYPOS_API_URL=http://127.0.0.1:8000 INKYPOS_ENTITLEMENT_KEYS='{"k1":"…"}' npx vitest run contract
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

    // 5. Another business cannot see or touch any of it.
    const other = await client().signup({
      business_name: `Other ${suffix}`,
      name: 'Other',
      email: `other-${suffix}@contract.test`,
      password: 'contract test password',
      device_name: 'contract',
    });
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
  });
});
