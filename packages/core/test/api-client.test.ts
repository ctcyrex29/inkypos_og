import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, uuidv7 } from '../src';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const meta = { request_id: 'req-1', api_version: 'v1' };
const health = { status: 'ok', service: 'inkypos-api', api_version: 'v1', server_time: '2026-10-20T07:00:00+00:00' };

function client(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createApiClient>[0]> = {}) {
  return createApiClient({ baseUrl: 'http://api.test/', fetch: fetchImpl, generateId: () => uuidv7(), ...extra });
}

describe('api client', () => {
  it('calls the versioned endpoint and validates the envelope', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: health, meta }));
    await expect(client(fetchMock).health()).resolves.toEqual(health);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/health');
    expect((init.headers as Record<string, string>)['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends bearer token, device and idempotency headers when relevant', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: { ok: true }, meta }));
    const { z } = await import('zod');
    await client(fetchMock, { getAccessToken: async () => 'tok', deviceId: () => 'dev-1' }).request({
      method: 'POST',
      path: '/sync/events',
      body: { a: 1 },
      idempotencyKey: 'batch-1',
      data: z.object({ ok: z.boolean() }),
    });
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Idempotency-Key']).toBe('batch-1');
    expect(headers['X-Device-Id']).toBe('dev-1');
  });

  it('maps error envelopes to typed errors', async () => {
    const body = { error: { code: 'device_revoked', message: 'Device revoked' }, meta };
    const err = await client(async () => jsonResponse(403, body)).health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'device_revoked', status: 403, retryable: false, requestId: expect.any(String) });
  });

  it('marks 5xx and network failures as retryable', async () => {
    const e5 = await client(async () => jsonResponse(503, { nope: true })).health().catch((e: unknown) => e);
    expect(e5).toMatchObject({ code: 'contract_violation', retryable: true });
    const offline = await client(async () => {
      throw new TypeError('Failed to fetch');
    })
      .health()
      .catch((e: unknown) => e);
    expect(offline).toMatchObject({ code: 'network_error', retryable: true, status: null });
  });

  it('rejects responses that break the contract', async () => {
    const err = await client(async () => jsonResponse(200, { data: { status: 'degraded' }, meta }))
      .health()
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'contract_violation', retryable: false });
  });

  it('times out slow requests', async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const err = await client(hanging, { timeoutMs: 20 }).health().catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'timeout', retryable: true });
  });
});
