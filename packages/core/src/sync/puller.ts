import { ApiError } from '../api/client';
import type { LocalStore } from '../storage/ports';
import type { SyncPullResponse } from './events';

export interface PullTransport {
  pull(cursor: string): Promise<SyncPullResponse>;
}

export interface PullResult {
  pages: number;
  changes: number;
  complete: boolean;
  error?: { code: string; message: string };
}

/**
 * Brings the till's reference data (catalogue, payment types, rates, business
 * details) up to date. Each page is applied atomically together with its
 * cursor, so an interrupted pull simply resumes where it stopped.
 */
export class CataloguePuller {
  private running: Promise<PullResult> | null = null;

  constructor(
    private readonly store: LocalStore,
    private readonly transport: PullTransport,
    private readonly maxPages = 50,
  ) {}

  pullOnce(): Promise<PullResult> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<PullResult> {
    let pages = 0;
    let changes = 0;
    try {
      for (; pages < this.maxPages; ) {
        const cursor = await this.store.reference.cursor();
        const page = await this.transport.pull(cursor);
        await this.store.reference.applyPull(page.changes, page.next_cursor);
        pages++;
        changes += page.changes.length;
        if (!page.has_more) return { pages, changes, complete: true };
      }
      return { pages, changes, complete: false };
    } catch (e) {
      const error =
        e instanceof ApiError ? { code: e.code, message: e.message } : { code: (e as Error).name ?? 'error', message: (e as Error).message ?? String(e) };
      return { pages, changes, complete: false, error };
    }
  }
}
