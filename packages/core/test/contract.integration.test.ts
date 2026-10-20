import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, uuidv7 } from '../src';

/**
 * Cross-stack contract check: the shared TypeScript client against a running
 * Laravel API. Skipped unless INKYPOS_API_URL is set, e.g.
 *   php artisan serve --port=8000  &&  INKYPOS_API_URL=http://127.0.0.1:8000 npx vitest run contract
 */
// Read via globalThis so the core keeps no Node type dependency.
const baseUrl = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.INKYPOS_API_URL;

describe.runIf(baseUrl)('contract: TypeScript client <-> Laravel API', () => {
  const client = createApiClient({ baseUrl: baseUrl ?? '', fetch: globalThis.fetch, generateId: () => uuidv7() });

  it('GET /api/v1/health satisfies the shared schema', async () => {
    const health = await client.health();
    expect(health.status).toBe('ok');
    expect(health.api_version).toBe('v1');
  });

  it('unknown endpoints return the shared error envelope', async () => {
    const { z } = await import('zod');
    const err = await client
      .request({ method: 'GET', path: '/does-not-exist', data: z.unknown(), auth: false })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'not_found', status: 404, retryable: false });
  });
});
