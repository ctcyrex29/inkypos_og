import { describe, expect, it } from 'vitest';
import {
  base64UrlDecode,
  base64UrlEncode,
  canStartSale,
  deviceAuthMessage,
  deviceKeyPairFromSeed,
  EntitlementError,
  evaluateEntitlement,
  sign,
  utf8Encode,
  uuidv7,
  verify,
  verifyEntitlement,
  type EntitlementPayload,
} from '../src';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('base64url', () => {
  it('round-trips every length and uses the URL-safe alphabet', () => {
    for (let n = 0; n < 70; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
      expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
    }
    expect(base64UrlEncode(Uint8Array.from([0xfb, 0xff]))).toBe('-_8');
  });

  it('rejects invalid input', () => {
    expect(() => base64UrlDecode('ab+c')).toThrow(/character/);
    expect(() => base64UrlDecode('abcde')).toThrow(/length/);
  });
});

describe('ed25519', () => {
  it('matches RFC 8032 test vector 1', () => {
    const keys = deviceKeyPairFromSeed(hex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'));
    expect(toHex(keys.publicKey)).toBe('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
    const signature = sign(new Uint8Array(), keys.secretKey);
    expect(toHex(signature)).toBe(
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
    );
    expect(verify(signature, new Uint8Array(), keys.publicKey)).toBe(true);
    expect(verify(signature, Uint8Array.of(1), keys.publicKey)).toBe(false);
  });

  // apps/api/tests/Unit/DeviceAuthVectorTest.php verifies this file with libsodium.
  it('produces the shared device-auth vector', async () => {
    const keys = deviceKeyPairFromSeed(new Uint8Array(32).fill(7));
    const deviceId = '019a0000-0000-7000-8000-00000000d001';
    const challenge = base64UrlEncode(new Uint8Array(32).fill(9));
    const signature = sign(deviceAuthMessage(deviceId, challenge), keys.secretKey);
    const vector = {
      device_id: deviceId,
      challenge,
      message: `inkypos-device-auth:v1:${deviceId}:${challenge}`,
      public_key: base64UrlEncode(keys.publicKey),
      signature: base64UrlEncode(signature),
    };
    await expect(`${JSON.stringify(vector, null, 2)}\n`).toMatchFileSnapshot('../test-vectors/device-auth.v1.json');
  });
});

describe('entitlements', () => {
  const server = deviceKeyPairFromSeed(new Uint8Array(32).fill(1));
  const trusted = { 'k-test': base64UrlEncode(server.publicKey) };
  const tenantId = uuidv7();
  const payload: EntitlementPayload = {
    v: 1,
    tenant_id: tenantId,
    device_id: null,
    plan_code: 'starter',
    status: 'active',
    features: ['offline_sales'],
    limits: { max_branches: 1, max_registers: 2 },
    issued_at: '2026-10-20T08:00:00+00:00',
    valid_until: '2026-10-23T08:00:00+00:00',
    grace_until: '2026-10-30T08:00:00+00:00',
  };

  function signDoc(p: unknown, keyId = 'k-test') {
    const encoded = base64UrlEncode(utf8Encode(JSON.stringify(p)));
    return { payload: encoded, signature: base64UrlEncode(sign(utf8Encode(encoded), server.secretKey)), key_id: keyId };
  }

  it('verifies a signed document', () => {
    expect(verifyEntitlement(signDoc(payload), trusted)).toEqual(payload);
  });

  it('rejects tampering, unknown keys and malformed payloads', () => {
    const doc = signDoc(payload);
    const forged = base64UrlEncode(utf8Encode(JSON.stringify({ ...payload, status: 'active', plan_code: 'enterprise' })));
    expect(() => verifyEntitlement({ ...doc, payload: forged }, trusted)).toThrow(EntitlementError);
    expect(() => verifyEntitlement(signDoc(payload, 'other'), trusted)).toThrow(/Unknown/);
    expect(() => verifyEntitlement(signDoc({ v: 2 }), trusted)).toThrow(/malformed/);
  });

  const at = (iso: string) => Date.parse(iso);
  const base = { entitlement: payload, tenantId, lastTrustedServerTime: at('2026-10-20T08:00:00Z') };

  it('moves active -> grace -> restricted as time passes offline', () => {
    expect(evaluateEntitlement({ ...base, now: at('2026-10-22T00:00:00Z') }).mode).toBe('active');
    expect(evaluateEntitlement({ ...base, now: at('2026-10-25T00:00:00Z') })).toEqual({
      mode: 'grace',
      graceUntil: payload.grace_until,
    });
    const late = evaluateEntitlement({ ...base, now: at('2026-11-01T00:00:00Z') });
    expect(late).toEqual({ mode: 'restricted', reason: 'grace_expired' });
    expect(canStartSale(late)).toBe(false);
  });

  it('treats a clock set back before the last server time as restricted', () => {
    expect(evaluateEntitlement({ ...base, now: at('2026-10-19T00:00:00Z') })).toEqual({
      mode: 'restricted',
      reason: 'clock_rollback',
    });
    // small skew is tolerated
    expect(evaluateEntitlement({ ...base, now: at('2026-10-20T07:58:00Z') }).mode).toBe('active');
  });

  it('restricts inactive subscriptions, foreign tenants and missing documents', () => {
    const now = at('2026-10-21T00:00:00Z');
    expect(evaluateEntitlement({ ...base, now, entitlement: { ...payload, status: 'inactive' } })).toMatchObject({
      reason: 'subscription_inactive',
    });
    expect(evaluateEntitlement({ ...base, now, tenantId: uuidv7() })).toMatchObject({ reason: 'wrong_tenant' });
    expect(evaluateEntitlement({ ...base, now, entitlement: null })).toMatchObject({ reason: 'no_entitlement' });
  });

  it('keeps selling but warns when payment is past due', () => {
    const state = evaluateEntitlement({ ...base, now: at('2026-10-21T00:00:00Z'), entitlement: { ...payload, status: 'past_due' } });
    expect(state).toMatchObject({ mode: 'active', warning: 'past_due' });
    expect(canStartSale(state)).toBe(true);
  });
});
