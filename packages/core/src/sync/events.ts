import { z } from 'zod';
import { CURRENCY_CODES } from '../money/money';
import { priceLine } from '../sales/pricing';

/**
 * Sync event schema, version 1 (DRAFT until Phase 4 freezes it).
 *
 * Devices never upload mutable rows. They upload immutable, versioned events
 * that describe something that already happened at the till. The server
 * stores each event exactly once (keyed by tenant + event_id) and derives
 * central records from it inside one database transaction.
 *
 * Wire format is snake_case JSON so it maps directly onto Laravel.
 */

export const SYNC_SCHEMA_VERSION = 1 as const;
export const MAX_EVENTS_PER_BATCH = 100;

const id = z.uuid({ version: 'v7' });
const minor = z.int().min(0);
const timestamp = z.iso.datetime({ offset: true });

export const roundingModeSchema = z.enum(['half_away_from_zero', 'half_even']);
export const currencySchema = z.enum(CURRENCY_CODES);

/**
 * Payment statuses describe what the till knows, not what a provider settled.
 * `recorded` = cashier recorded a tender (cash, manual card terminal, etc.).
 * `pending_confirmation` = awaiting a provider or manual confirmation.
 */
export const paymentStatusSchema = z.enum(['recorded', 'pending_confirmation', 'confirmed', 'failed', 'voided']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/** Statuses that count toward settling the sale total. */
export const TENDERING_PAYMENT_STATUSES: readonly PaymentStatus[] = ['recorded', 'pending_confirmation', 'confirmed'];

export const saleLineSchema = z.object({
  line_id: id,
  product_id: id,
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  quantity_milli: z.int().positive(),
  unit_price_minor: minor,
  discount_minor: minor,
  tax: z.object({
    code: z.string().min(1).max(32),
    rate_bp: z.int().min(0).max(100_000),
    inclusive: z.boolean(),
    amount_minor: minor,
  }),
  line_total_minor: minor,
});

export const salePaymentSchema = z
  .object({
    payment_id: id,
    /** Tenant-configured payment type code, e.g. "cash", "ecocash", "card_manual". */
    method_code: z.string().min(1).max(32),
    status: paymentStatusSchema,
    currency: currencySchema,
    amount_minor: z.int().positive(),
    /** Amount expressed in the sale currency, after conversion if needed. */
    sale_currency_amount_minor: z.int().positive(),
    /** Sale-currency units per one payment-currency unit, from the server's rate snapshot. */
    exchange_rate: z.string().regex(/^\d+(\.\d{1,8})?$/).optional(),
    exchange_rate_version: z.int().positive().optional(),
    reference: z.string().max(128).optional(),
  })
  .strict();

export const stockMovementSchema = z.object({
  movement_id: id,
  product_id: id,
  quantity_delta_milli: z.int().refine((v) => v !== 0, 'quantity delta must not be zero'),
});

export const saleCompletedPayloadSchema = z
  .object({
    sale_id: id,
    receipt_number: z.string().min(1).max(40),
    currency: currencySchema,
    rounding: roundingModeSchema,
    catalogue_version: z.int().nonnegative(),
    price_list_version: z.int().nonnegative(),
    completed_at: timestamp,
    lines: z.array(saleLineSchema).min(1).max(500),
    totals: z.object({
      subtotal_minor: minor,
      discount_minor: minor,
      tax_minor: minor,
      total_minor: minor,
    }),
    payments: z.array(salePaymentSchema).min(1).max(20),
    change_minor: minor,
    stock_movements: z.array(stockMovementSchema),
  })
  .superRefine((sale, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });

    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    let total = 0;
    const soldByProduct = new Map<string, number>();

    sale.lines.forEach((line, i) => {
      let priced;
      try {
        priced = priceLine({
          unitPriceMinor: line.unit_price_minor,
          quantityMilli: line.quantity_milli,
          discountMinor: line.discount_minor,
          taxRateBasisPoints: line.tax.rate_bp,
          taxInclusive: line.tax.inclusive,
          rounding: sale.rounding,
        });
      } catch (e) {
        issue((e as Error).message, ['lines', i]);
        return;
      }
      if (priced.taxMinor !== line.tax.amount_minor) {
        issue(`tax should be ${priced.taxMinor}`, ['lines', i, 'tax', 'amount_minor']);
      }
      if (priced.totalMinor !== line.line_total_minor) {
        issue(`line total should be ${priced.totalMinor}`, ['lines', i, 'line_total_minor']);
      }
      subtotal += priced.extendedMinor;
      discount += priced.discountMinor;
      tax += priced.taxMinor;
      total += priced.totalMinor;
      soldByProduct.set(line.product_id, (soldByProduct.get(line.product_id) ?? 0) + line.quantity_milli);
    });

    const t = sale.totals;
    if (t.subtotal_minor !== subtotal) issue(`subtotal should be ${subtotal}`, ['totals', 'subtotal_minor']);
    if (t.discount_minor !== discount) issue(`discount should be ${discount}`, ['totals', 'discount_minor']);
    if (t.tax_minor !== tax) issue(`tax should be ${tax}`, ['totals', 'tax_minor']);
    if (t.total_minor !== total) issue(`total should be ${total}`, ['totals', 'total_minor']);

    sale.payments.forEach((p, i) => {
      const converted = p.currency !== sale.currency;
      if (converted && !p.exchange_rate) {
        issue('exchange_rate is required for a payment in another currency', ['payments', i, 'exchange_rate']);
      }
      if (!converted && p.sale_currency_amount_minor !== p.amount_minor) {
        issue('same-currency payment must have equal amounts', ['payments', i, 'sale_currency_amount_minor']);
      }
    });

    const tendered = sale.payments
      .filter((p) => TENDERING_PAYMENT_STATUSES.includes(p.status))
      .reduce((acc, p) => acc + p.sale_currency_amount_minor, 0);
    if (tendered - sale.change_minor !== t.total_minor) {
      issue(`tendered (${tendered}) minus change (${sale.change_minor}) must equal total (${t.total_minor})`, [
        'payments',
      ]);
    }

    const movedByProduct = new Map<string, number>();
    for (const m of sale.stock_movements) {
      movedByProduct.set(m.product_id, (movedByProduct.get(m.product_id) ?? 0) + m.quantity_delta_milli);
    }
    for (const productId of new Set([...soldByProduct.keys(), ...movedByProduct.keys()])) {
      const sold = soldByProduct.get(productId) ?? 0;
      const moved = movedByProduct.get(productId) ?? 0;
      if (moved !== -sold) issue(`stock movements for ${productId} must total ${-sold}`, ['stock_movements']);
    }

    const duplicates = (ids: string[]) => ids.length !== new Set(ids).size;
    if (duplicates(sale.lines.map((l) => l.line_id))) issue('line_id values must be unique', ['lines']);
    if (duplicates(sale.payments.map((p) => p.payment_id))) issue('payment_id values must be unique', ['payments']);
    if (duplicates(sale.stock_movements.map((m) => m.movement_id))) {
      issue('movement_id values must be unique', ['stock_movements']);
    }
  });

export const stockAdjustedPayloadSchema = z.object({
  adjustment_id: id,
  product_id: id,
  quantity_delta_milli: z.int().refine((v) => v !== 0, 'quantity delta must not be zero'),
  reason: z.enum(['count_correction', 'damage', 'received', 'transfer_in', 'transfer_out', 'other']),
  note: z.string().max(500).optional(),
});

const envelopeBase = {
  schema_version: z.literal(SYNC_SCHEMA_VERSION),
  event_id: id,
  /** Strictly increasing per device; gaps reveal lost or deleted local events. */
  device_sequence: z.int().positive(),
  /** Device clock. The server records its own received_at and never trusts this for ordering. */
  occurred_at: timestamp,
  tenant_id: id,
  branch_id: id,
  register_id: id,
  device_id: id,
  actor_user_id: id,
  aggregate_id: id,
};

export const syncEventSchema = z
  .discriminatedUnion('event_type', [
    z.object({ ...envelopeBase, event_type: z.literal('sale.completed'), payload: saleCompletedPayloadSchema }),
    z.object({ ...envelopeBase, event_type: z.literal('stock.adjusted'), payload: stockAdjustedPayloadSchema }),
  ])
  .superRefine((event, ctx) => {
    const aggregateId = event.event_type === 'sale.completed' ? event.payload.sale_id : event.payload.adjustment_id;
    if (aggregateId !== event.aggregate_id) {
      ctx.addIssue({ code: 'custom', message: 'aggregate_id must match the payload identifier', path: ['aggregate_id'] });
    }
  });

export type SyncEvent = z.infer<typeof syncEventSchema>;
export type SyncEventType = SyncEvent['event_type'];
export type SaleCompletedPayload = z.infer<typeof saleCompletedPayloadSchema>;

/** POST /api/v1/sync/events — body. Sent with an Idempotency-Key header equal to batch_id. */
export const syncPushRequestSchema = z
  .object({
    batch_id: id,
    device_id: id,
    events: z.array(syncEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
  })
  .superRefine((batch, ctx) => {
    batch.events.forEach((e, i) => {
      if (e.device_id !== batch.device_id) {
        ctx.addIssue({ code: 'custom', message: 'event device_id must match batch device_id', path: ['events', i] });
      }
      const prev = batch.events[i - 1];
      if (prev && e.device_sequence <= prev.device_sequence) {
        ctx.addIssue({ code: 'custom', message: 'device_sequence must increase', path: ['events', i] });
      }
    });
  });

/**
 * Per-event outcome. `duplicate` means the server already holds this event and
 * returns the original outcome, which is how a lost acknowledgement recovers.
 * `conflict` means the event is stored centrally but needs manager review.
 * `rejected` means it failed validation; the device keeps it for review.
 */
export const syncAckResultSchema = z.enum(['accepted', 'duplicate', 'conflict', 'rejected']);
export type SyncAckResult = z.infer<typeof syncAckResultSchema>;

export const syncAcknowledgementSchema = z.object({
  event_id: id,
  result: syncAckResultSchema,
  server_sequence: z.int().positive().optional(),
  conflict_id: id.optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export const syncPushResponseSchema = z.object({
  batch_id: id,
  server_time: timestamp,
  acknowledgements: z.array(syncAcknowledgementSchema),
});

export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;
export type SyncAcknowledgement = z.infer<typeof syncAcknowledgementSchema>;

/**
 * GET /api/v1/sync/changes?cursor= — server-to-device reference data. `data` is
 * validated per entity by catalogue/contracts.ts; the cursor is opaque.
 */
export const syncPullResponseSchema = z.object({
  next_cursor: z.string(),
  has_more: z.boolean(),
  changes: z.array(
    z.object({
      entity: z.enum(['business', 'branch', 'register', 'product', 'payment_method', 'exchange_rate', 'staff']),
      op: z.enum(['upsert', 'delete']),
      id,
      version: z.int().positive(),
      data: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;
