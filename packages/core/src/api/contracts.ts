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
  'rate_limited',
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
  clientVersion: 'X-Client-Version',
} as const;

/**
 * Endpoint catalogue. `phase` marks when each endpoint is built; only phase 1
 * endpoints exist on the server today.
 */
export const ENDPOINTS = {
  health: { method: 'GET', path: '/health', auth: false, phase: 1 },
  login: { method: 'POST', path: '/auth/login', auth: false, phase: 2 },
  refresh: { method: 'POST', path: '/auth/refresh', auth: false, phase: 2 },
  logout: { method: 'POST', path: '/auth/logout', auth: true, phase: 2 },
  me: { method: 'GET', path: '/me', auth: true, phase: 2 },
  registerDevice: { method: 'POST', path: '/devices', auth: true, phase: 2 },
  revokeDevice: { method: 'DELETE', path: '/devices/{device}', auth: true, phase: 2 },
  entitlements: { method: 'GET', path: '/entitlements', auth: true, phase: 2 },
  syncPush: { method: 'POST', path: '/sync/events', auth: true, phase: 4 },
  syncPull: { method: 'GET', path: '/sync/changes', auth: true, phase: 4 },
  conflicts: { method: 'GET', path: '/conflicts', auth: true, phase: 6 },
  resolveConflict: { method: 'POST', path: '/conflicts/{conflict}/resolution', auth: true, phase: 6 },
} as const;
