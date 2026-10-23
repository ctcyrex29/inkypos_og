import { buildTestPage, createLocalStore, MemoryDatabase, MemoryDriver, rawBtLinks } from '@inkypos/core';
import { PrintError, printDocument, savePrinterSettings, type PrintPorts } from './printer';

async function setup(platform: PrintPorts['platform'], rawBt = true) {
  const store = createLocalStore(new MemoryDriver(new MemoryDatabase()));
  await store.migrate();
  const ports = {
    systemPrint: jest.fn(async () => undefined),
    openUrl: jest.fn(async () => undefined),
    navigate: jest.fn(),
    platform,
    rawBtAvailable: () => rawBt,
  } satisfies PrintPorts;
  return { store, ports };
}

const doc = buildTestPage(32, 'rawbt', 'now');

describe('printDocument', () => {
  it('uses the system print dialog by default', async () => {
    const { store, ports } = await setup('android');
    expect(await printDocument(store, 'receipt', doc, 'Receipt', ports)).toBe('system');
    expect(ports.systemPrint).toHaveBeenCalledWith(expect.stringContaining('InkyPOS test print'));
  });

  it('hands ESC/POS bytes to RawBT: an app link natively, a Chrome intent on the web', async () => {
    const native = await setup('android');
    await savePrinterSettings(native.store, { receipt: 'rawbt', kitchen: 'off', report: 'system' });
    expect(await printDocument(native.store, 'receipt', doc, 'Receipt', native.ports)).toBe('rawbt');
    expect(native.ports.openUrl).toHaveBeenCalledWith(rawBtLinks(doc).app);

    const web = await setup('web');
    await savePrinterSettings(web.store, { receipt: 'rawbt', kitchen: 'system', report: 'system' });
    await printDocument(web.store, 'receipt', doc, 'Receipt', web.ports);
    expect(web.ports.navigate).toHaveBeenCalledWith(rawBtLinks(doc).browser);
  });

  it('skips kitchen tickets when they are off', async () => {
    const { store, ports } = await setup('android');
    await savePrinterSettings(store, { receipt: 'system', kitchen: 'off', report: 'system' });
    expect(await printDocument(store, 'kitchen', doc, 'Order 1', ports)).toBe('off');
    expect(ports.systemPrint).not.toHaveBeenCalled();
  });

  it('explains what to do when RawBT cannot be used', async () => {
    const ios = await setup('ios', false);
    await savePrinterSettings(ios.store, { receipt: 'rawbt', kitchen: 'system', report: 'system' });
    await expect(printDocument(ios.store, 'receipt', doc, 'Receipt', ios.ports)).rejects.toThrow(/Android only/);

    const missing = await setup('android');
    missing.ports.openUrl.mockRejectedValueOnce(new Error('No Activity found'));
    await savePrinterSettings(missing.store, { receipt: 'rawbt', kitchen: 'system', report: 'system' });
    await expect(printDocument(missing.store, 'receipt', doc, 'Receipt', missing.ports)).rejects.toThrow(PrintError);
  });

  it('lets the test print use a choice that is not saved yet', async () => {
    const { store, ports } = await setup('android');
    expect(await printDocument(store, 'receipt', doc, 'Test', ports, { receipt: 'rawbt' })).toBe('rawbt');
  });
});
