import { describe, expect, it } from 'vitest';
import { buildRefund, buildSampleSale, buildVoid, makePinHash, priceLine, syncEventSchema, uuidv7, type LinePricingInput, type RefundIssuedPayload, type RoundingMode } from '../src';

/**
 * Golden vectors shared with the Laravel API (apps/api/tests/Unit/*VectorTest.php).
 * The TypeScript rules are the source of truth; PHP must reproduce every case.
 * Regenerate with `npx vitest run vectors -u` after an intentional rule change.
 */

/** Deterministic UUIDv7s so the vector files only change when the rules change. */
function idSource(seed: number) {
  let n = seed;
  return () => {
    n++;
    return uuidv7({ now: 1_792_000_000_000 + n, random: (len) => Uint8Array.from({ length: len }, (_, i) => (n * 31 + i * 7) & 0xff) });
  };
}

const asJson = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

describe('golden vectors', () => {
  it('pricing.v1.json', async () => {
    const cases: { input: LinePricingInput; output: ReturnType<typeof priceLine> }[] = [];
    const modes: RoundingMode[] = ['half_away_from_zero', 'half_even'];
    const grid: Omit<LinePricingInput, 'rounding'>[] = [
      { unitPriceMinor: 120, quantityMilli: 2000, discountMinor: 0, taxRateBasisPoints: 1500, taxInclusive: true },
      { unitPriceMinor: 999, quantityMilli: 1000, discountMinor: 0, taxRateBasisPoints: 1500, taxInclusive: true },
      { unitPriceMinor: 450, quantityMilli: 1250, discountMinor: 0, taxRateBasisPoints: 1500, taxInclusive: false },
      { unitPriceMinor: 1000, quantityMilli: 2000, discountMinor: 200, taxRateBasisPoints: 1500, taxInclusive: false },
      { unitPriceMinor: 333, quantityMilli: 1500, discountMinor: 0, taxRateBasisPoints: 1450, taxInclusive: true },
      { unitPriceMinor: 5, quantityMilli: 500, discountMinor: 0, taxRateBasisPoints: 1500, taxInclusive: false },
      { unitPriceMinor: 15, quantityMilli: 500, discountMinor: 0, taxRateBasisPoints: 1500, taxInclusive: false },
      { unitPriceMinor: 1, quantityMilli: 1, discountMinor: 0, taxRateBasisPoints: 0, taxInclusive: true },
      { unitPriceMinor: 123_456_789, quantityMilli: 7_000, discountMinor: 1_234, taxRateBasisPoints: 1500, taxInclusive: true },
      { unitPriceMinor: 2_500, quantityMilli: 3_333, discountMinor: 0, taxRateBasisPoints: 1500, taxInclusive: false },
      { unitPriceMinor: 95, quantityMilli: 1000, discountMinor: 95, taxRateBasisPoints: 1500, taxInclusive: true },
    ];
    for (const rounding of modes) for (const g of grid) cases.push({ input: { ...g, rounding }, output: priceLine({ ...g, rounding }) });
    await expect(asJson(cases)).toMatchFileSnapshot('../test-vectors/pricing.v1.json');
  });

  it('sale-events.v1.json', async () => {
    const newId = idSource(1);
    const ctx = { newId, tenantId: newId(), branchId: newId(), registerId: newId(), deviceId: newId(), actorId: newId(), completedAt: '2026-10-20T09:15:00+02:00' };
    const valid = () => ({ ...buildSampleSale(ctx, 3), device_sequence: 1 });
    type Ev = ReturnType<typeof valid>;
    const mutate = (fn: (e: Ev) => void) => {
      const e = valid();
      fn(e);
      return e;
    };

    const cases: { name: string; valid: boolean; event: unknown }[] = [
      { name: 'valid three-line cash sale', valid: true, event: valid() },
      {
        name: 'valid split tender USD + ZWG',
        valid: true,
        event: mutate((e) => {
          const total = e.payload.totals.total_minor;
          e.payload.change_minor = 0;
          e.payload.payments = [
            { payment_id: newId(), method_code: 'cash', status: 'recorded', currency: 'USD', amount_minor: total - 100, sale_currency_amount_minor: total - 100 },
            { payment_id: newId(), method_code: 'ecocash', status: 'pending_confirmation', currency: 'ZWG', amount_minor: 2700, sale_currency_amount_minor: 100, exchange_rate: '0.03703704', exchange_rate_version: 7 },
          ];
        }),
      },
      { name: 'line total off by one', valid: false, event: mutate((e) => void (e.payload.lines[0]!.line_total_minor += 1)) },
      { name: 'line tax wrong', valid: false, event: mutate((e) => void (e.payload.lines[0]!.tax.amount_minor += 1)) },
      { name: 'sale total wrong', valid: false, event: mutate((e) => void (e.payload.totals.total_minor += 1)) },
      { name: 'underpaid', valid: false, event: mutate((e) => void (e.payload.payments[0]!.status = 'failed')) },
      { name: 'foreign currency without rate', valid: false, event: mutate((e) => void (e.payload.payments[0]!.currency = 'ZWG')) },
      { name: 'stock movements do not mirror lines', valid: false, event: mutate((e) => void e.payload.stock_movements.pop()) },
      { name: 'aggregate id mismatch', valid: false, event: mutate((e) => void (e.aggregate_id = newId())) },
      { name: 'duplicate line id', valid: false, event: mutate((e) => void (e.payload.lines[1]!.line_id = e.payload.lines[0]!.line_id)) },
      { name: 'not a v7 uuid', valid: false, event: mutate((e) => void (e.event_id = '3f1c9f1e-0d1f-4b5a-9c1d-2a3b4c5d6e7f')) },
      { name: 'unknown currency', valid: false, event: mutate((e) => void ((e.payload as { currency: string }).currency = 'XXX')) },
      { name: 'discount above line', valid: false, event: mutate((e) => void (e.payload.lines[0]!.discount_minor = 999_999)) },
      { name: 'negative change', valid: false, event: mutate((e) => void (e.payload.change_minor = -1)) },
      { name: 'unknown schema version', valid: false, event: mutate((e) => void ((e as { schema_version: number }).schema_version = 2)) },
    ];

    for (const c of cases) expect(syncEventSchema.safeParse(c.event).success, c.name).toBe(c.valid);
    await expect(asJson(cases)).toMatchFileSnapshot('../test-vectors/sale-events.v1.json');
  });

  it('refund-events.v1.json', async () => {
    const newId = idSource(500);
    const base = { newId, tenantId: newId(), branchId: newId(), registerId: newId(), deviceId: newId(), actorId: newId(), completedAt: '2026-10-21T09:15:00+02:00' };
    const sale = { ...buildSampleSale(base, 3).payload, receipt_number: 'T1-000010' };
    const rctx = { ...base, payoutMethodCode: 'cash', reason: 'customer_return' as const, now: () => new Date('2026-10-22T09:00:00Z') };
    const [bread, , rice] = sale.lines; // 2 × bread, milk, 1.25 kg rice
    const event = (previous: RefundIssuedPayload[], picks: { line: typeof bread; milli: number; restock?: boolean }[]) => ({
      ...buildRefund(sale, previous, picks.map((p) => ({ original_line_id: p.line!.line_id, quantity_milli: p.milli, restock: p.restock ?? true })), rctx),
      device_sequence: 2,
    });

    const oneBread = event([], [{ line: bread, milli: 1000 }]);
    const riceThird = event([], [{ line: rice, milli: 417 }]);
    type Case = { name: string; schema_valid: boolean; expected: 'accepted' | 'rejected' | 'conflict'; previous: unknown[]; event: unknown };
    const mutate = (e: ReturnType<typeof event>, fn: (p: ReturnType<typeof event>['payload']) => void) => {
      const copy = structuredClone(e);
      fn(copy.payload);
      return copy;
    };
    const cases: Case[] = [
      { name: 'one of two breads', schema_valid: true, expected: 'accepted', previous: [], event: oneBread },
      { name: 'odd fraction of a weighed line', schema_valid: true, expected: 'accepted', previous: [], event: riceThird },
      { name: 'void of the rest after a partial refund', schema_valid: true, expected: 'accepted', previous: [oneBread.payload], event: { ...buildVoid(sale, [oneBread.payload], rctx), device_sequence: 3 } },
      { name: 'damaged return without restock', schema_valid: true, expected: 'accepted', previous: [], event: event([], [{ line: bread, milli: 2000, restock: false }]) },
      { name: 'more than is left (another till refunded first)', schema_valid: true, expected: 'conflict', previous: [oneBread.payload], event: event([], [{ line: bread, milli: 2000 }]) },
      {
        name: 'amount does not follow the cumulative rule',
        schema_valid: true,
        expected: 'rejected',
        previous: [],
        event: mutate(oneBread, (p) => {
          p.lines[0]!.amount_minor += 1;
          p.totals.total_minor += 1;
          p.payments[0]!.amount_minor += 1;
          p.payments[0]!.sale_currency_amount_minor += 1;
        }),
      },
      { name: 'totals do not add up', schema_valid: false, expected: 'rejected', previous: [], event: mutate(oneBread, (p) => void (p.totals.total_minor += 1)) },
      { name: 'payout differs from total', schema_valid: false, expected: 'rejected', previous: [], event: mutate(oneBread, (p) => void (p.payments[0]!.amount_minor -= 1)) },
      { name: 'restocked line without stock movement', schema_valid: false, expected: 'rejected', previous: [], event: mutate(oneBread, (p) => void (p.stock_movements = [])) },
    ];

    for (const c of cases) expect(syncEventSchema.safeParse(c.event).success, c.name).toBe(c.schema_valid);
    await expect(asJson({ sale, cases })).toMatchFileSnapshot('../test-vectors/refund-events.v1.json');
  });

  it('staff-pin.v1.json', async () => {
    const salt = (seed: number) => Uint8Array.from({ length: 16 }, (_, i) => (seed * 37 + i * 11) & 0xff);
    const cases: { pin: string; salt: string; iterations: number; hash: string }[] = [];
    for (const [i, pin] of ['4821', '0042', '739510', '50513'].entries()) {
      const published = await makePinHash(pin, salt(i + 1), 10_000 * (i + 1));
      cases.push({ pin, salt: published.salt, iterations: published.iterations, hash: published.hash });
    }
    await expect(asJson(cases)).toMatchFileSnapshot('../test-vectors/staff-pin.v1.json');
  });
});
