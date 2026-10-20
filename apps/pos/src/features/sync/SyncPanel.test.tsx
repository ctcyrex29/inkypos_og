import { buildSampleSale, uuidv7, type LocalSale, type LocalSyncState } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { SyncPanel } from './SyncPanel';

const ctx = { newId: () => uuidv7(), tenantId: uuidv7(), branchId: uuidv7(), registerId: uuidv7(), deviceId: uuidv7(), actorId: uuidv7() };

function sale(state: LocalSyncState, sequence: number): LocalSale {
  return { sale: buildSampleSale(ctx).payload, event_id: uuidv7(), device_sequence: sequence, sync_state: state };
}

const counts = (c: Partial<Record<LocalSyncState, number>>) => ({ local: 0, pending: 0, synced: 0, needs_review: 0, ...c });

describe('SyncPanel', () => {
  it('shows how many sales are waiting and a badge per sale', async () => {
    await render(
      <SyncPanel
        counts={counts({ local: 1, pending: 1, synced: 1 })}
        recent={[sale('local', 3), sale('pending', 2), sale('synced', 1)]}
        lastRun={null}
        running={false}
        onSyncNow={jest.fn()}
      />,
    );

    expect(screen.getByText('2 sales waiting to sync')).toBeOnTheScreen();
    expect(screen.getByText('Saved on till')).toBeOnTheScreen();
    expect(screen.getByText('Waiting to sync')).toBeOnTheScreen();
    expect(screen.getByText('Synced')).toBeOnTheScreen();
    expect(screen.getAllByText(/^USD 3\.35$/)).toHaveLength(3);
  });

  it('warns about sales that need review', async () => {
    await render(<SyncPanel counts={counts({ needs_review: 1, synced: 4 })} recent={[sale('needs_review', 5)]} lastRun={null} running={false} onSyncNow={jest.fn()} />);

    expect(screen.getByText('1 sale need review')).toBeOnTheScreen();
    expect(screen.getByText('Everything is synced')).toBeOnTheScreen();
    expect(screen.getByText('Needs review')).toBeOnTheScreen();
  });

  it('explains a failed attempt and offers a manual sync', async () => {
    const user = userEvent.setup();
    const onSyncNow = jest.fn();
    await render(
      <SyncPanel
        counts={counts({ pending: 2 })}
        recent={[]}
        lastRun={{ at: '2026-10-20T10:00:00Z', result: { sent: 0, acknowledged: 0, stoppedBy: 'transport', error: { code: 'network_error', message: 'offline' } } }}
        running={false}
        onSyncNow={onSyncNow}
      />,
    );

    expect(screen.getByText(/could not finish \(network_error\)\. It will retry automatically\./)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Sync now' }));
    expect(onSyncNow).toHaveBeenCalled();
  });

  it('only offers sample sales when given the developer action', async () => {
    await render(<SyncPanel counts={counts({})} recent={[]} lastRun={null} running={false} onSyncNow={jest.fn()} />);
    expect(screen.queryByText('Record sample sale (dev only)')).toBeNull();
  });
});
