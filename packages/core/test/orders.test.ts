import { describe, expect, it } from 'vitest';
import {
  addProduct,
  addTender,
  advanceOrder,
  afterPayment,
  buildKitchenTicket,
  buildReceipt,
  cartForOrder,
  CheckoutError,
  chooseOptions,
  completeCart,
  emptyCart,
  evenSplit,
  newOrder,
  addToOrder,
  priceCart,
  removeFromOrder,
  renderReceiptText,
  sendToKitchen,
  syncEventSchema,
  uuidv7,
  type CatalogueProduct,
  type PaymentMethodInfo,
} from '../src';

const newId = () => uuidv7();
const ids = { tenantId: newId(), branchId: newId(), registerId: newId(), deviceId: newId(), actorId: newId() };
const business = { base_currency: 'USD' as const, rounding: 'half_away_from_zero' as const };
const now = new Date('2026-10-23T12:30:00Z');
const [sadza, rice, beef, chicken, covo, rape, extraBeef] = Array.from({ length: 7 }, () => newId()) as [string, string, string, string, string, string, string];
const plate: CatalogueProduct = {
  product_id: newId(), sku: 'PLATE', name: 'Sadza plate', unit: 'each', unit_price_minor: 300, tax_code: 'VAT15', tax_rate_bp: 1500,
  tax_inclusive: true, active: true, barcodes: [], version: 1,
  option_groups: [
    { id: newId(), name: 'Staple', required: true, multiple: false, options: [{ id: sadza, name: 'Sadza', price_delta_minor: 0 }, { id: rice, name: 'Rice', price_delta_minor: 50 }] },
    { id: newId(), name: 'Relish', required: true, multiple: false, options: [{ id: beef, name: 'Beef stew', price_delta_minor: 200 }, { id: chicken, name: 'Road-runner chicken', price_delta_minor: 250 }] },
    { id: newId(), name: 'Vegetable', required: false, multiple: true, options: [{ id: covo, name: 'Covo', price_delta_minor: 0 }, { id: rape, name: 'Rape', price_delta_minor: 0 }] },
    { id: newId(), name: 'Extra', required: false, multiple: true, options: [{ id: extraBeef, name: 'Extra beef', price_delta_minor: 150 }] },
  ],
};
const mazoe: CatalogueProduct = { ...plate, product_id: newId(), sku: 'MAZOE', name: 'Mazoe orange', unit_price_minor: 100, option_groups: [] };
const cash: PaymentMethodInfo = {
  id: newId(), code: 'cash', name: 'Cash', kind: 'cash', currencies: ['USD'], initial_status: 'recorded', requires_reference: false,
  gives_change: true, active: true, position: 0, version: 1,
};

describe('options', () => {
  it('records the chosen options and adds their price to the item', () => {
    const options = chooseOptions(plate, [sadza, beef, covo, rape, extraBeef]);
    expect(options.map((o) => o.name)).toEqual(['Sadza', 'Beef stew', 'Covo', 'Rape', 'Extra beef']);
    const cart = addProduct(emptyCart(business), plate, newId, 1000, { options, note: 'sadza rakaoma' });
    expect(priceCart(cart).total).toBe(300 + 200 + 150);
  });

  it('refuses a missing required choice, two answers to a single choice, and options from another item', () => {
    expect(() => chooseOptions(plate, [beef])).toThrow('Choose staple for Sadza plate.');
    expect(() => chooseOptions(plate, [sadza, rice, beef])).toThrow('Choose only one staple.');
    expect(() => chooseOptions(plate, [sadza, beef, newId()])).toThrow(CheckoutError);
    expect(() => addProduct(emptyCart(business), plate, newId)).toThrow('Choose staple for Sadza plate.');
  });

  it('keeps plates with different choices on separate lines and sends them in a valid sale', () => {
    let cart = addProduct(emptyCart(business), plate, newId, 1000, { options: chooseOptions(plate, [sadza, beef]) });
    cart = addProduct(cart, plate, newId, 1000, { options: chooseOptions(plate, [rice, chicken]) });
    cart = addProduct(cart, mazoe, newId);
    cart = addProduct(cart, mazoe, newId);
    expect(cart.lines.map((l) => l.quantity_milli)).toEqual([1000, 1000, 2000]);
    cart = addTender(cart, { method: cash, currency: 'USD', amount_minor: 2000 }, { newId, rateFor: () => null });
    const event = completeCart(cart, { ...ids, newId, catalogueVersion: 1, now: () => now });
    const parsed = syncEventSchema.safeParse({ ...event, device_sequence: 1 });
    expect(parsed.success, parsed.success ? '' : parsed.error.message).toBe(true);
    expect(event.payload.lines[1]).toMatchObject({ unit_price_minor: 600, options: [{ name: 'Rice' }, { name: 'Road-runner chicken' }] });
  });
});

describe('restaurant orders', () => {
  const open = () => newOrder({ orderId: newId(), orderNumber: 17, orderDay: '2026-10-23', serviceType: 'sit_in', table: ' 4 ', now });

  it('goes to the kitchen in rounds and through its statuses', () => {
    let order = addToOrder(open(), plate, newId, now, { options: chooseOptions(plate, [sadza, beef]), note: 'no salt' });
    order = addToOrder(order, mazoe, newId, now);
    expect(order.table).toBe('4');

    const first = sendToKitchen(order, now);
    expect(first.ticket).toHaveLength(2);
    expect(first.order.status).toBe('sent');
    expect(sendToKitchen(first.order, now).ticket).toHaveLength(0);

    let next = addToOrder(first.order, mazoe, newId, now);
    const second = sendToKitchen(next, now);
    expect(second.ticket.map((l) => l.product.name)).toEqual(['Mazoe orange']);

    next = advanceOrder(advanceOrder(second.order, now), now);
    expect(next.status).toBe('ready');
    expect(advanceOrder(advanceOrder(next, now), now).status).toBe('served');

    expect(() => removeFromOrder(next, next.lines[0]!.line_id, now)).toThrow('gone to the kitchen');
  });

  it('prints a kitchen ticket without prices', () => {
    const order = addToOrder(open(), plate, newId, now, { options: chooseOptions(plate, [sadza, beef, covo]), note: 'no salt' });
    const text = renderReceiptText(buildKitchenTicket(order, order.lines, {}, 32));
    expect(text).toContain('ORDER 17');
    expect(text).toContain('TABLE 4');
    expect(text).toContain('1 x Sadza plate');
    expect(text).toContain('Relish: Beef stew');
    expect(text).toContain('NOTE: no salt');
    expect(text).not.toMatch(/\d\.\d\d/);
  });

  it('splits the bill by item into separate sales that carry the order number', () => {
    let order = addToOrder(open(), plate, newId, now, { options: chooseOptions(plate, [sadza, beef]) });
    order = addToOrder(order, plate, newId, now, { options: chooseOptions(plate, [rice, chicken]) });
    const [first, second] = order.lines;

    let cart = cartForOrder(order, business, [first!.line_id]);
    cart = addTender(cart, { method: cash, currency: 'USD', amount_minor: 500 }, { newId, rateFor: () => null });
    const sale = completeCart(cart, { ...ids, newId, catalogueVersion: 1, now: () => now });
    expect(sale.payload.order).toEqual({ order_number: 17, service_type: 'sit_in', table: '4' });
    const receipt = renderReceiptText(buildReceipt({ ...sale.payload, receipt_number: 'T1-000009' }, { business: null, branch: null, register: null, methods: [cash] }));
    expect(receipt).toContain('Order 17 · Table 4');
    expect(receipt).toContain('  Sadza, Beef stew');

    const rest = afterPayment(order, [first!.line_id], sale.payload.sale_id, now);
    expect(rest?.lines.map((l) => l.line_id)).toEqual([second!.line_id]);
    expect(afterPayment(rest!, [second!.line_id], newId(), now)).toBeNull();
    expect(() => cartForOrder(order, business, [])).toThrow('Choose at least one item');
  });

  it('splits a total evenly, the first shares taking the odd cents', () => {
    expect(evenSplit(1000, 3)).toEqual([334, 333, 333]);
    expect(evenSplit(1000, 4)).toEqual([250, 250, 250, 250]);
    expect(evenSplit(5, 1)).toEqual([5]);
    expect(() => evenSplit(100, 0)).toThrow();
  });
});
