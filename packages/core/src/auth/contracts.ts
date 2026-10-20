import { z } from 'zod';

/** Phase 2 wire contracts. The Laravel side lives in apps/api/app/Http/Controllers/Api/V1. */

const id = z.uuid({ version: 'v7' });
const timestamp = z.iso.datetime({ offset: true });

export const roleSchema = z.enum(['owner', 'manager', 'cashier']);
export type Role = z.infer<typeof roleSchema>;

export const platformSchema = z.enum(['android', 'ios', 'web', 'windows', 'macos']);

export const userSchema = z.object({ id, name: z.string(), email: z.email() });
export const membershipSchema = z.object({ tenant_id: id, tenant_name: z.string(), role: roleSchema });

export const tokenPairSchema = z.object({
  access_token: z.string().min(20),
  access_expires_at: timestamp,
  refresh_token: z.string().min(20),
  refresh_expires_at: timestamp,
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const signupRequestSchema = z.object({
  business_name: z.string().min(2).max(120),
  name: z.string().min(1).max(120),
  email: z.email(),
  password: z.string().min(10).max(200),
  device_name: z.string().min(1).max(100),
});
export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  device_name: z.string().min(1).max(100),
});

export const sessionSchema = z.object({
  user: userSchema,
  memberships: z.array(membershipSchema),
  tokens: tokenPairSchema,
});
export type Session = z.infer<typeof sessionSchema>;

export const meSchema = z.object({ user: userSchema, memberships: z.array(membershipSchema) });
export const refreshResponseSchema = z.object({ tokens: tokenPairSchema });
export const logoutResponseSchema = z.object({ revoked: z.literal(true) });

export const branchSchema = z.object({ id, name: z.string(), code: z.string() });
export const registerSchema = z.object({
  id,
  branch_id: id,
  name: z.string(),
  code: z.string(),
  active_device_id: id.nullable(),
});
export type Branch = z.infer<typeof branchSchema>;
export type Register = z.infer<typeof registerSchema>;

export const deviceSchema = z.object({
  id,
  tenant_id: id,
  branch_id: id,
  register_id: id,
  name: z.string(),
  platform: platformSchema,
  registered_at: timestamp,
  last_seen_at: timestamp.nullable(),
  revoked_at: timestamp.nullable(),
});
export type Device = z.infer<typeof deviceSchema>;

export const registerDeviceRequestSchema = z.object({
  register_id: id,
  name: z.string().min(1).max(100),
  platform: platformSchema,
  /** base64url, 32-byte Ed25519 public key. */
  public_key: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const deviceChallengeSchema = z.object({ challenge: z.string().min(40), expires_at: timestamp });

export const deviceTokenSchema = z.object({
  access_token: z.string().min(20),
  access_expires_at: timestamp,
  device: deviceSchema,
  server_time: timestamp,
});
export type DeviceToken = z.infer<typeof deviceTokenSchema>;

/** Signed document: `payload` is base64url JSON; `signature` is Ed25519 over the payload string's bytes. */
export const signedEntitlementSchema = z.object({
  payload: z.string().min(1),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  key_id: z.string().min(1),
});
export type SignedEntitlement = z.infer<typeof signedEntitlementSchema>;

export const entitlementStatusSchema = z.enum(['trialing', 'active', 'past_due', 'inactive']);

export const entitlementPayloadSchema = z.object({
  v: z.literal(1),
  tenant_id: id,
  device_id: id.nullable(),
  plan_code: z.string(),
  status: entitlementStatusSchema,
  features: z.array(z.string()),
  limits: z.object({ max_branches: z.int().positive(), max_registers: z.int().positive() }),
  issued_at: timestamp,
  valid_until: timestamp,
  grace_until: timestamp,
});
export type EntitlementPayload = z.infer<typeof entitlementPayloadSchema>;
