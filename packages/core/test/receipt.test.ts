import { describe, expect, it } from 'vitest';
import {
  addProduct,
  addTender,
  buildReceipt,
  completeCart,
  emptyCart,
  quoteAmountToCover,
  priceCart,
  renderReceiptHtml,
  renderReceiptText,
  setLineDiscount,
  uuidv7,
  type CatalogueProduct,
  type PaymentMethodInfo,
} from '../src';

const newId = () => uuidv7();
const p = (name: string, price: number, extra: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  product_id: newId(), sku: name, name, unit: 'each', unit_price_minor: price, tax_code: 'VAT15', tax_rate_bp: 1500,
  tax_inclusive: true, active: true, barcodes: [], version: 1, ...extra,
});
const m = (code: string, name: string, extra: Partial<PaymentMethodInfo> = {}): PaymentMethodInfo => ({
  id: newId(), code, name, kind: 'cash', currencies: ['USD', 'ZWG'], initial_status: 'recorded', requires_reference: false,
  gives_change: false, active: true, position: 0, version: 1, ...extra,
});
const cash = m('cash', 'Cash', { gives_change: true });
const ecocash = m('ecocash', 'EcoCash', { initial_status: 'pending_confirmation', requires_reference: true });

function sampleSale() {
  let cart = emptyCart({ base_currency: 'USD', rounding: 'half_away_from_zero' });
  cart = addProduct(cart, p('White bread 700g', 120), newId, 2000);
  cart = addProduct(cart, p('Rice (per kg)', 180, { unit: 'kg' }), newId, 1250);
  cart = addProduct(cart, p('A very long product name that will certainly not fit on one receipt line', 99), newId);
  cart = setLineDiscount(cart, cart.lines[0]!.line_id, 40);
  const rate = { id: newId(), base_currency: 'USD' as const, quote_currency: 'ZWG' as const, rate: '0.03703704', version: 2, effective_at: '2026-10-21T08:00:00+00:00' };
  cart = addTender(cart, { method: cash, currency: 'USD', amount_minor: 300 }, { newId, rateFor: () => rate });
  const zwg = quoteAmountToCover(priceCart(cart).remaining, rate.rate);
  cart = addTender(cart, { method: ecocash, currency: 'ZWG', amount_minor: zwg, reference: 'MP241021.0915' }, { newId, rateFor: () => rate });
  const event = completeCart(cart, { newId, tenantId: newId(), branchId: newId(), registerId: newId(), deviceId: newId(), actorId: newId(), catalogueVersion: 1, now: () => new Date('2026-10-21T09:15:00Z') });
  return { ...event.payload, receipt_number: 'T1-000007' };
}

const ctx = {
  business: { id: newId(), name: 'Mbare <Hardware> & Grocer', base_currency: 'USD' as const, rounding: 'half_away_from_zero' as const, tax_rounding: 'per_line' as const },
  branch: { id: newId(), name: 'Main branch', code: 'MAIN' },
  register: { id: newId(), branch_id: newId(), name: 'Till 1', code: 'T1' },
  methods: [cash, ecocash],
};

describe('receipts', () => {
  it('prints every line, discount, tax, tender, conversion and the fiscal disclaimer', () => {
    const text = renderReceiptText(buildReceipt(sampleSale(), ctx, 42));

    expect(text).toContain('Receipt T1-000007');
    expect(text).toMatch(/^ {2}2 x 1\.20 +2\.40$/m);
    expect(text).toMatch(/^ {2}Discount +-0\.40$/m);
    expect(text).toMatch(/^ {2}1\.25 x 1\.80 +2\.25$/m);
    expect(text).toMatch(/^TOTAL USD +5\.24$/m);
    expect(text).toMatch(/^VAT15 15\.00% +0\.68$/m);
    expect(text).toMatch(/^EcoCash \(awaiting confirmation\) +ZWG 60\.48$/m);
    expect(text).toContain('at 0.03703704 USD/ZWG');
    expect(text).toContain('Ref MP241021.0915');
    expect(text).toContain('Not a fiscal tax invoice');
  });

  it('names the customer when the till knows them', () => {
    expect(renderReceiptText(buildReceipt(sampleSale(), { ...ctx, customerName: 'Tendai Moyo' }, 42))).toMatch(/^Customer: Tendai Moyo$/m);
    expect(renderReceiptText(buildReceipt(sampleSale(), ctx, 42))).not.toContain('Customer:');
  });

  it('names the cashier who served, under the till', () => {
    const text = renderReceiptText(buildReceipt(sampleSale(), { ...ctx, cashierName: 'Rudo' }, 42));
    expect(text).toMatch(/^Cashier: Rudo$/m);
    expect(text.indexOf('Cashier: Rudo')).toBeGreaterThan(text.indexOf('Till:'));
    expect(renderReceiptText(buildReceipt(sampleSale(), ctx, 42))).not.toContain('Cashier:');
  });

  it('never exceeds the printer width', () => {
    for (const width of [32, 42, 48] as const) {
      const lines = renderReceiptText(buildReceipt(sampleSale(), ctx, width)).split('\n');
      expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(width);
    }
  });

  it('escapes business data in the HTML version', () => {
    const html = renderReceiptHtml(buildReceipt(sampleSale(), ctx));
    expect(html).toContain('Mbare &lt;Hardware&gt; &amp; Grocer');
    expect(html).not.toContain('<Hardware>');
    expect(html).toContain('@page { size: 80mm auto');
  });
});
