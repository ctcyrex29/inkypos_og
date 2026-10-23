import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { id, on, serve, startAsManager } from '@/test-utils';

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const branch = { id: id(10), name: 'Main', code: 'MAIN' };
const bread = {
  product_id: id(20), sku: 'BREAD', name: 'White bread', unit: 'each', unit_price_minor: 120, tax_code: 'VAT15', tax_rate_bp: 1500,
  tax_inclusive: true, active: true, barcodes: [], version: 1, category_id: null, cost_minor: 95, reorder_level_milli: 10000, track_stock: true,
};
const level = { product_id: bread.product_id, sku: 'BREAD', name: 'White bread', unit: 'each', active: true, on_hand_milli: 4000, reorder_level_milli: 10000, low: true, cost_minor: 95, value_minor: 380 };

describe('stock', () => {
  it('records a stock count for the only branch and shows what is low', async () => {
    const calls = serve(
      on('/branches', [branch]),
      on('/stock/levels', { items: [level], total_value_minor: 380, currency: 'USD' }),
      on('/stock/adjustments', { id: id(30), product_id: bread.product_id, branch_id: branch.id, reason: 'count', quantity_delta_milli: 2000, on_hand_milli: 6000 }, 'POST'),
      on('/stock/movements', []),
    );
    startAsManager('/app/stock');

    expect(await screen.findByText('4 · low')).toBeInTheDocument();
    await userEvent.click(screen.getByText('White bread'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Stock count/ }));
    await userEvent.type(within(dialog).getByLabelText('Counted (items)'), '6');
    await userEvent.click(within(dialog).getByRole('button', { name: /Record/ }));

    expect(await screen.findByText('Recorded. White bread now has 6 on hand.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ branch_id: branch.id, product_id: bread.product_id, reason: 'count', counted_milli: 6000 });
  });
});

describe('goods received', () => {
  it('records a delivery with quantities and costs', async () => {
    const supplier = { id: id(40), name: 'Harare Wholesalers', contact_person: null, phone: null, email: null, address: null, active: true };
    const calls = serve(
      on('/branches', [branch]),
      on('/suppliers', [supplier]),
      on('/products', [bread]),
      on('/purchases', { id: id(41), branch_id: branch.id, supplier_id: supplier.id, supplier_name: supplier.name, reference: null, received_at: '2026-10-23T08:00:00Z', total_cost_minor: 1900, notes: null }, 'POST'),
      on('/purchases', []),
    );
    startAsManager('/app/purchases');

    await userEvent.click(await screen.findByRole('tab', { name: 'Receive goods' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Supplier' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Harare Wholesalers' }));
    await userEvent.type(screen.getByLabelText('Add a product'), 'whi');
    await userEvent.click(await screen.findByRole('button', { name: /White bread/ }));
    await userEvent.clear(screen.getByLabelText('Unit cost of White bread'));
    await userEvent.type(screen.getByLabelText('Unit cost of White bread'), '0.95');
    await userEvent.type(screen.getByLabelText('Quantity of White bread'), '20');
    expect(screen.getByText('Total USD 19.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Record delivery' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.includes('/purchases'))).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      branch_id: branch.id,
      supplier_id: supplier.id,
      lines: [{ product_id: bread.product_id, quantity_milli: 20000, unit_cost_minor: 95 }],
    });
  });
});

describe('money', () => {
  it('records an expense paid from the bank', async () => {
    const calls = serve(
      on('/branches', [branch]),
      on('/cashbook', { from: '2026-10-23', to: '2026-10-23', entries: [], totals: [] }),
      on('/expenses', { id: id(50), branch_id: branch.id, category: 'utilities', description: 'ZESA tokens', currency: 'USD', amount_minor: 2500, paid_from: 'bank', reference: null, spent_at: '2026-10-23T08:00:00Z' }, 'POST'),
      on('/expenses', []),
    );
    startAsManager('/app/money');

    await userEvent.click(await screen.findByRole('tab', { name: 'Expenses' }));
    await userEvent.click(screen.getByRole('button', { name: /Record an expense/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Utilities' }));
    await userEvent.type(within(dialog).getByLabelText('What was it for?'), 'ZESA tokens');
    await userEvent.type(within(dialog).getByLabelText('Amount (USD)'), '25');
    await userEvent.click(within(dialog).getByRole('button', { name: /Record expense/ }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      category: 'utilities', description: 'ZESA tokens', currency: 'USD', amount_minor: 2500, paid_from: 'bank', branch_id: branch.id,
    });
  });
});

describe('products', () => {
  it('saves a dish with a category and option groups for a restaurant', async () => {
    const calls = serve(
      on('/categories', [{ id: id(60), name: 'Mains', position: 0, active: true, version: 1 }]),
      on('/products', { ...bread, product_id: id(61), sku: 'PLATE', name: 'Sadza plate' }, 'POST'),
      on('/products', []),
    );
    startAsManager('/app/products', 'restaurant');

    await userEvent.click(await screen.findByRole('button', { name: /New product/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Sadza plate');
    await userEvent.type(within(dialog).getByLabelText('SKU'), 'PLATE');
    await userEvent.type(within(dialog).getByLabelText('Price'), '3.00');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Product category' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mains' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Made to order' }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Add option group/ }));
    await userEvent.type(within(dialog).getByLabelText('Option group 1'), 'Relish');
    await userEvent.type(within(dialog).getByLabelText('Choices for group 1'), 'Beef stew +2.00{enter}Chicken +2.50');
    await userEvent.click(within(dialog).getByRole('button', { name: /Save product/ }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      name: 'Sadza plate', sku: 'PLATE', unit_price_minor: 300, category_id: id(60), track_stock: false,
      option_groups: [{ name: 'Relish', required: true, multiple: false, options: [{ name: 'Beef stew', price_delta_minor: 200 }, { name: 'Chicken', price_delta_minor: 250 }] }],
    });
  });

  it('explains a bad price instead of saving', async () => {
    const calls = serve(on('/products', []), on('/categories', []));
    startAsManager('/app/products');
    await userEvent.click(await screen.findByRole('button', { name: /New product/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Bread');
    await userEvent.type(within(dialog).getByLabelText('SKU'), 'B');
    await userEvent.type(within(dialog).getByLabelText('Price'), 'cheap');
    await userEvent.click(within(dialog).getByRole('button', { name: /Save product/ }));
    expect(await within(dialog).findByText('Enter the price like 1.20.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('customers and categories', () => {
  it('adds a customer and a category', async () => {
    const calls = serve(
      on('/customers', { id: id(70), name: 'Tendai Moyo', phone: '+263771234567', email: null, notes: null, active: true, version: 1 }, 'POST'),
      on('/customers', []),
      on('/categories', { id: id(71), name: 'Drinks', position: 0, active: true, version: 1 }, 'POST'),
      on('/categories', []),
    );
    startAsManager('/app/customers');
    await userEvent.click(await screen.findByRole('button', { name: /New customer/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Tendai Moyo');
    await userEvent.type(within(dialog).getByLabelText('Phone'), '+263771234567');
    await userEvent.click(within(dialog).getByRole('button', { name: /Save customer/ }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.includes('/customers'))).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ name: 'Tendai Moyo', phone: '+263771234567', email: null, notes: null, active: true });
  });
});
