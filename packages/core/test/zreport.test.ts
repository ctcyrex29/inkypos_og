import { describe, expect, it } from 'vitest';
import {
  addProduct,
  addTender,
  buildRefund,
  buildShiftReport,
  completeCart,
  emptyCart,
  paymentTotals,
  renderReceiptText,
  uuidv7,
  type CashMovementPayload,
  type CatalogueProduct,
  type PaymentMethodInfo,
  type ShiftRecord,
} from '../src';

const newId = () => uuidv7();
const ids = { tenantId: newId(), branchId: newId(), registerId: newId(), deviceId: newId(), actorId: newId() };
const soap: CatalogueProduct = {
  product_id: newId(), sku: 'SOAP', name: 'Soap', unit: 'each', unit_price_minor: 100, tax_code: 'VAT15', tax_rate_bp: 1500,
  tax_inclusive: true, active: true, barcodes: [], version: 1,
};
const method = (code: string, name: string, extra: Partial<PaymentMethodInfo> = {}): PaymentMethodInfo => ({
  id: newId(), code, name, kind: 'cash', currencies: ['USD', 'ZWG'], initial_status: 'recorded', requires_reference: false,
  gives_change: true, active: true, position: 0, version: 1, ...extra,
});
const cash = method('cash', 'Cash');
const ecocash = method('ecocash', 'EcoCash', { kind: 'mobile_money', initial_status: 'pending_confirmation', requires_reference: true, gives_change: false });

function sale(units: number, tender: { method: PaymentMethodInfo; amount: number; reference?: string }) {
  let cart = addProduct(emptyCart({ base_currency: 'USD', rounding: 'half_away_from_zero' }), soap, newId, units * 1000);
  cart = addTender(cart, { method: tender.method, currency: 'USD', amount_minor: tender.amount, ...(tender.reference ? { reference: tender.reference } : {}) }, { newId, rateFor: () => null });
  return { ...completeCart(cart, { ...ids, newId, catalogueVersion: 1, now: () => new Date('2026-10-22T09:00:00Z') }).payload, receipt_number: 'T1-000001' };
}

describe('shift report (Z)', () => {
  const shiftId = newId();
  const s1 = sale(3, { method: cash, amount: 500 }); // 3.00, change 2.00
  const s2 = sale(2, { method: ecocash, amount: 200, reference: 'MP1' }); // 2.00 pending confirmation
  const refund = buildRefund(s1, [], [{ original_line_id: s1.lines[0]!.line_id, quantity_milli: 1000, restock: true }], {
    ...ids, newId, payoutMethodCode: 'cash', reason: 'customer_return', now: () => new Date('2026-10-22T10:00:00Z'),
  }).payload;
  const drop: CashMovementPayload = { movement_id: newId(), shift_id: shiftId, direction: 'out', currency: 'USD', amount_minor: 100, reason: 'safe_drop', occurred_at: '2026-10-22T11:00:00Z' };
  const shift: ShiftRecord = {
    shift_id: shiftId, opened_at: '2026-10-22T07:00:00Z', opening_float: [{ currency: 'USD', amount_minor: 2000 }],
    closed: { closed_at: '2026-10-22T17:00:00Z', expected_cash: [{ currency: 'USD', amount_minor: 2100 }], counted_cash: [{ currency: 'USD', amount_minor: 2050 }] },
  };
  const ctx = { business: null, branch: null, register: { id: newId(), branch_id: newId(), name: 'Till 1', code: 'T1' }, methods: [cash, ecocash], cashierName: 'Zoe' };

  it('totals takings per payment type net of refunds, with pending amounts called out', () => {
    expect(paymentTotals({ sales: [s1, s2], refunds: [refund] })).toEqual([
      { method_code: 'cash', currency: 'USD', tendered: 500, pending: 0, refunded: 100 },
      { method_code: 'ecocash', currency: 'USD', tendered: 200, pending: 200, refunded: 0 },
    ]);
  });

  it('prints sales, takings, the drawer and the count, within the printer width', () => {
    const doc = buildShiftReport(shift, { sales: [s1, s2], refunds: [refund], movements: [drop] }, ctx, 32);
    const text = renderReceiptText(doc);

    expect(text).toContain('SHIFT REPORT (Z)');
    expect(text).toContain('Cashier: Zoe');
    expect(text).toMatch(/^Sales \(2\) +USD 5\.00$/m);
    expect(text).toMatch(/^Cash +USD 4\.00$/m);
    expect(text).toMatch(/^EcoCash +USD 2\.00$/m);
    expect(text).toMatch(/^  not yet confirmed +USD 2.00$/m);
    expect(text).toMatch(/^Refunds 1, voids 0 +-USD 1.00$/m);
    expect(text).toMatch(/^Change given +-USD 2\.00$/m);
    expect(text).toMatch(/^Out: safe drop +-USD 1\.00$/m);
    expect(text).toMatch(/^Short +-USD 0\.50$/m);
    expect(text).toContain('Not a fiscal document');
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(32);
  });

  it('is an X report while the shift is still open', () => {
    const text = renderReceiptText(buildShiftReport({ ...shift, closed: null }, { sales: [], refunds: [], movements: [] }, ctx));
    expect(text).toContain('SHIFT SO FAR (X)');
    expect(text).not.toContain('Counted');
  });
});
