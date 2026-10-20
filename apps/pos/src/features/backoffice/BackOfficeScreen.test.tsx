import { ApiError, uuidv7, type CatalogueProduct } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { BackOfficeScreen, rateFromQuotePerBase, type BackOfficeApi } from './BackOfficeScreen';

const bread: CatalogueProduct = {
  product_id: uuidv7(), sku: 'BREAD-700', name: 'White bread 700g', unit: 'each', unit_price_minor: 120, tax_code: 'VAT15',
  tax_rate_bp: 1500, tax_inclusive: true, active: true, barcodes: ['2000000000015'], version: 1,
};

function fakeApi(overrides: Partial<BackOfficeApi> = {}): BackOfficeApi & Record<string, jest.Mock> {
  return {
    listProducts: jest.fn(async () => [bread]),
    createProduct: jest.fn(async (input) => ({ ...bread, ...input, product_id: uuidv7() })),
    updateProduct: jest.fn(async (_id, input) => ({ ...bread, ...input })),
    listPaymentMethods: jest.fn(async () => []),
    updatePaymentMethod: jest.fn(),
    listExchangeRates: jest.fn(async () => []),
    setExchangeRate: jest.fn(async (quote, rate) => ({ id: uuidv7(), base_currency: 'USD', quote_currency: quote, rate, version: 4, effective_at: '2026-10-22T08:00:00+00:00' })),
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
    await user.press(screen.getByRole('button', { name: 'Save product' }));

    expect(api.createProduct).toHaveBeenCalledWith({
      sku: 'SUGAR-2KG', name: 'Sugar 2kg', unit_price_minor: 290, unit: 'each', tax_code: 'VAT15', tax_rate_bp: 1500,
      tax_inclusive: true, active: true, barcodes: ['2000000000039', '600123'],
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
