import { uuidv7, type Cart, type CatalogueProduct, type PaymentMethodInfo } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { CheckoutScreen, type CheckoutServices } from './CheckoutScreen';

jest.mock('./ScannerModal', () => ({ ScannerModal: () => null }));

const product = (name: string, price: number, barcode: string, extra: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  product_id: uuidv7(), sku: name, name, unit: 'each', unit_price_minor: price, tax_code: 'VAT15', tax_rate_bp: 1500,
  tax_inclusive: true, active: true, barcodes: [barcode], version: 1, ...extra,
});
const method = (code: string, name: string, extra: Partial<PaymentMethodInfo> = {}): PaymentMethodInfo => ({
  id: uuidv7(), code, name, kind: 'cash', currencies: ['USD', 'ZWG'], initial_status: 'recorded', requires_reference: false,
  gives_change: false, active: true, position: 0, version: 1, ...extra,
});

const bread = product('White bread 700g', 120, '2000000000015');
const rice = product('Rice (per kg)', 180, '2000000000060', { unit: 'kg' });

function setup() {
  const completed: Cart[] = [];
  const services: CheckoutServices = {
    business: { id: uuidv7(), name: 'Shop', base_currency: 'USD', rounding: 'half_away_from_zero', tax_rounding: 'per_line' },
    paymentMethods: [
      method('cash', 'Cash', { gives_change: true }),
      method('ecocash', 'EcoCash', { initial_status: 'pending_confirmation', requires_reference: true }),
    ],
    rateFor: (c) => (c === 'ZWG' ? { id: uuidv7(), base_currency: 'USD', quote_currency: 'ZWG', rate: '0.03703704', version: 1, effective_at: '2026-10-21T08:00:00+00:00' } : null),
    findByBarcode: async (code) => [bread, rice].find((p) => p.barcodes.includes(code)) ?? null,
    search: async (text) => [bread, rice].filter((p) => p.name.toLowerCase().startsWith(text.toLowerCase())),
    newId: () => uuidv7(),
    complete: async (cart) => {
      completed.push(cart);
      return 'sale-1';
    },
    cameraAvailable: false,
  };
  const onCompleted = jest.fn();
  return { services, completed, onCompleted };
}

async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
  const input = screen.getByLabelText('Scan or search');
  await user.clear(input);
  await user.type(input, code, { submitEditing: true });
}

describe('CheckoutScreen', () => {
  it('adds items from a keyboard-style scanner and reports unknown barcodes', async () => {
    const user = userEvent.setup();
    const { services, onCompleted } = setup();
    await render(<CheckoutScreen services={services} onCompleted={onCompleted} />);

    await scan(user, '2000000000015');
    await scan(user, '2000000000015');
    expect(await screen.findByText('2 × USD 1.20')).toBeOnTheScreen();
    expect(screen.getAllByText('USD 2.40').length).toBeGreaterThan(0);

    await scan(user, '999');
    expect(await screen.findByText('No product with barcode 999.')).toBeOnTheScreen();
  });

  it('keeps back-to-back scans when the first lookup is still running', async () => {
    const user = userEvent.setup();
    const { services, onCompleted } = setup();
    const oil = product('Cooking oil 2L', 420, '2000000000053');
    const eggs = product('Eggs tray (30)', 550, '2000000000107');
    const pending: (() => void)[] = [];
    services.findByBarcode = (code) =>
      new Promise((resolve) => pending.push(() => resolve([oil, eggs].find((p) => p.barcodes.includes(code)) ?? null)));
    await render(<CheckoutScreen services={services} onCompleted={onCompleted} />);

    const input = screen.getByLabelText('Scan or search');
    await user.type(input, '2000000000053', { submitEditing: true });
    await user.type(input, '2000000000107', { submitEditing: true }); // before the first lookup finishes
    for (const resolve of pending) resolve();

    expect(await screen.findByText('Cooking oil 2L')).toBeOnTheScreen();
    expect(await screen.findByText('Eggs tray (30)')).toBeOnTheScreen();
  });

  it('finds products by name and asks for the weight of weighed goods', async () => {
    const user = userEvent.setup();
    const { services, onCompleted } = setup();
    await render(<CheckoutScreen services={services} onCompleted={onCompleted} />);

    await user.type(screen.getByLabelText('Scan or search'), 'ric');
    await user.press(await screen.findByRole('button', { name: 'Add Rice (per kg)' }));
    await user.type(screen.getByLabelText('Weight of Rice (per kg) (kg)'), '1.25');
    await user.press(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('1.250 kg × USD 1.80')).toBeOnTheScreen();
  });

  it('takes cash with change and completes the sale', async () => {
    const user = userEvent.setup();
    const { services, completed, onCompleted } = setup();
    await render(<CheckoutScreen services={services} onCompleted={onCompleted} />);
    await scan(user, '2000000000015');

    const complete = screen.getByRole('button', { name: 'Complete sale' });
    expect(complete).toBeDisabled();

    const amount = screen.getByLabelText('Amount (USD)');
    await user.clear(amount);
    await user.type(amount, '5');
    await user.press(screen.getByRole('button', { name: 'Add Cash payment' }));

    expect(await screen.findByText('USD 3.80')).toBeOnTheScreen(); // change
    await user.press(complete);
    expect(completed).toHaveLength(1);
    expect(onCompleted).toHaveBeenCalledWith('sale-1');
  });

  it('splits USD cash and ZWG EcoCash, which needs a reference', async () => {
    const user = userEvent.setup();
    const { services, completed, onCompleted } = setup();
    await render(<CheckoutScreen services={services} onCompleted={onCompleted} />);
    await scan(user, '2000000000015');

    const amount = screen.getByLabelText('Amount (USD)');
    await user.clear(amount);
    await user.type(amount, '0.50');
    await user.press(screen.getByRole('button', { name: 'Add Cash payment' }));

    await user.press(screen.getByRole('radio', { name: 'EcoCash' }));
    await user.press(screen.getByRole('radio', { name: 'ZWG' }));
    expect(screen.getByLabelText('Amount (ZWG)')).toHaveDisplayValue('18.90'); // covers the remaining 0.70 USD
    await user.press(screen.getByRole('button', { name: 'Add EcoCash payment' }));
    expect(await screen.findByText('Enter the EcoCash reference.')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('EcoCash reference'), 'MP241021');
    await user.press(screen.getByRole('button', { name: 'Add EcoCash payment' }));
    expect(await screen.findByText('EcoCash · MP241021 · awaiting confirmation')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Complete sale' }));
    expect(completed[0]!.tenders.map((t) => [t.currency, t.sale_currency_amount_minor, t.status])).toEqual([
      ['USD', 50, 'recorded'],
      ['ZWG', 70, 'pending_confirmation'],
    ]);
  });

  it('adds items by category and names the customer on the sale', async () => {
    const user = userEvent.setup();
    const { services, completed, onCompleted } = setup();
    const bakery = { id: uuidv7(), name: 'Bakery', position: 0, active: true, version: 1 };
    const tendai = { id: uuidv7(), name: 'Tendai Moyo', phone: '+263 77 123 4567', active: true, version: 1 };
    services.categories = async () => [bakery];
    services.inCategory = async (id) => (id === bakery.id ? [bread] : []);
    services.searchCustomers = async (text) => (/tend|771/i.test(text) ? [tendai] : []);
    await render(<CheckoutScreen services={services} onCompleted={onCompleted} />);

    await user.press(await screen.findByRole('tab', { name: 'Bakery' }));
    await user.press(await screen.findByRole('button', { name: 'Add White bread 700g' }));
    expect(await screen.findByText('1 × USD 1.20')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Customer (optional)'), '0771');
    await user.press(await screen.findByRole('button', { name: 'Choose Tendai Moyo' }));
    expect(screen.getByText('Customer: Tendai Moyo')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Add Cash payment' }));
    await user.press(screen.getByRole('button', { name: 'Complete sale' }));
    expect(completed[0]!.customer).toEqual({ id: tendai.id, name: 'Tendai Moyo' });
  });
});
