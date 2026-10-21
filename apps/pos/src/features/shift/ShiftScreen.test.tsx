import { uuidv7 } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { ShiftScreen, type ShiftSummaryView } from './ShiftScreen';

const summary: ShiftSummaryView = {
  shift: { shift_id: uuidv7(), opened_at: '2026-10-22T06:00:00Z', opening_float: [{ currency: 'USD', amount_minor: 5000 }], closed: null },
  expected: [
    { currency: 'USD', amount_minor: 7350 },
    { currency: 'ZWG', amount_minor: 27_000 },
  ],
  activity: { sales: [{}, {}], refunds: [], movements: [] },
};

describe('ShiftScreen', () => {
  it('opens a shift with a float per currency', async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn(async () => undefined);
    await render(<ShiftScreen summary={null} currencies={['USD', 'ZWG']} onOpen={onOpen} onCash={jest.fn()} onClose={jest.fn()} />);

    await user.type(screen.getByLabelText('Opening float (USD)'), '50');
    await user.press(screen.getByRole('button', { name: 'Open shift' }));

    expect(onOpen).toHaveBeenCalledWith([
      { currency: 'USD', amount_minor: 5000 },
      { currency: 'ZWG', amount_minor: 0 },
    ]);
  });

  it('shows expected cash, records a safe drop, and reports over/short before closing', async () => {
    const user = userEvent.setup();
    const onCash = jest.fn(async () => undefined);
    const onClose = jest.fn(async () => undefined);
    await render(<ShiftScreen summary={summary} currencies={['USD', 'ZWG']} onOpen={jest.fn()} onCash={onCash} onClose={onClose} />);

    expect(screen.getByText('USD 73.50')).toBeOnTheScreen();
    expect(screen.getByText(/2 sales · 0 refunds/)).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Amount (USD)'), '20');
    await user.press(screen.getByRole('button', { name: 'Record cash taken out' }));
    expect(onCash).toHaveBeenCalledWith({ direction: 'out', currency: 'USD', amount_minor: 2000, reason: 'safe_drop' });

    await user.type(screen.getByLabelText('Counted (USD)'), '73');
    await user.type(screen.getByLabelText('Counted (ZWG)'), '270');
    expect(screen.getByText('USD short by 0.50')).toBeOnTheScreen();
    expect(screen.getByText('ZWG balances')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Close shift' }));
    expect(onClose).toHaveBeenCalledWith(
      [
        { currency: 'USD', amount_minor: 7300 },
        { currency: 'ZWG', amount_minor: 27_000 },
      ],
      undefined,
    );
  });

  it('prints the last closed shift when none is open, and the shift so far while one is', async () => {
    const user = userEvent.setup();
    const onPrintLast = jest.fn(async () => undefined);
    const onPrintCurrent = jest.fn(async () => undefined);
    const { rerender } = await render(
      <ShiftScreen summary={null} currencies={['USD']} onOpen={jest.fn()} onCash={jest.fn()} onClose={jest.fn()} onPrintLast={onPrintLast} />,
    );
    await user.press(screen.getByRole('button', { name: 'Print last shift report' }));
    expect(onPrintLast).toHaveBeenCalled();

    await rerender(<ShiftScreen summary={summary} currencies={['USD']} onOpen={jest.fn()} onCash={jest.fn()} onClose={jest.fn()} onPrintCurrent={onPrintCurrent} />);
    await user.press(screen.getByRole('button', { name: 'Print shift so far' }));
    expect(onPrintCurrent).toHaveBeenCalled();
  });
});
