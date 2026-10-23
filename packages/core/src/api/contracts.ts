import { z } from 'zod';

export const API_VERSION = 'v1' as const;
export const API_PREFIX = `/api/${API_VERSION}`;

export const responseMetaSchema = z.object({
  request_id: z.string().min(1),
  api_version: z.literal(API_VERSION),
});

/** Every successful response: `{ data, meta }`. */
export function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: responseMetaSchema });
}

export const apiErrorCodeSchema = z.enum([
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'conflict',
  'idempotency_key_reused',
  'device_revoked',
  'subscription_inactive',
  'plan_limit_reached',
  'rate_limited',
  'payload_too_large',
  'server_error',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Every error response: `{ error, meta }`. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
  meta: responseMetaSchema,
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('inkypos-api'),
  api_version: z.literal(API_VERSION),
  server_time: z.iso.datetime({ offset: true }),
});
export type Health = z.infer<typeof healthSchema>;

/** Request headers shared by client and server. */
export const HEADERS = {
  requestId: 'X-Request-Id',
  idempotencyKey: 'Idempotency-Key',
  deviceId: 'X-Device-Id',
  tenantId: 'X-Tenant-Id',
  clientVersion: 'X-Client-Version',
} as const;

/**
 * Endpoint catalogue. `phase` marks when each endpoint is built; phases 1–2 exist on the server.
 * `auth`: none | user (user token) | device (device token) | tenant (either, scoped to a tenant) | manager (owner/manager user).
 */
export const ENDPOINTS = {
  health: { method: 'GET', path: '/health', auth: 'none', phase: 1 },
  signup: { method: 'POST', path: '/auth/signup', auth: 'none', phase: 2 },
  login: { method: 'POST', path: '/auth/login', auth: 'none', phase: 2 },
  refresh: { method: 'POST', path: '/auth/refresh', auth: 'none', phase: 2 },
  logout: { method: 'POST', path: '/auth/logout', auth: 'user', phase: 2 },
  me: { method: 'GET', path: '/me', auth: 'user', phase: 2 },
  deviceChallenge: { method: 'POST', path: '/auth/device/challenge', auth: 'none', phase: 2 },
  deviceToken: { method: 'POST', path: '/auth/device/token', auth: 'none', phase: 2 },
  listBranches: { method: 'GET', path: '/branches', auth: 'tenant', phase: 2 },
  createBranch: { method: 'POST', path: '/branches', auth: 'manager', phase: 2 },
  listRegisters: { method: 'GET', path: '/registers', auth: 'tenant', phase: 2 },
  createRegister: { method: 'POST', path: '/branches/{branch}/registers', auth: 'manager', phase: 2 },
  listDevices: { method: 'GET', path: '/devices', auth: 'manager', phase: 2 },
  registerDevice: { method: 'POST', path: '/devices', auth: 'manager', phase: 2 },
  revokeDevice: { method: 'DELETE', path: '/devices/{device}', auth: 'manager', phase: 2 },
  entitlements: { method: 'GET', path: '/entitlements', auth: 'tenant', phase: 2 },
  syncPush: { method: 'POST', path: '/sync/events', auth: 'device', phase: 4 },
  syncPull: { method: 'GET', path: '/sync/changes', auth: 'device', phase: 4 },
  listStaff: { method: 'GET', path: '/staff', auth: 'manager', phase: 5 },
  updateStaff: { method: 'PATCH', path: '/staff/{user}', auth: 'manager', phase: 5 },
  setStaffPin: { method: 'PUT', path: '/staff/{user}/pin', auth: 'manager', phase: 5 },
  clearStaffPin: { method: 'DELETE', path: '/staff/{user}/pin', auth: 'manager', phase: 5 },
  conflicts: { method: 'GET', path: '/conflicts', auth: 'manager', phase: 6 },
  resolveConflict: { method: 'POST', path: '/conflicts/{conflict}/resolution', auth: 'manager', phase: 6 },
} as const;
