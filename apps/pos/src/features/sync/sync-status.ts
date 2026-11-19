import type { IconName } from '@/ui/components';
import type { Colors } from '@/ui/theme';
import type { SyncState } from '@/services/sync-context';

export interface SyncSummary {
  /** Short label for a pill: "Synced", "Offline", "3 waiting". */
  label: string;
  /** One sentence for under the pill. */
  detail: string;
  icon: IconName;
  color: string;
  online: boolean | null;
}

/** How the till's connection and outbox read at a glance (home screen, lock screen). */
export function syncSummary(sync: Pick<SyncState, 'counts' | 'lastRun' | 'lastPull' | 'running'>, colors: Colors): SyncSummary {
  const waiting = sync.counts ? sync.counts.local + sync.counts.pending : 0;
  const review = sync.counts?.needs_review ?? 0;
  const failed = sync.lastRun?.result.stoppedBy === 'transport' || sync.lastRun?.result.stoppedBy === 'auth' || !!sync.lastPull?.result.error;
  const online = sync.lastRun ? !failed : null;

  if (sync.running) return { label: 'Syncing…', detail: 'Sending sales and fetching updates.', icon: 'sync', color: colors.primary, online };
  if (review > 0) return { label: `${review} to review`, detail: 'A manager must check some sales.', icon: 'alert-circle', color: colors.danger, online };
  if (online === false) {
    return {
      label: 'Offline',
      detail: waiting > 0 ? `${waiting} sale${waiting === 1 ? '' : 's'} saved on this phone. They send when you are back online.` : 'You can keep selling. Sales are saved on this phone.',
      icon: 'cloud-offline',
      color: colors.warning,
      online,
    };
  }
  if (waiting > 0) return { label: `${waiting} waiting`, detail: `${waiting} sale${waiting === 1 ? '' : 's'} waiting to send.`, icon: 'cloud-upload', color: colors.warning, online };
  return { label: 'Synced', detail: 'Everything is up to date.', icon: 'cloud-done', color: colors.success, online };
}
