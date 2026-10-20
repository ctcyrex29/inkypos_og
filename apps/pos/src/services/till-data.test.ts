import {
  addProduct,
  addTender,
  createLocalStore,
  emptyCart,
  MemoryDatabase,
  MemoryDriver,
  uuidv7,
  type CatalogueProduct,
  type PaymentMethodInfo,
  type StaffInfo,
} from '@inkypos/core';
import { completeSale } from './till-data';

describe('completeSale', () => {
  it('records the signed-in cashier, not the device, as the actor', async () => {
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

    const saleId = await completeSale(store, device, cashier, cart);

    const [entry] = await store.outbox.due(new Date().toISOString(), 10);
    expect(entry?.aggregate_id).toBe(saleId);
    expect(JSON.parse(entry!.body).actor_user_id).toBe(cashier.id);
  });
});
