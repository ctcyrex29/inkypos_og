import { createLocalStore, MemoryDatabase, MemoryDriver, STORAGE_CONTRACT, uuidv7, type HarnessFactory } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { DiagnosticsScreen } from './DiagnosticsScreen';

const memoryHarness: HarnessFactory = async () => {
  const data = new MemoryDatabase();
  return {
    open: async (migrations) => createLocalStore(new MemoryDriver(data), migrations ? { migrations } : {}),
    destroy: async () => undefined,
  };
};

async function tillStore() {
  const store = createLocalStore(new MemoryDriver());
  await store.migrate();
  return store;
}

describe('DiagnosticsScreen', () => {
  it('shows storage health and warns when storage is not protected', async () => {
    await render(<DiagnosticsScreen store={await tillStore()} makeHarness={memoryHarness} newId={() => uuidv7()} />);

    expect(await screen.findByText('memory')).toBeOnTheScreen();
    expect(screen.getByText('Browser storage is not protected')).toBeOnTheScreen();
    expect(screen.getByText('0 (0 need review, 0 synced)')).toBeOnTheScreen();
  });

  it('runs the storage contract on demand and reports every check', async () => {
    const user = userEvent.setup();
    await render(<DiagnosticsScreen store={await tillStore()} makeHarness={memoryHarness} newId={() => uuidv7()} />);

    await user.press(screen.getByRole('button', { name: 'Run storage self-test' }));

    expect(await screen.findByText(`All ${STORAGE_CONTRACT.length} checks passed`)).toBeOnTheScreen();
    expect(screen.getAllByText('PASS')).toHaveLength(STORAGE_CONTRACT.length);
  });
});
