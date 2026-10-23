import { DEFAULT_PRINTER_SETTINGS } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { PrinterScreen } from './PrinterScreen';

describe('PrinterScreen', () => {
  it('saves a target per kind of slip and the paper width, and prints a test slip', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn(async () => undefined);
    const onTestPrint = jest.fn(async () => undefined);
    await render(<PrinterScreen settings={DEFAULT_PRINTER_SETTINGS} width={42} rawBtAvailable onSave={onSave} onTestPrint={onTestPrint} />);

    const [receiptRawBt] = screen.getAllByRole('radio', { name: 'RawBT' });
    await user.press(receiptRawBt!);
    await user.press(screen.getByRole('radio', { name: 'Off' })); // only kitchen tickets can be off
    await user.press(screen.getByRole('radio', { name: '58 mm (32)' }));
    await user.press(screen.getByRole('button', { name: 'Print a test slip' }));
    expect(onTestPrint).toHaveBeenCalledWith('rawbt', 32);

    await user.press(screen.getByRole('button', { name: 'Save printer settings' }));
    expect(onSave).toHaveBeenCalledWith({ receipt: 'rawbt', kitchen: 'off', report: 'system' }, 32);
    expect(await screen.findByText('Printer settings saved.')).toBeOnTheScreen();
  });

  it('hides RawBT where it cannot work and shows print failures', async () => {
    const user = userEvent.setup();
    const onTestPrint = jest.fn(async () => {
      throw new Error('Printer is out of paper');
    });
    await render(<PrinterScreen settings={DEFAULT_PRINTER_SETTINGS} width={42} rawBtAvailable={false} onSave={jest.fn()} onTestPrint={onTestPrint} />);

    expect(screen.queryByRole('radio', { name: 'RawBT' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Print a test slip' }));
    expect(await screen.findByText('Printer is out of paper')).toBeOnTheScreen();
  });
});
