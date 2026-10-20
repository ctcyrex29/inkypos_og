import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { syncEventSchema, syncPushRequestSchema, syncPushResponseSchema, uuidv7 } from '../src';
import { ids, saleEvent } from './fixtures';

function issues(value: unknown): string[] {
  const result = syncEventSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('sale.completed event', () => {
  it('accepts a consistent sale', () => {
    expect(issues(saleEvent())).toEqual([]);
  });

  it('rejects a line total that does not match the shared pricing rule', () => {
    const e = saleEvent();
    e.payload.lines[0]!.line_total_minor += 1;
    expect(issues(e).join('\n')).toMatch(/lines\.0\.line_total_minor: line total should be 240/);
  });

  it('rejects totals that do not add up', () => {
    const e = saleEvent();
    e.payload.totals.total_minor = 1;
    expect(issues(e).join('\n')).toMatch(/totals\.total_minor/);
  });

  it('rejects underpayment and ignores failed payments when settling', () => {
    const e = saleEvent();
    e.payload.payments[0]!.status = 'failed';
    expect(issues(e).join('\n')).toMatch(/tendered \(0\)/);
  });

  it('accepts split tender across currencies with an exchange rate', () => {
    const e = saleEvent();
    e.payload.change_minor = 0;
    e.payload.payments = [
      {
        payment_id: uuidv7(),
        method_code: 'cash',
        status: 'recorded',
        currency: 'USD',
        amount_minor: 200,
        sale_currency_amount_minor: 200,
      },
      {
        payment_id: uuidv7(),
        method_code: 'ecocash',
        status: 'pending_confirmation',
        currency: 'ZWG',
        amount_minor: 3_500,
        sale_currency_amount_minor: 130,
        exchange_rate: '0.03714286',
        exchange_rate_version: 88,
      },
    ];
    expect(issues(e)).toEqual([]);
  });

  it('requires an exchange rate for a foreign-currency payment', () => {
    const e = saleEvent();
    e.payload.payments[0]!.currency = 'ZWG';
    expect(issues(e).join('\n')).toMatch(/exchange_rate is required/);
  });

  it('requires stock movements that mirror the sold quantities', () => {
    const e = saleEvent();
    e.payload.stock_movements.pop();
    expect(issues(e).join('\n')).toMatch(new RegExp(`stock movements for ${ids.milk} must total -1000`));
  });

  it('requires aggregate_id to match the sale', () => {
    const e = saleEvent();
    e.aggregate_id = uuidv7();
    expect(issues(e).join('\n')).toMatch(/aggregate_id must match/);
  });

  it('rejects non-v7 identifiers and unknown currencies', () => {
    const e = saleEvent() as unknown as { event_id: string; payload: { currency: string } };
    e.event_id = '3f1c9f1e-0d1f-4b5a-9c1d-2a3b4c5d6e7f';
    e.payload.currency = 'XXX';
    const found = issues(e).join('\n');
    expect(found).toMatch(/event_id/);
    expect(found).toMatch(/payload\.currency/);
  });

  it('rejects unknown event types and schema versions', () => {
    expect(issues({ ...saleEvent(), event_type: 'sale.deleted' }).length).toBeGreaterThan(0);
    expect(issues({ ...saleEvent(), schema_version: 2 }).length).toBeGreaterThan(0);
  });
});

describe('push batch', () => {
  it('accepts increasing device sequences from one device', () => {
    const batch = { batch_id: uuidv7(), device_id: ids.device, events: [saleEvent(1), saleEvent(2)] };
    expect(syncPushRequestSchema.safeParse(batch).success).toBe(true);
  });

  it('rejects out-of-order sequences and foreign devices', () => {
    const foreign = { ...saleEvent(3), device_id: uuidv7() };
    const batch = { batch_id: uuidv7(), device_id: ids.device, events: [saleEvent(2), saleEvent(1), foreign] };
    const result = syncPushRequestSchema.safeParse(batch);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toContain('device_sequence must increase');
    expect(messages).toContain('event device_id must match batch device_id');
  });

  it('parses an acknowledgement response', () => {
    const response = {
      batch_id: uuidv7(),
      server_time: '2026-10-20T07:15:03Z',
      acknowledgements: [
        { event_id: uuidv7(), result: 'accepted', server_sequence: 1041 },
        { event_id: uuidv7(), result: 'duplicate', server_sequence: 1002 },
        { event_id: uuidv7(), result: 'conflict', conflict_id: uuidv7() },
      ],
    };
    expect(syncPushResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe('published JSON Schema', () => {
  // The Laravel API validates uploads against this file. Regenerate with `npm run schema:generate`.
  it('matches the committed schema', async () => {
    const schema = z.toJSONSchema(syncPushRequestSchema, { target: 'draft-2020-12', unrepresentable: 'any' });
    await expect(`${JSON.stringify(schema, null, 2)}\n`).toMatchFileSnapshot('../schema/sync-push-request.v1.json');
  });
});
