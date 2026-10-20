import { describe, expect, it } from 'vitest';
import {
  addProduct,
  addTender,
  canComplete,
  CheckoutError,
  completeCart,
  convertToSaleCurrency,
  emptyCart,
  parseAmount,
  parseQuantity,
  priceCart,
  quoteAmountToCover,
  removeLine,
  setLineDiscount,
  setQuantity,
  syncEventSchema,
  uuidv7,
  type CatalogueProduct,
  type ExchangeRateInfo,
  type PaymentMethodInfo,
} from '../src';

const newId = () => uuidv7();
const business = { base_currency: 'USD' as const, rounding: 'half_away_from_zero' as const };

const product = (name: string, price: number, extra: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  product_id: newId(), sku: name.toUpperCase(), name, unit: 'each', unit_price_minor: price, tax_code: 'VAT15',
  tax_rate_bp: 1500, tax_inclusive: true, active: true, barcodes: [], version: 1, ...extra,
});
const method = (code: string, extra: Partial<PaymentMethodInfo> = {}): PaymentMethodInfo => ({
  id: newId(), code, name: code, kind: 'cash', currencies: ['USD', 'ZWG'], initial_status: 'recorded',
  requires_reference: false, gives_change: false, active: true, position: 0, version: 1, ...extra,
});
const cash = method('cash', { gives_change: true });
const ecocash = method('ecocash', { kind: 'mobile_money', initial_status: 'pending_confirmation', requires_reference: true });
const card = method('card', { kind: 'card', currencies: ['USD'], requires_reference: true });
const zwgRate: ExchangeRateInfo = { id: newId(), base_currency: 'USD', quote_currency: 'ZWG', rate: '0.03703704', version: 3, effective_at: '2026-10-21T08:00:00+00:00' };
const rates = { newId, rateFor: (c: string) => (c === 'ZWG' ? zwgRate : null) };
const noRates = { newId, rateFor: () => null };

const ctx = { newId, tenantId: newId(), branchId: newId(), registerId: newId(), deviceId: newId(), actorId: newId(), catalogueVersion: 42, now: () => new Date('2026-10-21T09:00:00Z') };

const bread = product('Bread', 120);
const milk = product('Milk', 110, { tax_code: 'ZERO', tax_rate_bp: 0 });
const rice = product('Rice', 180, { unit: 'kg' });

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CheckoutError);
    expect((e as CheckoutError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe('cart lines', () => {
  it('adds one to a counted item when scanned again; weighed items get their own line', () => {
    let cart = emptyCart(business);
    cart = addProduct(cart, bread, newId);
    cart = addProduct(cart, bread, newId);
    cart = addProduct(cart, rice, newId, 1250);
    cart = addProduct(cart, rice, newId, 500);
    expect(cart.lines.map((l) => [l.product.name, l.quantity_milli])).toEqual([['Bread', 2000], ['Rice', 1250], ['Rice', 500]]);
    expect(priceCart(cart).total).toBe(240 + 225 + 90);
  });

  it('edits quantities and discounts, and removes lines', () => {
    let cart = addProduct(emptyCart(business), bread, newId);
    const id = cart.lines[0]!.line_id;
    cart = setQuantity(cart, id, 3000);
    cart = setLineDiscount(cart, id, 60);
    expect(priceCart(cart)).toMatchObject({ subtotal: 360, discount: 60, total: 300, tax: 39 });
    expectCode(() => setLineDiscount(cart, id, 361), 'bad_discount');
    expect(priceCart(setQuantity(cart, id, 500)).total).toBe(0); // discount exactly covers the smaller line
    expectCode(() => setQuantity(cart, id, 400), 'bad_discount'); // discount no longer fits
    expect(setQuantity(cart, id, 0).lines).toEqual([]);
    expect(removeLine(cart, id).lines).toEqual([]);
  });

  it('refuses inactive products and silly quantities', () => {
    expectCode(() => addProduct(emptyCart(business), product('Old', 1, { active: false }), newId), 'inactive_product');
    expectCode(() => addProduct(emptyCart(business), bread, newId, 0), 'bad_quantity');
  });
});

describe('tenders', () => {
  const cartOf = (...items: CatalogueProduct[]) => items.reduce((c, p) => addProduct(c, p, newId), emptyCart(business));

  it('takes cash with change', () => {
    const cart = addTender(cartOf(bread, milk), { method: cash, currency: 'USD', amount_minor: 500 }, rates);
    expect(priceCart(cart)).toMatchObject({ total: 230, tendered: 500, remaining: 0, change: 270 });
    expect(canComplete(cart)).toEqual({ ok: true });
  });

  it('records EcoCash as pending confirmation and needs a reference', () => {
    expectCode(() => addTender(cartOf(bread), { method: ecocash, currency: 'USD', amount_minor: 120 }, rates), 'reference_required');
    const cart = addTender(cartOf(bread), { method: ecocash, currency: 'USD', amount_minor: 120, reference: ' MP2410.1234 ' }, rates);
    expect(cart.tenders[0]).toMatchObject({ status: 'pending_confirmation', reference: 'MP2410.1234' });
  });

  it('refuses overpaying with a method that gives no change', () => {
    expectCode(() => addTender(cartOf(bread), { method: card, currency: 'USD', amount_minor: 121, reference: 'A1' }, rates), 'exceeds_due');
    expectCode(() => addTender(cartOf(bread), { method: card, currency: 'ZWG', amount_minor: 100, reference: 'A1' }, rates), 'currency_not_accepted');
  });

  it('splits USD cash and ZWG EcoCash at the current rate', () => {
    let cart = cartOf(bread, milk); // 2.30 USD
    cart = addTender(cart, { method: cash, currency: 'USD', amount_minor: 100 }, rates);
    const zwgNeeded = quoteAmountToCover(priceCart(cart).remaining, zwgRate.rate);
    expect(zwgNeeded).toBe(3510); // 35.10 ZWG covers 1.30 USD
    cart = addTender(cart, { method: ecocash, currency: 'ZWG', amount_minor: zwgNeeded, reference: 'MP1' }, rates);
    expect(priceCart(cart)).toMatchObject({ remaining: 0, change: 0 });
    expect(cart.tenders[1]).toMatchObject({ exchange_rate: '0.03703704', exchange_rate_version: 3, sale_currency_amount_minor: 130 });
  });

  it('needs a rate before taking a foreign currency', () => {
    expectCode(() => addTender(cartOf(bread), { method: cash, currency: 'ZWG', amount_minor: 1000 }, noRates), 'no_rate');
  });

  it('will not complete a zero-total sale', () => {
    let cart = cartOf(bread);
    cart = setLineDiscount(cart, cart.lines[0]!.line_id, 120);
    expect(canComplete(cart)).toMatchObject({ ok: false, code: 'nothing_to_sell' });
  });

  it('will not complete an unpaid or empty sale', () => {
    expect(canComplete(emptyCart(business))).toMatchObject({ ok: false, code: 'nothing_to_sell' });
    expect(canComplete(cartOf(bread))).toMatchObject({ ok: false, code: 'not_paid' });
    expectCode(() => completeCart(cartOf(bread), ctx), 'not_paid');
  });
});

describe('currency maths', () => {
  it('converts without floating point and covers balances exactly', () => {
    expect(convertToSaleCurrency(1000, '0.03703704', 'half_away_from_zero')).toBe(37);
    expect(convertToSaleCurrency(9_000_000_000_000, '0.03703704', 'half_away_from_zero')).toBe(333_333_360_000);
    for (let due = 1; due < 2000; due += 37) {
      const zwg = quoteAmountToCover(due, '0.03703704');
      expect(convertToSaleCurrency(zwg, '0.03703704', 'half_away_from_zero')).toBeGreaterThanOrEqual(due);
    }
  });

  it('parses keypad input', () => {
    expect([parseAmount('12'), parseAmount('12.5'), parseAmount('12,50'), parseAmount('0.05')]).toEqual([1200, 1250, 1250, 5]);
    expect([parseAmount(''), parseAmount('1.234'), parseAmount('-1'), parseAmount('abc')]).toEqual([null, null, null, null]);
    expect([parseQuantity('1.25'), parseQuantity('2'), parseQuantity('0'), parseQuantity('1.2345')]).toEqual([1250, 2000, null, null]);
  });
});

describe('completeCart', () => {
  it('produces a sale the shared schema accepts', () => {
    let cart = addProduct(addProduct(emptyCart(business), bread, newId), rice, newId, 1250);
    cart = addTender(cart, { method: cash, currency: 'USD', amount_minor: 1000 }, rates);
    const event = completeCart(cart, ctx);
    const parsed = syncEventSchema.safeParse({ ...event, device_sequence: 1 });
    expect(parsed.success, parsed.success ? '' : parsed.error.message).toBe(true);
    expect(event.payload).toMatchObject({ catalogue_version: 42, change_minor: 1000 - 345, completed_at: '2026-10-21T09:00:00.000Z' });
  });

  it('always produces valid sales for random baskets and tenders (200 cases)', () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const catalogue = [bread, milk, rice, product('Oil', 420), product('Sugar', 289, { tax_inclusive: false }), product('Eggs', 550, { tax_rate_bp: 0 })];

    for (let i = 0; i < 200; i++) {
      let cart = emptyCart({ ...business, rounding: rnd(2) ? 'half_even' : 'half_away_from_zero' });
      for (let n = 1 + rnd(5); n > 0; n--) {
        const p = catalogue[rnd(catalogue.length)]!;
        cart = addProduct(cart, p, newId, p.unit === 'kg' ? 100 + rnd(3000) : 1000 * (1 + rnd(3)));
      }
      const line = cart.lines[rnd(cart.lines.length)]!;
      const max = priceCart(cart).lines.find((l) => l.line.line_id === line.line_id)!.priced.extendedMinor;
      cart = setLineDiscount(cart, line.line_id, rnd(max + 1));

      if (rnd(2) && priceCart(cart).remaining > 0) {
        const zwg = quoteAmountToCover(rnd(priceCart(cart).remaining) + 1, zwgRate.rate);
        try {
          cart = addTender(cart, { method: ecocash, currency: 'ZWG', amount_minor: zwg, reference: `R${i}` }, rates);
        } catch (e) {
          expect((e as CheckoutError).code).toBe('exceeds_due');
        }
      }
      const remaining = priceCart(cart).remaining;
      if (remaining > 0) cart = addTender(cart, { method: cash, currency: 'USD', amount_minor: remaining + rnd(500) }, rates);

      if (priceCart(cart).total === 0) {
        expectCode(() => completeCart(cart, ctx), 'nothing_to_sell');
        continue;
      }
      const event = completeCart(cart, ctx);
      const result = syncEventSchema.safeParse({ ...event, device_sequence: i + 1 });
      expect(result.success, `case ${i}: ${result.success ? '' : result.error.message}`).toBe(true);
    }
  });
});
