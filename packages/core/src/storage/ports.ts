import type { SaleCompletedPayload, SyncAckResult, SyncEvent } from '../sync/events';
import type { LocalSyncState } from '../sync/state';

/**
 * Local storage port, implemented by
 *   - native: expo-sqlite (WAL mode, one write transaction per commit)
 *   - web:    IndexedDB (one readwrite transaction spanning every store touched)
 *   - tests:  an in-memory implementation that must pass the same contract suite
 *
 * The port is defined at the repository level rather than as raw SQL, because
 * SQLite and IndexedDB have different query and transaction models. Every
 * method that writes more than one record is atomic: all of it, or none of it.
 */

export interface StorageInfo {
  backend: 'expo-sqlite' | 'indexeddb' | 'memory';
  schemaVersion: number;
  /** Web: navigator.storage.persisted(). Native: always true (app sandbox). */
  persistent: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

export interface Migration {
  version: number;
  name: string;
}

export interface CatalogueProduct {
  product_id: string;
  sku: string;
  barcodes: string[];
  name: string;
  unit_price_minor: number;
  tax_code: string;
  tax_rate_bp: number;
  tax_inclusive: boolean;
  active: boolean;
  version: number;
}

export interface CatalogueSnapshot {
  catalogue_version: number;
  price_list_version: number;
  pulled_at: string;
  cursor: string;
}

export interface CatalogueRepository {
  /** Applies a page of pulled changes and advances the cursor atomically. */
  applyChanges(products: CatalogueProduct[], removedIds: string[], snapshot: CatalogueSnapshot): Promise<void>;
  findByBarcode(barcode: string): Promise<CatalogueProduct | null>;
  search(query: string, limit: number): Promise<CatalogueProduct[]>;
  snapshot(): Promise<CatalogueSnapshot | null>;
}

export interface OutboxEntry {
  event_id: string;
  device_sequence: number;
  event_type: SyncEvent['event_type'];
  aggregate_id: string;
  /** Exact serialized bytes sent on every attempt, so retries are byte-identical. */
  body: string;
  body_sha256: string;
  state: LocalSyncState;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  last_result: SyncAckResult | null;
  conflict_id: string | null;
  created_at: string;
  acknowledged_at: string | null;
}

export interface LocalSale {
  sale: SaleCompletedPayload;
  sync_state: LocalSyncState;
}

export interface SalesRepository {
  /**
   * Writes the sale, its lines, payments, stock movements AND the outbox entry
   * in one transaction, and allocates the next device_sequence inside it.
   */
  commitSale(event: Extract<SyncEvent, { event_type: 'sale.completed' }>): Promise<OutboxEntry>;
  get(saleId: string): Promise<LocalSale | null>;
  listRecent(limit: number): Promise<LocalSale[]>;
}

export interface OutboxRepository {
  /** Due entries in device_sequence order (local, or pending whose next_attempt_at has passed). */
  due(now: string, limit: number): Promise<OutboxEntry[]>;
  markAttempt(eventIds: string[], at: string): Promise<void>;
  markTransportFailure(eventIds: string[], error: string, nextAttemptAt: string): Promise<void>;
  applyAcknowledgements(
    acks: { event_id: string; result: SyncAckResult; conflict_id?: string; error?: string }[],
    at: string,
  ): Promise<void>;
  countByState(): Promise<Record<LocalSyncState, number>>;
  /** Highest device_sequence ever allocated; used to detect gaps after a restore. */
  lastSequence(): Promise<number>;
}

export interface KeyValueRepository {
  /** Non-secret settings only (selected printer, UI preferences). Secrets go to SecureStore. */
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface LocalStore {
  info(): Promise<StorageInfo>;
  /** Runs pending migrations in order, each in its own transaction. Never runs a migration twice. */
  migrate(): Promise<{ from: number; to: number; applied: Migration[] }>;
  readonly catalogue: CatalogueRepository;
  readonly sales: SalesRepository;
  readonly outbox: OutboxRepository;
  readonly settings: KeyValueRepository;
  /** Export everything unsynchronised as a signed JSON bundle for device recovery. */
  exportRecoveryBundle(): Promise<string>;
  close(): Promise<void>;
}
