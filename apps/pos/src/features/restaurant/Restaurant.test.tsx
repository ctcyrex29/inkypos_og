import { chooseOptions, newOrder, addToOrder, sendToKitchen, uuidv7, type CatalogueProduct, type OpenOrder } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { fromDrafts, toDrafts } from '@inkypos/core';
import { KitchenScreen } from './KitchenScreen';
import { OrderScreen, type OrderServices } from './OrderScreen';
import { OrdersScreen } from './OrdersScreen';

const newId = () => uuidv7();
const [beef, chicken, covo] = [newId(), newId(), newId()];
const plate: CatalogueProduct = {
  product_id: newId(), sku: 'PLATE', name: 'Sadza plate', unit: 'each', unit_price_minor: 300, tax_code: 'VAT15', tax_rate_bp: 1500,
  tax_inclusive: true, active: true, barcodes: [], version: 1,
  option_groups: [
    { id: newId(), name: 'Relish', required: true, multiple: false, options: [{ id: beef, name: 'Beef stew', price_delta_minor: 200 }, { id: chicken, name: 'Chicken', price_delta_minor: 250 }] },
    { id: newId(), name: 'Vegetable', required: false, multiple: true, options: [{ id: covo, name: 'Covo', price_delta_minor: 0 }] },
  ],
};
const mazoe: CatalogueProduct = { ...plate, product_id: newId(), sku: 'MAZOE', name: 'Mazoe orange', unit_price_minor: 100, option_groups: [] };
const business = { base_currency: 'USD' as const, rounding: 'half_away_from_zero' as const };
const money = (m: number) => `USD ${(m / 100).toFixed(2)}`;
const now = new Date('2026-10-23T12:00:00Z');
const order = (): OpenOrder => newOrder({ orderId: newId(), orderNumber: 7, orderDay: '2026-10-23', serviceType: 'sit_in', table: '4', now });

describe('options editor', () => {
  it('round-trips groups, keeping ids of unchanged choices and pricing "+0.50" lines', () => {
    const drafts = toDrafts(plate.option_groups);
    expect(drafts[0]!.text).toBe('Beef stew +2.00\nChicken +2.50');
    drafts[0]!.text += '\nMatemba +1.50';
    const groups = fromDrafts(drafts, plate.option_groups);
    if (typeof groups === 'string') throw new Error(groups);
    expect(groups[0]!.options).toEqual([
      { id: beef, name: 'Beef stew', price_delta_minor: 200 },
      { id: chicken, name: 'Chicken', price_delta_minor: 250 },
      { name: 'Matemba', price_delta_minor: 150 },
    ]);
    expect(fromDrafts([{ name: 'Relish', required: true, multiple: false, text: '' }], undefined)).toBe('Add at least one choice to Relish.');
    expect(fromDrafts([{ name: '', required: true, multiple: false, text: 'x' }], undefined)).toBe('Give every option group a name, e.g. Relish.');
  });
});

describe('OrdersScreen', () => {
  it('starts a sit-in order for a table and lists open orders', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn(async () => undefined);
    const open = addToOrder(order(), mazoe, newId, now);
    await render(<OrdersScreen orders={[open]} business={business} money={money} onOpen={jest.fn()} onCreate={onCreate} />);

    expect(screen.getByRole('button', { name: 'Order 7, Table 4' })).toBeOnTheScreen();
    expect(screen.getByText('1 item · USD 1.00')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Table (sit-in)'), '12');
    await user.press(screen.getByRole('button', { name: 'Sit-in order' }));
    expect(onCreate).toHaveBeenCalledWith('sit_in', '12');
  });
});

describe('OrderScreen', () => {
  function services(overrides: Partial<OrderServices> = {}): OrderServices {
    return {
      business, money, newId,
      search: async (text) => [plate, mazoe].filter((p) => p.name.toLowerCase().startsWith(text.toLowerCase())),
      categories: async () => [],
      inCategory: async () => [],
      save: jest.fn(async () => undefined),
      send: jest.fn(async (o) => ({ order: sendToKitchen(o, now).order })),
      pay: jest.fn(),
      ...overrides,
    };
  }

  it('adds a plate with its choices and a note, sends it, and offers to pay', async () => {
    const user = userEvent.setup();
    const s = services();
    await render(<OrderScreen order={order()} services={s} />);

    await user.type(screen.getByLabelText('Find an item'), 'sad');
    await user.press(await screen.findByRole('button', { name: 'Add Sadza plate' }));
    await user.press(screen.getByRole('radio', { name: 'Chicken' }));
    await user.press(screen.getByRole('checkbox', { name: 'Covo' }));
    await user.type(screen.getByLabelText('Note for the kitchen'), 'sadza rakaoma');
    await user.press(screen.getByRole('button', { name: 'Add for USD 5.50' }));

    expect(await screen.findByText('Chicken, Covo')).toBeOnTheScreen();
    expect(screen.getByText('Note: sadza rakaoma')).toBeOnTheScreen();
    expect(s.save).toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Send 1 to kitchen' }));
    expect(s.send).toHaveBeenCalled();
    expect(await screen.findByText('In the kitchen')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Pay all USD 5.50' }));
    expect(s.pay).toHaveBeenCalledWith(expect.objectContaining({ order_number: 7 }));
  });

  it('pays for ticked items only, to split the bill', async () => {
    const user = userEvent.setup();
    const s = services();
    let o = addToOrder(order(), plate, newId, now, { options: chooseOptions(plate, [beef]) });
    o = addToOrder(o, mazoe, newId, now);
    await render(<OrderScreen order={o} services={s} />);

    await user.press(screen.getByRole('checkbox', { name: 'Pay for Mazoe orange' }));
    await user.press(screen.getByRole('button', { name: 'Pay selected USD 1.00' }));
    expect(s.pay).toHaveBeenCalledWith(expect.anything(), [o.lines[1]!.line_id]);
  });

  it('splits the whole bill evenly between a number of people', async () => {
    const user = userEvent.setup();
    const s = services();
    await render(<OrderScreen order={addToOrder(order(), mazoe, newId, now)} services={s} />);

    await user.press(screen.getByRole('button', { name: 'Split between 3' }));
    expect(s.pay).toHaveBeenCalledWith(expect.objectContaining({ order_number: 7 }), undefined, 3);
  });
});

describe('KitchenScreen', () => {
  it('shows sent orders with their choices and calls out ready ones', async () => {
    const user = userEvent.setup();
    const onAdvance = jest.fn();
    const sent = sendToKitchen(addToOrder(order(), plate, newId, now, { options: chooseOptions(plate, [beef]), note: 'no salt' }), now).order;
    const ready: OpenOrder = { ...sent, order_id: newId(), order_number: 8, status: 'ready' };
    const notSent = { ...addToOrder(order(), mazoe, newId, now), order_id: newId(), order_number: 9 };
    await render(<KitchenScreen orders={[sent, ready, notSent]} onAdvance={onAdvance} />);

    expect(screen.getByLabelText('Order 8 is ready')).toBeOnTheScreen();
    expect(screen.queryByText(/^9 ·/)).toBeNull();
    expect(screen.getAllByText('Note: no salt').length).toBeGreaterThan(0);
    await user.press(screen.getByRole('button', { name: 'Start preparing (order 7)' }));
    expect(onAdvance).toHaveBeenCalledWith(sent);
  });
});
