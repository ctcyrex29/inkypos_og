import { divRound } from '../money/money';
import type { RefundIssuedPayload, SaleCompletedPayload, SyncEvent } from '../sync/events';

export type RefundIssuedEvent = Extract<SyncEvent, { event_type: 'refund.issued' }>;
type UnsequencedRefundEvent = Omit<RefundIssuedEvent, 'device_sequence'>;

export class RefundError extends Error {
  override readonly name = 'RefundError';
  constructor(
    readonly code: 'nothing_selected' | 'too_much' | 'unknown_line' | 'fully_refunded',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Cumulative rule shared with the server (apps/api/app/Sales/Refunds.php):
 * after returning `q` of a line sold in quantity `Q` for total `T`, the
 * customer has been refunded exactly round(T × q / Q) in total. Each refund
 * pays the difference from the previous cumulative amount, so rounding never
 * lets refunds exceed what was paid and a full return refunds exactly `T`.
 */
export function cumulativeRefund(lineTotalMinor: number, lineQuantityMilli: number, refundedMilli: number, rounding: SaleCompletedPayload['rounding']): number {
  if (refundedMilli >= lineQuantityMilli) return lineTotalMinor;
  return divRound(lineTotalMinor * refundedMilli, lineQuantityMilli, rounding);
}

export interface RefundableLine {
  line: SaleCompletedPayload['lines'][number];
  refundedMilli: number;
  refundableMilli: number;
}

/** What is left to refund on each line of a sale, after earlier refunds. */
export function refundableLines(sale: SaleCompletedPayload, previous: RefundIssuedPayload[]): RefundableLine[] {
  const refunded = new Map<string, number>();
  for (const r of previous) {
    if (r.original_sale_id !== sale.sale_id) continue;
    for (const l of r.lines) refunded.set(l.original_line_id, (refunded.get(l.original_line_id) ?? 0) + l.quantity_milli);
  }
  return sale.lines.map((line) => {
    const refundedMilli = refunded.get(line.line_id) ?? 0;
    return { line, refundedMilli, refundableMilli: Math.max(0, line.quantity_milli - refundedMilli) };
  });
}

export interface RefundSelection {
  original_line_id: string;
  quantity_milli: number;
  restock: boolean;
}

export interface RefundContext {
  newId: () => string;
  tenantId: string;
  branchId: string;
  registerId: string;
  deviceId: string;
  actorId: string;
  /** Payment type the money goes out through (normally cash). */
  payoutMethodCode: string;
  reason: RefundIssuedPayload['reason'];
  note?: string;
  shiftId?: string;
  now: () => Date;
}

export function buildRefund(
  sale: SaleCompletedPayload,
  previous: RefundIssuedPayload[],
  selections: RefundSelection[],
  ctx: RefundContext,
): UnsequencedRefundEvent {
  const chosen = selections.filter((s) => s.quantity_milli > 0);
  if (chosen.length === 0) throw new RefundError('nothing_selected', 'Choose at least one item to refund.');
  const lines = refundableLines(sale, previous);

  const refundLines = chosen.map((s) => {
    const entry = lines.find((l) => l.line.line_id === s.original_line_id);
    if (!entry) throw new RefundError('unknown_line', 'That item is not on the original sale.');
    if (s.quantity_milli > entry.refundableMilli) {
      throw new RefundError(
        entry.refundableMilli === 0 ? 'fully_refunded' : 'too_much',
        entry.refundableMilli === 0
          ? `${entry.line.name} has already been refunded.`
          : `Only ${entry.refundableMilli / 1000} of ${entry.line.name} can still be refunded.`,
      );
    }
    const { line } = entry;
    const after = entry.refundedMilli + s.quantity_milli;
    const amount =
      cumulativeRefund(line.line_total_minor, line.quantity_milli, after, sale.rounding) -
      cumulativeRefund(line.line_total_minor, line.quantity_milli, entry.refundedMilli, sale.rounding);
    const tax =
      cumulativeRefund(line.tax.amount_minor, line.quantity_milli, after, sale.rounding) -
      cumulativeRefund(line.tax.amount_minor, line.quantity_milli, entry.refundedMilli, sale.rounding);
    return {
      refund_line_id: ctx.newId(),
      original_line_id: line.line_id,
      product_id: line.product_id,
      sku: line.sku,
      name: line.name,
      quantity_milli: s.quantity_milli,
      amount_minor: amount,
      tax_minor: tax,
      restock: s.restock,
    };
  });

  const total = refundLines.reduce((sum, l) => sum + l.amount_minor, 0);
  if (total === 0) throw new RefundError('nothing_selected', 'The selected items have nothing left to refund.');
  const refundId = ctx.newId();
  const at = ctx.now().toISOString();

  return {
    schema_version: 1,
    event_id: ctx.newId(),
    event_type: 'refund.issued',
    occurred_at: at,
    tenant_id: ctx.tenantId,
    branch_id: ctx.branchId,
    register_id: ctx.registerId,
    device_id: ctx.deviceId,
    actor_user_id: ctx.actorId,
    aggregate_id: refundId,
    payload: {
      refund_id: refundId,
      original_sale_id: sale.sale_id,
      original_receipt_number: sale.receipt_number,
      receipt_number: 'PENDING',
      reason: ctx.reason,
      ...(ctx.note ? { note: ctx.note } : {}),
      currency: sale.currency,
      refunded_at: at,
      ...(ctx.shiftId ? { shift_id: ctx.shiftId } : {}),
      lines: refundLines,
      totals: { tax_minor: refundLines.reduce((s, l) => s + l.tax_minor, 0), total_minor: total },
      payments: [
        { payment_id: ctx.newId(), method_code: ctx.payoutMethodCode, currency: sale.currency, amount_minor: total, sale_currency_amount_minor: total },
      ],
      stock_movements: refundLines
        .filter((l) => l.restock)
        .map((l) => ({ movement_id: ctx.newId(), product_id: l.product_id, quantity_delta_milli: l.quantity_milli })),
    },
  };
}

/** A void is a refund of everything still refundable, with stock returned. */
export function buildVoid(sale: SaleCompletedPayload, previous: RefundIssuedPayload[], ctx: Omit<RefundContext, 'reason'>): UnsequencedRefundEvent {
  const selections = refundableLines(sale, previous)
    .filter((l) => l.refundableMilli > 0)
    .map((l) => ({ original_line_id: l.line.line_id, quantity_milli: l.refundableMilli, restock: true }));
  if (selections.length === 0) throw new RefundError('fully_refunded', 'This sale has already been fully refunded.');
  return buildRefund(sale, previous, selections, { ...ctx, reason: 'void' });
}
