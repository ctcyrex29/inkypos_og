import {
  buildReceipt,
  buildRefundReceipt,
  refundableLines,
  completeCart,
  expectedCash,
  type CashMovementPayload,
  type CurrencyAmount,
  type UnsequencedRefundEvent,
  type Cart,
  type CurrencyCode,
  type ExchangeRateInfo,
  type LocalStore,
  type LocalSyncState,
  type ReceiptDocument,
  type StaffInfo,
} from '@inkypos/core';
import type { DeviceRecord } from './device-session';
import { newId } from './api';

/**
 * Everything checkout needs, read from the local database so the till works
 * offline. Returns null until the first catalogue pull has brought the
 * business details down.
 */
export async function loadCheckoutData(store: LocalStore) {
  const business = await store.reference.business();
  if (!business) return null;
  const paymentMethods = await store.reference.paymentMethods();
  const rates = new Map<CurrencyCode, ExchangeRateInfo>();
  for (const currency of new Set(paymentMethods.flatMap((m) => m.currencies))) {
    if (currency === business.base_currency) continue;
    const rate = await store.reference.exchangeRate(business.base_currency, currency);
    if (rate) rates.set(currency, rate);
  }
  return { business, paymentMethods, rates };
}

/**
 * Commits a sale in the open shift, attributed to the signed-in cashier, with a
 * receipt number of the form <register code>-<6-digit sale number>.
 */
export async function completeSale(store: LocalStore, device: DeviceRecord, cashier: StaffInfo, cart: Cart): Promise<string> {
  const shift = await store.shifts.current();
  if (!shift) throw new Error('Open a shift before selling.');
  const built = completeCart(cart, {
    newId,
    tenantId: device.tenant_id,
    branchId: device.branch_id,
    registerId: device.register_id,
    deviceId: device.device_id,
    actorId: cashier.id,
    catalogueVersion: await store.reference.catalogueVersion(),
    now: () => new Date(),
  });
  const event = { ...built, payload: { ...built.payload, shift_id: shift.shift_id } };
  const code = await registerCode(store, device);
  await store.sales.commitSale(event, { receiptNumber: (seq) => `${code}-${String(seq).padStart(6, '0')}` });
  return event.payload.sale_id;
}

async function registerCode(store: LocalStore, device: DeviceRecord): Promise<string> {
  return (await store.reference.register(device.register_id))?.code ?? 'R';
}

/** The common envelope for events this till records, attributed to the signed-in cashier. */
function envelope<T extends string, P extends object>(device: DeviceRecord, cashier: StaffInfo, eventType: T, aggregateId: string, payload: P) {
  return {
    schema_version: 1 as const,
    event_id: newId(),
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    tenant_id: device.tenant_id,
    branch_id: device.branch_id,
    register_id: device.register_id,
    device_id: device.device_id,
    actor_user_id: cashier.id,
    aggregate_id: aggregateId,
    payload,
  };
}

// ── Shifts ────────────────────────────────────────────────────────────────

export async function cashMethodCodes(store: LocalStore): Promise<Set<string>> {
  return new Set((await store.reference.paymentMethods()).filter((m) => m.kind === 'cash').map((m) => m.code));
}

export async function openShift(store: LocalStore, device: DeviceRecord, cashier: StaffInfo, openingFloat: CurrencyAmount[]): Promise<void> {
  const shiftId = newId();
  await store.shifts.open(envelope(device, cashier, 'shift.opened', shiftId, { shift_id: shiftId, opened_at: new Date().toISOString(), opening_float: openingFloat }));
}

/** The open shift with what the drawer should hold now. */
export async function shiftSummary(store: LocalStore) {
  const shift = await store.shifts.current();
  if (!shift) return null;
  const activity = await store.shifts.activity(shift.shift_id);
  const expected = expectedCash({ openingFloat: shift.opening_float, ...activity, cashMethodCodes: await cashMethodCodes(store) });
  return { shift, activity, expected };
}

export async function recordCash(
  store: LocalStore,
  device: DeviceRecord,
  cashier: StaffInfo,
  input: Pick<CashMovementPayload, 'direction' | 'currency' | 'amount_minor' | 'reason'> & { note?: string },
): Promise<void> {
  const shift = await store.shifts.current();
  if (!shift) throw new Error('Open a shift first.');
  const movementId = newId();
  await store.shifts.recordCashMovement(
    envelope(device, cashier, 'cash.movement', movementId, {
      movement_id: movementId,
      shift_id: shift.shift_id,
      ...input,
      ...(input.note ? { note: input.note } : {}),
      occurred_at: new Date().toISOString(),
    }),
  );
}

export async function closeShift(store: LocalStore, device: DeviceRecord, cashier: StaffInfo, counted: CurrencyAmount[], note?: string): Promise<void> {
  const summary = await shiftSummary(store);
  if (!summary) throw new Error('No shift is open.');
  const shiftId = summary.shift.shift_id;
  await store.shifts.close(
    envelope(device, cashier, 'shift.closed', shiftId, {
      shift_id: shiftId,
      closed_at: new Date().toISOString(),
      expected_cash: summary.expected,
      counted_cash: counted,
      ...(note ? { note } : {}),
    }),
  );
}

// ── Refunds ───────────────────────────────────────────────────────────────

/** Commits a refund (or void) built on the refund screen; receipt <register>-R<sequence>. */
export async function commitRefund(store: LocalStore, device: DeviceRecord, event: UnsequencedRefundEvent): Promise<string> {
  const shift = await store.shifts.current();
  const withShift = shift ? { ...event, payload: { ...event.payload, shift_id: shift.shift_id } } : event;
  const code = await registerCode(store, device);
  await store.refunds.commitRefund(withShift, { receiptNumber: (seq) => `${code}-R${String(seq).padStart(6, '0')}` });
  return event.payload.refund_id;
}

export function refundContext(device: DeviceRecord, cashier: StaffInfo) {
  return {
    newId,
    tenantId: device.tenant_id,
    branchId: device.branch_id,
    registerId: device.register_id,
    deviceId: device.device_id,
    actorId: cashier.id,
    now: () => new Date(),
  };
}

export interface LoadedReceipt {
  receipt: ReceiptDocument;
  syncState: LocalSyncState;
  refunds: { refundId: string; receipt: ReceiptDocument; total_minor: number; receiptNumber: string }[];
  /** Something is still refundable on this sale. */
  refundable: boolean;
}

export async function loadReceipt(store: LocalStore, device: DeviceRecord, saleId: string): Promise<LoadedReceipt | null> {
  const sale = await store.sales.get(saleId);
  if (!sale) return null;
  const [business, branch, register, methods, refunds] = await Promise.all([
    store.reference.business(),
    store.reference.branch(device.branch_id),
    store.reference.register(device.register_id),
    store.reference.paymentMethods(),
    store.refunds.forSale(saleId),
  ]);
  const stored = Number((await store.settings.get('receipt_width')) ?? 42);
  const width = ([32, 42, 48].includes(stored) ? stored : 42) as ReceiptDocument['widthChars'];
  const customerName = sale.sale.customer_id ? ((await store.customers.get(sale.sale.customer_id))?.name ?? null) : null;
  const ctx = {
    customerName,
    business,
    branch,
    register,
    methods,
    formatDateTime: (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
  };
  return {
    receipt: buildReceipt(sale.sale, ctx, width),
    syncState: sale.sync_state,
    refunds: refunds.map((r) => ({ refundId: r.refund_id, receipt: buildRefundReceipt(r, ctx, width), total_minor: r.totals.total_minor, receiptNumber: r.receipt_number })),
    refundable: refundableLines(sale.sale, refunds).some((l) => l.refundableMilli > 0),
  };
}
