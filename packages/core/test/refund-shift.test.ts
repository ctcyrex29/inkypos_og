import { describe, expect, it } from 'vitest';
import {
  addProduct,
  addTender,
  buildRefund,
  buildRefundReceipt,
  renderReceiptText,
  buildVoid,
  cashVariance,
  completeCart,
  cumulativeRefund,
  emptyCart,
  expectedCash,
  refundableLines,
  RefundError,
  syncEventSchema,
  uuidv7,
  type CatalogueProduct,
  type PaymentMethodInfo,
  type RefundIssuedPayload,
  type SaleCompletedPayload,
} from '../src';

const newId = () => uuidv7();
const ids = { tenantId: newId(), branchId: newId(), registerId: newId(), deviceId: newId(), actorId: newId() };
const p = (name: string, price: number, extra: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  product_id: newId(), sku: name, name, unit: 'each', unit_price_minor: price, tax_code: 'VAT15', tax_rate_bp: 1500,
  tax_inclusive: true, active: true, barcodes: [], version: 1, ...extra,
});
const cash: PaymentMethodInfo = {
  id: newId(), code: 'cash', name: 'Cash', kind: 'cash', currencies: ['USD', 'ZWG'], initial_status: 'recorded',
  requires_reference: false, gives_change: true, active: true, position: 0, version: 1,
};

function sale(): SaleCompletedPayload {
  let cart = emptyCart({ base_currency: 'USD', rounding: 'half_away_from_zero' });
  cart = addProduct(cart, p('Soap', 100), newId, 3000); // 3 × 1.00 = 3.00, VAT 0.39
  cart = addProduct(cart, p('Rice', 333, { unit: 'kg' }), newId, 1500); // 1.5 × 3.33 = 5.00 (4.995 rounds up)
  cart = addTender(cart, { method: cash, currency: 'USD', amount_minor: 1000 }, { newId, rateFor: () => null });
  const event = completeCart(cart, { ...ids, newId, catalogueVersion: 1, now: () => new Date('2026-10-22T09:00:00Z') });
  return { ...event.payload, receipt_number: 'T1-000001' };
}

const ctx = { ...ids, newId, payoutMethodCode: 'cash', reason: 'customer_return' as const, now: () => new Date('2026-10-22T10:00:00Z') };
const valid = (payload: unknown) => {
  const r = syncEventSchema.safeParse({ ...(payload as object), device_sequence: 2 });
  if (!r.success) throw new Error(r.error.message);
};

describe('refunds', () => {
  it('refunds proportionally and the parts always add up to exactly the line total', () => {
    const s = sale();
    const soap = s.lines[0]!;
    // Refund soap one at a time: 1.00 each, and the three refunds total exactly the line.
    let previous: RefundIssuedPayload[] = [];
    const amounts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = buildRefund(s, previous, [{ original_line_id: soap.line_id, quantity_milli: 1000, restock: true }], ctx);
      valid(r);
      amounts.push(r.payload.totals.total_minor);
      previous = [...previous, r.payload];
    }
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(soap.line_total_minor);
    expect(refundableLines(s, previous)[0]!.refundableMilli).toBe(0);

    // The odd-priced weighed line: thirds round, but the full return still equals the original.
    const rice = s.lines[1]!;
    const parts = [500, 500, 500].map((_, i) =>
      cumulativeRefund(rice.line_total_minor, rice.quantity_milli, (i + 1) * 500, 'half_away_from_zero') -
      cumulativeRefund(rice.line_total_minor, rice.quantity_milli, i * 500, 'half_away_from_zero'),
    );
    expect(parts.reduce((a, b) => a + b, 0)).toBe(rice.line_total_minor);
  });

  it('refuses refunding more than was sold', () => {
    const s = sale();
    const first = buildRefund(s, [], [{ original_line_id: s.lines[0]!.line_id, quantity_milli: 2000, restock: true }], ctx);
    expect(() => buildRefund(s, [first.payload], [{ original_line_id: s.lines[0]!.line_id, quantity_milli: 2000, restock: true }], ctx)).toThrow(
      /Only 1 of Soap/,
    );
    expect(() => buildRefund(s, [], [], ctx)).toThrow(RefundError);
  });

  it('only moves stock for items that come back to the shelf', () => {
    const s = sale();
    const r = buildRefund(
      s,
      [],
      [
        { original_line_id: s.lines[0]!.line_id, quantity_milli: 1000, restock: false },
        { original_line_id: s.lines[1]!.line_id, quantity_milli: 500, restock: true },
      ],
      ctx,
    );
    valid(r);
    expect(r.payload.stock_movements).toEqual([expect.objectContaining({ product_id: s.lines[1]!.product_id, quantity_delta_milli: 500 })]);
  });

  it('voids whatever is still refundable', () => {
    const s = sale();
    const partial = buildRefund(s, [], [{ original_line_id: s.lines[0]!.line_id, quantity_milli: 1000, restock: true }], ctx);
    const voided = buildVoid(s, [partial.payload], ctx);
    valid(voided);
    expect(voided.payload.reason).toBe('void');
    expect(partial.payload.totals.total_minor + voided.payload.totals.total_minor).toBe(s.totals.total_minor);
    expect(() => buildVoid(s, [partial.payload, voided.payload], ctx)).toThrow(/already been fully refunded/);
  });

  it('is checked by the shared schema', () => {
    const s = sale();
    expect(() => buildRefund(s, [], [{ original_line_id: sale().lines[0]!.line_id, quantity_milli: 1, restock: true }], ctx)).toThrow(/not on the original sale/);
    const r = buildRefund(s, [], [{ original_line_id: s.lines[0]!.line_id, quantity_milli: 1000, restock: true }], ctx);
    const bad = { ...r, payload: { ...r.payload, totals: { ...r.payload.totals, total_minor: r.payload.totals.total_minor + 1 } } };
    expect(syncEventSchema.safeParse({ ...bad, device_sequence: 1 }).success).toBe(false);
  });
});

describe('shift cash', () => {
  it('works out the expected drawer per currency', () => {
    const s = sale(); // USD 10.00 cash in, change 2.00 out
    const zwgSale: SaleCompletedPayload = {
      ...s,
      sale_id: newId(),
      payments: [{ ...s.payments[0]!, payment_id: newId(), currency: 'ZWG', amount_minor: 27_000, sale_currency_amount_minor: 1000, exchange_rate: '0.03703704' }],
    };
    const ecocashSale: SaleCompletedPayload = { ...s, sale_id: newId(), change_minor: 0, payments: [{ ...s.payments[0]!, method_code: 'ecocash', amount_minor: 800, sale_currency_amount_minor: 800 }] };
    const refund = buildRefund(s, [], [{ original_line_id: s.lines[0]!.line_id, quantity_milli: 1000, restock: true }], ctx).payload;
    const shiftId = newId();

    const expected = expectedCash({
      openingFloat: [{ currency: 'USD', amount_minor: 5000 }, { currency: 'ZWG', amount_minor: 10_000 }],
      sales: [s, zwgSale, ecocashSale],
      refunds: [refund],
      movements: [
        { movement_id: newId(), shift_id: shiftId, direction: 'out', currency: 'USD', amount_minor: 3000, reason: 'safe_drop', occurred_at: '2026-10-22T12:00:00Z' },
      ],
      cashMethodCodes: new Set(['cash']),
    });

    // USD: 50 + 10 − 2 (change) − 2 (change on the ZWG sale, paid in USD) − 2 (change on EcoCash sale? no: 0) − 1 refund − 30 drop
    expect(expected).toEqual([
      { currency: 'USD', amount_minor: 5000 + 1000 - 200 - 200 - 100 - 3000 },
      { currency: 'ZWG', amount_minor: 10_000 + 27_000 },
    ]);
    expect(cashVariance(expected, [{ currency: 'USD', amount_minor: 2400 }, { currency: 'ZWG', amount_minor: 37_000 }])).toEqual([
      { currency: 'USD', amount_minor: -100 },
      { currency: 'ZWG', amount_minor: 0 },
    ]);
  });
});

describe('refund receipt', () => {
  it('names the cashier who gave the refund', () => {
    const s = sale();
    const refund = buildRefund(s, [], [{ original_line_id: s.lines[0]!.line_id, quantity_milli: 1000, restock: true }], ctx).payload;
    const base = { business: null, branch: null, register: null, methods: [cash] };
    expect(renderReceiptText(buildRefundReceipt(refund, { ...base, cashierName: 'Rudo' }))).toMatch(/^Cashier: Rudo$/m);
    expect(renderReceiptText(buildRefundReceipt(refund, base))).not.toContain('Cashier:');
  });
});
