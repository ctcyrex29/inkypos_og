import { buildRefund, buildSampleSale, uuidv7, type PaymentMethodInfo } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { RefundScreen } from './RefundScreen';

const newId = () => uuidv7();
const ctx = { newId, tenantId: newId(), branchId: newId(), registerId: newId(), deviceId: newId(), actorId: newId() };
const sale = { ...buildSampleSale(ctx, 2).payload, receipt_number: 'T1-000042' }; // 2 bread (2.40), milk (0.95)
const cash: PaymentMethodInfo = {
  id: newId(), code: 'cash', name: 'Cash', kind: 'cash', currencies: ['USD'], initial_status: 'recorded',
  requires_reference: false, gives_change: true, active: true, position: 0, version: 1,
};

describe('RefundScreen', () => {
  it('previews the refund and passes the selection on', async () => {
    const user = userEvent.setup();
    const onRefund = jest.fn(async () => undefined);
    await render(<RefundScreen sale={sale} previous={[]} payoutMethods={[cash]} newId={newId} onRefund={onRefund} onVoid={jest.fn()} />);

    await user.type(screen.getAllByLabelText('Return (up to 2)')[0]!, '1');
    expect(await screen.findByText('Refund USD 1.20')).toBeOnTheScreen();
    await user.press(screen.getAllByRole('radio', { name: 'Back to stock' })[0]!);
    await user.press(screen.getByRole('button', { name: 'Refund selected items' }));

    expect(onRefund).toHaveBeenCalledWith([{ original_line_id: sale.lines[0]!.line_id, quantity_milli: 1000, restock: false }], 'customer_return', 'cash', undefined);
  });

  it('explains when more is asked back than is left', async () => {
    const user = userEvent.setup();
    const earlier = buildRefund(sale, [], [{ original_line_id: sale.lines[0]!.line_id, quantity_milli: 1000, restock: true }], {
      ...ctx, payoutMethodCode: 'cash', reason: 'customer_return', now: () => new Date(),
    }).payload;
    await render(<RefundScreen sale={sale} previous={[earlier]} payoutMethods={[cash]} newId={newId} onRefund={jest.fn()} onVoid={jest.fn()} />);

    expect(screen.getByText(/1 already refunded/)).toBeOnTheScreen();
    await user.type(screen.getAllByLabelText('Return (up to 1)')[0]!, '2');
    expect(await screen.findByText('Only 1 of Sample bread 700g can still be refunded.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Refund selected items' })).toBeDisabled();
  });

  it('voids the whole sale', async () => {
    const user = userEvent.setup();
    const onVoid = jest.fn(async () => undefined);
    await render(<RefundScreen sale={sale} previous={[]} payoutMethods={[cash]} newId={newId} onRefund={jest.fn()} onVoid={onVoid} />);

    await user.press(screen.getByRole('button', { name: 'Void whole sale' }));
    expect(onVoid).toHaveBeenCalledWith('cash', undefined);
  });
});
