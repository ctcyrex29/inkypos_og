import type { z } from 'zod';
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
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Generates request IDs; inject a CSPRNG-backed UUIDv7 generator. */
  generateId: () => string;
  getAccessToken?: () => Promise<string | null>;
  clientVersion?: string;
  deviceId?: () => string | null;
  timeoutMs?: number;
}

export interface RequestOptions<T extends z.ZodType> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  data: T;
  body?: unknown;
  idempotencyKey?: string;
  auth?: boolean;
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
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (req.idempotencyKey) headers[HEADERS.idempotencyKey] = req.idempotencyKey;
    if (options.clientVersion) headers[HEADERS.clientVersion] = options.clientVersion;
    const deviceId = options.deviceId?.();
    if (deviceId) headers[HEADERS.deviceId] = deviceId;
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
        body: req.body === undefined ? null : JSON.stringify(req.body),
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
        throw new ApiError(message, code, response.status, serverRequestId, isRetryableStatus(response.status), details);
      }
      throw new ApiError(
        `Unexpected error body (HTTP ${response.status})`,
        'contract_violation',
        response.status,
        serverRequestId,
        isRetryableStatus(response.status),
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

  return {
    request,
    health: (): Promise<Health> => request({ method: 'GET', path: '/health', data: healthSchema, auth: false }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
