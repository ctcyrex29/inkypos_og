import { ApiError, uuidv7, type BackOfficeProduct, type CategoryInfo, type StockLevels } from '@inkypos/core';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import { BackOfficeScreen, rateFromQuotePerBase, type BackOfficeApi } from './BackOfficeScreen';
import { toInput } from './ProductsTab';

const branch = { id: uuidv7(), name: 'Main', code: 'MAIN' };
const bread: BackOfficeProduct = {
  product_id: uuidv7(), sku: 'BREAD-700', name: 'White bread 700g', unit: 'each', unit_price_minor: 120, tax_code: 'VAT15',
  tax_rate_bp: 1500, tax_inclusive: true, active: true, barcodes: ['2000000000015'], version: 1, category_id: null, cost_minor: 95, reorder_level_milli: 10000,
};
const levels = (onHand: number): StockLevels => ({
  items: [{ product_id: bread.product_id, sku: bread.sku, name: bread.name, unit: 'each', active: true, on_hand_milli: onHand, reorder_level_milli: 10000, low: onHand <= 10000, cost_minor: 95, value_minor: Math.round((onHand * 95) / 1000) }],
  total_value_minor: Math.round((onHand * 95) / 1000),
  currency: 'USD',
});

function fakeApi(overrides: Partial<BackOfficeApi> = {}): BackOfficeApi & Record<string, jest.Mock> {
  const categories: CategoryInfo[] = [];
  return {
    listProducts: jest.fn(async () => [bread]),
    createProduct: jest.fn(async (input) => ({ ...bread, ...input, product_id: uuidv7() })),
    updateProduct: jest.fn(async (_id, input) => ({ ...bread, ...input })),
    listPaymentMethods: jest.fn(async () => []),
    updatePaymentMethod: jest.fn(),
    listExchangeRates: jest.fn(async () => []),
    setExchangeRate: jest.fn(async (quote, rate) => ({ id: uuidv7(), base_currency: 'USD', quote_currency: quote, rate, version: 4, effective_at: '2026-10-22T08:00:00+00:00' })),
    listBranches: jest.fn(async () => [branch]),
    listCategories: jest.fn(async () => [...categories]),
    createCategory: jest.fn(async (input) => {
      const c = { id: uuidv7(), name: input.name, position: input.position ?? 0, active: true, version: 1 };
      categories.push(c);
      return c;
    }),
    updateCategory: jest.fn(),
    listCustomers: jest.fn(async () => []),
    customerHistory: jest.fn(),
    createCustomer: jest.fn(),
    updateCustomer: jest.fn(),
    listSuppliers: jest.fn(async () => [{ id: uuidv7(), name: 'Harare Wholesalers', contact_person: null, phone: null, email: null, address: null, active: true }]),
    createSupplier: jest.fn(),
    updateSupplier: jest.fn(),
    stockLevels: jest.fn(async () => levels(24000)),
    stockMovements: jest.fn(async () => []),
    adjustStock: jest.fn(async (body) => ({ id: uuidv7(), product_id: bread.product_id, branch_id: branch.id, reason: body.reason, quantity_delta_milli: -15000, on_hand_milli: 9000 })),
    listPurchases: jest.fn(async () => []),
    recordPurchase: jest.fn(async () => ({ id: uuidv7(), branch_id: branch.id, supplier_id: uuidv7(), supplier_name: 'Harare Wholesalers', reference: null, received_at: '2026-10-23T08:00:00Z', total_cost_minor: 1900, notes: null })),
    ...overrides,
  } as never;
}

describe('rateFromQuotePerBase', () => {
  it('turns "1 USD = 27 ZWG" into the stored USD-per-ZWG rate', () => {
    expect(rateFromQuotePerBase('27')).toBe('0.03703704');
    expect(rateFromQuotePerBase('26,95')).toBe('0.03710575');
    expect([rateFromQuotePerBase('0'), rateFromQuotePerBase('-3'), rateFromQuotePerBase('abc')]).toEqual([null, null, null]);
  });
});

describe('product form', () => {
  const form = { sku: 'S', name: 'Sugar', price: '2.90', unit: 'each' as const, tax_code: 'VAT15', tax_rate: '15', tax_inclusive: true, active: true, barcodes: '', category_id: null };
  it('keeps cost and low-stock level optional, and checks them when given', () => {
    expect(toInput({ ...form, cost: '', reorder: '' })).toMatchObject({ cost_minor: null, reorder_level_milli: null });
    expect(toInput({ ...form, cost: '2.15', reorder: '2.5' })).toMatchObject({ cost_minor: 215, reorder_level_milli: 2500 });
    expect(toInput({ ...form, cost: '', reorder: '0' })).toMatchObject({ reorder_level_milli: 0 });
    expect(toInput({ ...form, cost: 'cheap', reorder: '' })).toBe('Enter the cost like 0.95, or leave it empty');
    expect(toInput({ ...form, cost: '', reorder: 'lots' })).toBe('Enter the low-stock level as a quantity, e.g. 5 or 2.5');
  });
});

describe('BackOfficeScreen', () => {
  it('creates a product from the form', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    await render(<BackOfficeScreen api={api} businessName="Demo Shop" onSignOut={jest.fn()} />);

    expect(await screen.findByText('White bread 700g')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'New product' }));
    await user.type(screen.getByLabelText('Name'), 'Sugar 2kg');
    await user.type(screen.getByLabelText('SKU'), 'SUGAR-2KG');
    await user.type(screen.getByLabelText('Price (USD)'), '2.90');
    await user.type(screen.getByLabelText('Barcodes (comma separated)'), '2000000000039, 600123');
    await user.type(screen.getByLabelText('Cost (USD)'), '2.15');
    await user.press(screen.getByRole('button', { name: 'Save product' }));

    expect(api.createProduct).toHaveBeenCalledWith({
      sku: 'SUGAR-2KG', name: 'Sugar 2kg', unit_price_minor: 290, unit: 'each', tax_code: 'VAT15', tax_rate_bp: 1500,
      tax_inclusive: true, active: true, barcodes: ['2000000000039', '600123'], category_id: null, cost_minor: 215, reorder_level_milli: null,
    });
  });

  it('shows the server reason when a save is refused', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      updateProduct: jest.fn(async () => {
        throw new ApiError('The given data was invalid.', 'validation_failed', 422, 'r', false, { sku: ['The sku has already been taken.'] });
      }),
    });
    await render(<BackOfficeScreen api={api} businessName="Demo Shop" onSignOut={jest.fn()} />);

    await user.press(await screen.findByRole('button', { name: 'Edit White bread 700g' }));
    await user.press(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByText('The sku has already been taken.')).toBeOnTheScreen();
  });

  it('adds a category and offers it on the product form', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    await render(<BackOfficeScreen api={api} businessName="Demo Shop" onSignOut={jest.fn()} />);

    await user.press(screen.getByRole('radio', { name: 'Categories' }));
    await user.type(await screen.findByLabelText('New category'), 'Bakery');
    await user.press(screen.getByRole('button', { name: 'Add category' }));
    expect(api.createCategory).toHaveBeenCalledWith({ name: 'Bakery', position: 0 });
    expect(await screen.findByText('Bakery')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Products' }));
    await user.press(await screen.findByRole('button', { name: 'Edit White bread 700g' }));
    await user.press(await screen.findByRole('radio', { name: 'Bakery' }));
    await user.press(screen.getByRole('button', { name: 'Save product' }));
    expect(api.updateProduct).toHaveBeenCalledWith(bread.product_id, expect.objectContaining({ category_id: expect.any(String) }));
  });

  it('records a stock count for the only branch', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    await render(<BackOfficeScreen api={api} businessName="Demo Shop" onSignOut={jest.fn()} />);

    await user.press(screen.getByRole('radio', { name: 'Stock' }));
    expect(await screen.findByText('Stock value at last cost: USD 22.80')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Stock for White bread 700g' }));
    await user.press(screen.getByRole('radio', { name: 'Stock count' }));
    await user.type(screen.getByLabelText('Counted (items)'), '9');
    (api.stockLevels as jest.Mock).mockResolvedValue(levels(9000));
    await user.press(screen.getByRole('button', { name: 'Record' }));

    expect(api.adjustStock).toHaveBeenCalledWith({ branch_id: branch.id, product_id: bread.product_id, reason: 'count', counted_milli: 9000 });
    expect(await screen.findByText('Recorded. White bread 700g now has 9 on hand.')).toBeOnTheScreen();
  });

  it('records a delivery with its total', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    await render(<BackOfficeScreen api={api} businessName="Demo Shop" onSignOut={jest.fn()} />);

    await user.press(screen.getByRole('radio', { name: 'Goods received' }));
    await user.press(await screen.findByRole('radio', { name: 'Receive goods' }));
    await user.press(await screen.findByRole('radio', { name: 'Harare Wholesalers' }));
    await user.type(screen.getByLabelText('Add a product'), 'whi');
    await user.press(await screen.findByRole('button', { name: 'Add White bread 700g' }));
    expect(screen.getByLabelText('Unit cost of White bread 700g')).toHaveDisplayValue('0.95'); // last cost suggested
    await user.type(screen.getByLabelText('Quantity of White bread 700g'), '20');
    expect(screen.getByText('Total USD 19.00')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Record delivery' }));

    expect(api.recordPurchase).toHaveBeenCalledWith({
      branch_id: branch.id, supplier_id: expect.any(String), lines: [{ product_id: bread.product_id, quantity_milli: 20000, unit_cost_minor: 95 }],
    });
    expect(within(screen.getByRole('radio', { name: 'Deliveries' })).getByText('Deliveries')).toBeOnTheScreen();
  });

  it('sets the ZWG rate from a "ZWG per USD" figure', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    await render(<BackOfficeScreen api={api} businessName="Demo Shop" onSignOut={jest.fn()} />);

    await user.press(screen.getByRole('radio', { name: 'Exchange rates' }));
    expect(await screen.findByText('No ZWG rate set')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('ZWG per 1 USD'), '27');
    await user.press(screen.getByRole('button', { name: 'Set new rate' }));

    expect(api.setExchangeRate).toHaveBeenCalledWith('ZWG', '0.03703704');
    expect(await screen.findByText('Saved: 1 ZWG = 0.03703704 USD (version 4).')).toBeOnTheScreen();
  });
});
