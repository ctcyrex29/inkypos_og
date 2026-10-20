import { verify } from '../crypto/ed25519';
import { base64UrlDecode, utf8Decode, utf8Encode } from '../encoding/base64url';
import { entitlementPayloadSchema, type EntitlementPayload, type SignedEntitlement } from './contracts';

export class EntitlementError extends Error {
  override readonly name = 'EntitlementError';
}

/** Public keys the app trusts, by key_id. Shipped in app config so verification works offline. */
export type TrustedEntitlementKeys = Readonly<Record<string, string>>;

/**
 * Verifies the signature before parsing anything, so a tampered or
 * foreign document is never interpreted.
 */
export function verifyEntitlement(doc: SignedEntitlement, trustedKeys: TrustedEntitlementKeys): EntitlementPayload {
  const publicKey = trustedKeys[doc.key_id];
  if (!publicKey) throw new EntitlementError(`Unknown entitlement signing key "${doc.key_id}"`);
  const ok = verify(base64UrlDecode(doc.signature), utf8Encode(doc.payload), base64UrlDecode(publicKey));
  if (!ok) throw new EntitlementError('Entitlement signature is invalid');
  let json: unknown;
  try {
    json = JSON.parse(utf8Decode(base64UrlDecode(doc.payload)));
  } catch {
    throw new EntitlementError('Entitlement payload is not valid JSON');
  }
  const parsed = entitlementPayloadSchema.safeParse(json);
  if (!parsed.success) throw new EntitlementError(`Entitlement payload is malformed: ${parsed.error.message}`);
  return parsed.data;
}

export type EntitlementState =
  | { mode: 'active'; warning: 'past_due' | null; validUntil: string }
  | { mode: 'grace'; graceUntil: string }
  | { mode: 'restricted'; reason: 'no_entitlement' | 'subscription_inactive' | 'grace_expired' | 'clock_rollback' | 'wrong_tenant' };

export interface EvaluateInput {
  entitlement: EntitlementPayload | null;
  tenantId: string;
  /** Device clock, ms since epoch. */
  now: number;
  /** Latest server time seen in any authenticated response, ms since epoch. */
  lastTrustedServerTime: number | null;
  /** How far the device clock may lag the last server time before it is treated as rolled back. */
  clockToleranceMs?: number;
}

/**
 * Offline subscription policy (docs/ARCHITECTURE.md §7).
 * active      → sell normally
 * grace       → sell, with a persistent banner
 * restricted  → no new sales; syncing, viewing, reprinting and export stay allowed
 */
export function evaluateEntitlement(input: EvaluateInput): EntitlementState {
  const { entitlement, now } = input;
  const tolerance = input.clockToleranceMs ?? 5 * 60_000;
  if (input.lastTrustedServerTime !== null && now < input.lastTrustedServerTime - tolerance) {
    return { mode: 'restricted', reason: 'clock_rollback' };
  }
  if (!entitlement) return { mode: 'restricted', reason: 'no_entitlement' };
  if (entitlement.tenant_id !== input.tenantId) return { mode: 'restricted', reason: 'wrong_tenant' };
  if (entitlement.status === 'inactive') return { mode: 'restricted', reason: 'subscription_inactive' };
  if (now <= Date.parse(entitlement.valid_until)) {
    return {
      mode: 'active',
      warning: entitlement.status === 'past_due' ? 'past_due' : null,
      validUntil: entitlement.valid_until,
    };
  }
  if (now <= Date.parse(entitlement.grace_until)) return { mode: 'grace', graceUntil: entitlement.grace_until };
  return { mode: 'restricted', reason: 'grace_expired' };
}

/** Restricted mode blocks new sales only. Pending sales must always be able to leave the device. */
export function canStartSale(state: EntitlementState): boolean {
  return state.mode !== 'restricted';
}
