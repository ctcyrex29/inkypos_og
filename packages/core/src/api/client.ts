import { z } from 'zod';
import {
  branchSchema,
  deviceChallengeSchema,
  deviceSchema,
  deviceTokenSchema,
  logoutResponseSchema,
  meSchema,
  refreshResponseSchema,
  registerSchema,
  sessionSchema,
  signedEntitlementSchema,
  type loginRequestSchema,
  type registerDeviceRequestSchema,
  type signupRequestSchema,
} from '../auth/contracts';
import { syncPullResponseSchema, syncPushResponseSchema } from '../sync/events';
import { exchangeRateDataSchema, paymentMethodDataSchema, productDataSchema, type Unit } from '../catalogue/contracts';

/** Fields a manager sets on a product (server assigns id and version). */
export interface ProductInput {
  sku: string;
  name: string;
  unit_price_minor: number;
  unit?: Unit;
  tax_code: string;
  tax_rate_bp: number;
  tax_inclusive?: boolean;
  active?: boolean;
  barcodes?: string[];
}
import { API_PREFIX, envelopeSchema, errorEnvelopeSchema, HEADERS, healthSchema, type ApiErrorCode, type Health } from './contracts';

export type ClientErrorCode = ApiErrorCode | 'network_error' | 'timeout' | 'contract_violation';

export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    message: string,
    readonly code: ClientErrorCode,
    readonly status: number | null,
    readonly requestId: string,
    readonly retryable: boolean,
    readonly details?: Record<string, string[]>,
    /** From a Retry-After header on 429/503 responses. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Generates request IDs; inject a CSPRNG-backed UUIDv7 generator. */
  generateId: () => string;
  getAccessToken?: (() => Promise<string | null>) | undefined;
  clientVersion?: string;
  deviceId?: () => string | null;
  /** Tenant for user-token requests; device tokens are bound to their tenant server-side. */
  tenantId?: (() => string | null) | undefined;
  timeoutMs?: number;
}

export interface RequestOptions<T extends z.ZodType> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  data: T;
  body?: unknown;
  /** Pre-serialized JSON sent byte for byte (sync events keep their stored bytes). */
  rawBody?: string;
  idempotencyKey?: string;
  auth?: boolean;
}

/** Retry-After is either delta-seconds or an HTTP date. */
function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T extends z.ZodType>(req: RequestOptions<T>): Promise<z.infer<T>> {
    const requestId = options.generateId();
    const headers: Record<string, string> = { Accept: 'application/json', [HEADERS.requestId]: requestId };
    const body = req.rawBody ?? (req.body === undefined ? null : JSON.stringify(req.body));
    if (body !== null) headers['Content-Type'] = 'application/json';
    if (req.idempotencyKey) headers[HEADERS.idempotencyKey] = req.idempotencyKey;
    if (options.clientVersion) headers[HEADERS.clientVersion] = options.clientVersion;
    const deviceId = options.deviceId?.();
    if (deviceId) headers[HEADERS.deviceId] = deviceId;
    const tenantId = options.tenantId?.();
    if (tenantId) headers[HEADERS.tenantId] = tenantId;
    if (req.auth !== false && options.getAccessToken) {
      const token = await options.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await options.fetch(`${baseUrl}${API_PREFIX}${req.path}`, {
        method: req.method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (e) {
      const timedOut = controller.signal.aborted;
      throw new ApiError(
        timedOut ? `Request timed out after ${timeoutMs}ms` : `Network error: ${(e as Error).message}`,
        timedOut ? 'timeout' : 'network_error',
        null,
        requestId,
        true,
      );
    } finally {
      clearTimeout(timer);
    }

    const serverRequestId = response.headers.get(HEADERS.requestId) ?? requestId;
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApiError(
        `Expected JSON from server (HTTP ${response.status})`,
        response.ok ? 'contract_violation' : 'server_error',
        response.status,
        serverRequestId,
        isRetryableStatus(response.status),
      );
    }

    if (!response.ok) {
      const parsed = errorEnvelopeSchema.safeParse(json);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiError(message, code, response.status, serverRequestId, isRetryableStatus(response.status), details, retryAfterMs(response));
      }
      throw new ApiError(
        `Unexpected error body (HTTP ${response.status})`,
        'contract_violation',
        response.status,
        serverRequestId,
        isRetryableStatus(response.status),
        undefined,
        retryAfterMs(response),
      );
    }

    const parsed = envelopeSchema(req.data).safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        `Response did not match contract: ${parsed.error.message}`,
        'contract_violation',
        response.status,
        serverRequestId,
        false,
      );
    }
    return (parsed.data as { data: z.infer<T> }).data;
  }

  const open = { auth: false } as const;

  return {
    request,
    health: (): Promise<Health> => request({ method: 'GET', path: '/health', data: healthSchema, ...open }),

    signup: (body: z.input<typeof signupRequestSchema>) =>
      request({ method: 'POST', path: '/auth/signup', body, data: sessionSchema, ...open }),
    login: (body: z.input<typeof loginRequestSchema>) =>
      request({ method: 'POST', path: '/auth/login', body, data: sessionSchema, ...open }),
    refresh: (refreshToken: string) =>
      request({ method: 'POST', path: '/auth/refresh', body: { refresh_token: refreshToken }, data: refreshResponseSchema, ...open }),
    logout: () => request({ method: 'POST', path: '/auth/logout', data: logoutResponseSchema }),
    me: () => request({ method: 'GET', path: '/me', data: meSchema }),

    deviceChallenge: (deviceId: string) =>
      request({ method: 'POST', path: '/auth/device/challenge', body: { device_id: deviceId }, data: deviceChallengeSchema, ...open }),
    deviceToken: (deviceId: string, challenge: string, signature: string) =>
      request({
        method: 'POST',
        path: '/auth/device/token',
        body: { device_id: deviceId, challenge, signature },
        data: deviceTokenSchema,
        ...open,
      }),

    listBranches: () => request({ method: 'GET', path: '/branches', data: z.array(branchSchema) }),
    createBranch: (body: { name: string; code: string }) =>
      request({ method: 'POST', path: '/branches', body, data: branchSchema }),
    listRegisters: () => request({ method: 'GET', path: '/registers', data: z.array(registerSchema) }),
    createRegister: (branchId: string, body: { name: string; code: string }) =>
      request({ method: 'POST', path: `/branches/${encodeURIComponent(branchId)}/registers`, body, data: registerSchema }),

    listDevices: () => request({ method: 'GET', path: '/devices', data: z.array(deviceSchema) }),
    registerDevice: (body: z.input<typeof registerDeviceRequestSchema>) =>
      request({ method: 'POST', path: '/devices', body, data: deviceSchema }),
    revokeDevice: (deviceId: string, reason?: string) =>
      request({
        method: 'DELETE',
        path: `/devices/${encodeURIComponent(deviceId)}`,
        body: reason ? { reason } : undefined,
        data: deviceSchema,
      }),

    entitlements: () => request({ method: 'GET', path: '/entitlements', data: signedEntitlementSchema }),

    /**
     * Uploads outbox events using their stored bytes, so a retry is byte-identical
     * to the first attempt. The batch id doubles as the Idempotency-Key.
     */
    // ── Back office (manager token + tenant header) ──
    listProducts: (search = '') =>
      request({ method: 'GET', path: `/products?search=${encodeURIComponent(search)}`, data: z.array(productDataSchema) }),
    createProduct: (body: ProductInput) => request({ method: 'POST', path: '/products', body, data: productDataSchema }),
    updateProduct: (productId: string, body: Partial<ProductInput>) =>
      request({ method: 'PATCH', path: `/products/${encodeURIComponent(productId)}`, body, data: productDataSchema }),
    listPaymentMethods: () => request({ method: 'GET', path: '/payment-methods', data: z.array(paymentMethodDataSchema) }),
    updatePaymentMethod: (id: string, body: { active?: boolean; name?: string }) =>
      request({ method: 'PATCH', path: `/payment-methods/${encodeURIComponent(id)}`, body, data: paymentMethodDataSchema }),
    listExchangeRates: () => request({ method: 'GET', path: '/exchange-rates', data: z.array(exchangeRateDataSchema) }),
    setExchangeRate: (quoteCurrency: string, rate: string) =>
      request({ method: 'POST', path: '/exchange-rates', body: { quote_currency: quoteCurrency, rate }, data: exchangeRateDataSchema }),

    /** One page of reference data after `cursor` ('' to start with a full snapshot). */
    pullChanges: (cursor: string, limit = 200) =>
      request({
        method: 'GET',
        path: `/sync/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}`,
        data: syncPullResponseSchema,
      }),

    pushEvents: (batchId: string, deviceId: string, eventBodies: string[]) =>
      request({
        method: 'POST',
        path: '/sync/events',
        rawBody: `{"batch_id":${JSON.stringify(batchId)},"device_id":${JSON.stringify(deviceId)},"events":[${eventBodies.join(',')}]}`,
        idempotencyKey: batchId,
        data: syncPushResponseSchema,
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
