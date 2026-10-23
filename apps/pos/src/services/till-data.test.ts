import {
  addProduct,
  addTender,
  createLocalStore,
  emptyCart,
  MemoryDatabase,
  MemoryDriver,
  renderReceiptText,
  uuidv7,
  type CatalogueProduct,
  type PaymentMethodInfo,
  type StaffInfo,
} from '@inkypos/core';
import { completeSale, loadReceipt, openShift } from './till-data';

async function till() {
  const store = createLocalStore(new MemoryDriver(new MemoryDatabase()));
  await store.migrate();
  const device = { device_id: uuidv7(), tenant_id: uuidv7(), branch_id: uuidv7(), register_id: uuidv7(), name: 'Till' };
  const cashier: StaffInfo = { id: uuidv7(), name: 'Zoe', role: 'cashier', active: true, pin: null, version: 1 };
  const bread: CatalogueProduct = {
    product_id: uuidv7(), sku: 'BREAD', barcodes: [], name: 'Bread', unit: 'each', unit_price_minor: 120,
    tax_code: 'VAT15', tax_rate_bp: 1500, tax_inclusive: true, active: true, version: 1,
  };
  const cash: PaymentMethodInfo = {
    id: uuidv7(), code: 'cash', name: 'Cash', kind: 'cash', currencies: ['USD'], initial_status: 'recorded',
    requires_reference: false, gives_change: true, active: true, position: 0, version: 1,
  };
  let cart = addProduct(emptyCart({ base_currency: 'USD', rounding: 'half_away_from_zero' }), bread, uuidv7);
  cart = addTender(cart, { method: cash, currency: 'USD', amount_minor: 200 }, { newId: uuidv7, rateFor: () => null });
  return { store, device, cashier, cart };
}

describe('completeSale', () => {
  it('refuses to sell without an open shift', async () => {
    const { store, device, cashier, cart } = await till();
    await expect(completeSale(store, device, cashier, cart)).rejects.toThrow('Open a shift before selling.');
  });

  it('records the signed-in cashier, not the device, on the shift and the sale', async () => {
    const { store, device, cashier, cart } = await till();
    await openShift(store, device, cashier, [{ currency: 'USD', amount_minor: 5000 }]);

    const saleId = await completeSale(store, device, cashier, cart);

    const entries = await store.outbox.due(new Date().toISOString(), 10);
    expect(entries.map((e) => e.event_type)).toEqual(['shift.opened', 'sale.completed']);
    expect(entries[1]?.aggregate_id).toBe(saleId);
    expect(entries.map((e) => JSON.parse(e.body).actor_user_id)).toEqual([cashier.id, cashier.id]);
  });
});

describe('loadReceipt', () => {
  it('names the cashier who made the sale, from the till staff list', async () => {
    const { store, device, cashier, cart } = await till();
    await openShift(store, device, cashier, [{ currency: 'USD', amount_minor: 5000 }]);
    const saleId = await completeSale(store, device, cashier, cart);

    // Not on the staff list yet (e.g. before the first pull): no cashier line, nothing else changes.
    expect(renderReceiptText((await loadReceipt(store, device, saleId))!.receipt)).not.toContain('Cashier:');

    await store.reference.applyPull([{ entity: 'staff', op: 'upsert', id: cashier.id, version: 1, data: cashier }], 'log:1');
    expect(renderReceiptText((await loadReceipt(store, device, saleId))!.receipt)).toMatch(/^Cashier: Zoe$/m);
  });
});
