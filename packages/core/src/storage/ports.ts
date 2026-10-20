import type {
  CashMovementPayload,
  RefundIssuedPayload,
  SaleCompletedPayload,
  ShiftClosedPayload,
  ShiftOpenedPayload,
  SyncAckResult,
  SyncEvent,
} from '../sync/events';
import type { LocalSyncState } from '../sync/state';
import type { BranchInfo, BusinessInfo, ExchangeRateInfo, PaymentMethodInfo, RegisterInfo, Unit } from '../catalogue/contracts';
import type { SyncPullResponse } from '../sync/events';
import type { MigrationReport, StorageHealth } from './driver';

/**
 * The till's local database, as used by the rest of the app. Implemented once
 * in local-store.ts on top of a StorageDriver (expo-sqlite, IndexedDB or memory).
 *
 * Every method that writes more than one record is atomic: all of it, or none of it.
 */

export type SaleCompletedEvent = Extract<SyncEvent, { event_type: 'sale.completed' }>;
/** A sale event before the store has allocated its device_sequence. */
export type UnsequencedSaleEvent = Omit<SaleCompletedEvent, 'device_sequence'>;
type Unsequenced<T extends SyncEvent['event_type']> = Omit<Extract<SyncEvent, { event_type: T }>, 'device_sequence'>;
export type UnsequencedRefundEvent = Unsequenced<'refund.issued'>;
export type UnsequencedShiftOpenedEvent = Unsequenced<'shift.opened'>;
export type UnsequencedShiftClosedEvent = Unsequenced<'shift.closed'>;
export type UnsequencedCashMovementEvent = Unsequenced<'cash.movement'>;

export interface StorageInfo extends StorageHealth {
  backend: 'expo-sqlite' | 'sqlite' | 'indexeddb' | 'memory';
  schemaVersion: number;
}

export interface CatalogueProduct {
  product_id: string;
  sku: string;
  barcodes: string[];
  name: string;
  unit: Unit;
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
  /** Applies a page of pulled changes and advances the snapshot atomically. */
  applyChanges(products: CatalogueProduct[], removedIds: string[], snapshot: CatalogueSnapshot): Promise<void>;
  findByBarcode(barcode: string): Promise<CatalogueProduct | null>;
  /** Case-insensitive name prefix search, active products first by name. */
  search(prefix: string, limit: number): Promise<CatalogueProduct[]>;
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
  event_id: string;
  device_sequence: number;
  sync_state: LocalSyncState;
}

export interface CommitSaleOptions {
  /** Receipt numbers usually embed the sequence, which is only known inside the transaction. */
  receiptNumber?: (deviceSequence: number) => string;
}

export interface SalesRepository {
  /**
   * Allocates the next device_sequence, validates the event, and writes the
   * sale, its stock movements and its outbox entry in one transaction.
   * A sale_id that already exists is refused; nothing is overwritten.
   */
  commitSale(event: UnsequencedSaleEvent, options?: CommitSaleOptions): Promise<OutboxEntry>;
  get(saleId: string): Promise<LocalSale | null>;
  listRecent(limit: number): Promise<LocalSale[]>;
}

export interface AckInput {
  event_id: string;
  result: SyncAckResult;
  conflict_id?: string;
  error?: string;
}

export interface OutboxRepository {
  /**
   * Open entries in device_sequence order, stopping at the first one still
   * backing off, so events always leave the device in order.
   */
  due(now: string, limit: number): Promise<OutboxEntry[]>;
  get(eventId: string): Promise<OutboxEntry | null>;
  markAttempt(eventIds: string[], at: string): Promise<void>;
  markTransportFailure(eventIds: string[], error: string, nextAttemptAt: string): Promise<void>;
  /** Unknown event ids are reported, never fatal. Entries are never deleted. */
  applyAcknowledgements(acks: AckInput[], at: string): Promise<{ applied: number; unknown: string[] }>;
  countByState(): Promise<Record<LocalSyncState, number>>;
  /** Highest device_sequence ever allocated; used to detect gaps after a restore. */
  lastSequence(): Promise<number>;
}

export type PullChange = SyncPullResponse['changes'][number];

/** Reference data pulled from the server (GET /sync/changes). */
export interface ReferenceRepository {
  /**
   * Validates and applies one page, then advances the cursor, atomically. A page
   * with malformed data is refused whole so the cursor never skips anything.
   */
  applyPull(changes: PullChange[], nextCursor: string): Promise<{ applied: number }>;
  cursor(): Promise<string>;
  /** Server change-log position the catalogue reflects; recorded on every sale. */
  catalogueVersion(): Promise<number>;
  business(): Promise<BusinessInfo | null>;
  branch(id: string): Promise<BranchInfo | null>;
  register(id: string): Promise<RegisterInfo | null>;
  /** Active methods in display order. */
  paymentMethods(): Promise<PaymentMethodInfo[]>;
  /** Newest rate for a pair, or null when none has been set. */
  exchangeRate(base: string, quote: string): Promise<ExchangeRateInfo | null>;
}

export interface StockRepository {
  /** Sum of local movements for a product, in thousandths of a unit. */
  localDeltaMilli(productId: string): Promise<number>;
}

export interface KeyValueRepository {
  /** Non-secret settings only (selected printer, UI preferences). Secrets go to SecureStore. */
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface RecoveryBundle {
  format: 'inkypos-recovery/v1';
  exported_at: string;
  last_sequence: number;
  /** Every outbox entry without a final server answer, in sequence order. */
  entries: Pick<OutboxEntry, 'event_id' | 'device_sequence' | 'event_type' | 'body' | 'body_sha256' | 'state'>[];
}

export class ShiftStateError extends Error {
  override readonly name = 'ShiftStateError';
}

export interface ShiftRecord extends ShiftOpenedPayload {
  closed: Pick<ShiftClosedPayload, 'closed_at' | 'expected_cash' | 'counted_cash' | 'note'> | null;
}

export interface ShiftsRepository {
  /** The open shift on this till, if any. At most one is open at a time. */
  current(): Promise<ShiftRecord | null>;
  get(shiftId: string): Promise<ShiftRecord | null>;
  recent(limit: number): Promise<ShiftRecord[]>;
  /** Refused while another shift is open. */
  open(event: UnsequencedShiftOpenedEvent): Promise<OutboxEntry>;
  /** Refused unless the shift is the open one. */
  close(event: UnsequencedShiftClosedEvent): Promise<OutboxEntry>;
  /** Refused unless the movement belongs to the open shift. */
  recordCashMovement(event: UnsequencedCashMovementEvent): Promise<OutboxEntry>;
  /** Everything the drawer total depends on. */
  activity(shiftId: string): Promise<{ sales: SaleCompletedPayload[]; refunds: RefundIssuedPayload[]; movements: CashMovementPayload[] }>;
}

export interface RefundsRepository {
  /**
   * Commits a refund after re-checking, inside the transaction, that it does
   * not exceed what is left on the original sale (which must be on this till).
   */
  commitRefund(event: UnsequencedRefundEvent, options?: CommitSaleOptions): Promise<OutboxEntry>;
  forSale(saleId: string): Promise<RefundIssuedPayload[]>;
}

export interface LocalStore {
  info(): Promise<StorageInfo>;
  /** Opens the database and runs pending migrations. Must be called before anything else. */
  migrate(): Promise<MigrationReport>;
  readonly catalogue: CatalogueRepository;
  readonly sales: SalesRepository;
  readonly refunds: RefundsRepository;
  readonly shifts: ShiftsRepository;
  readonly outbox: OutboxRepository;
  readonly stock: StockRepository;
  readonly reference: ReferenceRepository;
  readonly settings: KeyValueRepository;
  /**
   * Everything not yet confirmed by the server, for manual recovery when a
   * device cannot sync. The caller signs it with the device key (Phase 7 runbook).
   */
  exportRecoveryBundle(): Promise<RecoveryBundle>;
  close(): Promise<void>;
}
