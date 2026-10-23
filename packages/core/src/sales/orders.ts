import type { BusinessInfo } from '../catalogue/contracts';
import type { ReceiptBlock, ReceiptDocument } from '../platform/ports';
import type { CatalogueProduct } from '../storage/ports';
import { addProduct, CheckoutError, emptyCart, type Cart, type CartLine, type ChosenOption } from './checkout';

/**
 * Restaurant orders. An order is taken, sent to the kitchen and paid later
 * (sit-in) or at once (takeaway). Until it is paid it is not a sale and does
 * not sync: it lives on the till that took it. Paying all or some of its
 * items produces an ordinary sale carrying the order number; the order
 * closes when nothing is left to pay.
 */

export type ServiceType = 'sit_in' | 'takeaway';

/** Kitchen progress. 'open' means nothing has been sent yet. */
export type OrderStatus = 'open' | 'sent' | 'preparing' | 'ready' | 'served';

export interface OpenOrder {
  order_id: string;
  /** Short daily number for callouts and tickets, e.g. 17. */
  order_number: number;
  /** Local date the number belongs to (YYYY-MM-DD). */
  order_day: string;
  service_type: ServiceType;
  table: string | null;
  status: OrderStatus;
  opened_at: string;
  updated_at: string;
  lines: CartLine[];
  /** Lines already on a kitchen ticket. */
  sent_line_ids: string[];
  /** Sales that paid part of the order. */
  paid_sale_ids: string[];
}

export function newOrder(input: { orderId: string; orderNumber: number; orderDay: string; serviceType: ServiceType; table?: string | null; now: Date }): OpenOrder {
  const table = input.serviceType === 'sit_in' ? (input.table?.trim() || null) : null;
  return {
    order_id: input.orderId, order_number: input.orderNumber, order_day: input.orderDay, service_type: input.serviceType, table,
    status: 'open', opened_at: input.now.toISOString(), updated_at: input.now.toISOString(), lines: [], sent_line_ids: [], paid_sale_ids: [],
  };
}

const touched = (order: OpenOrder, now: Date, patch: Partial<OpenOrder>): OpenOrder => ({ ...order, ...patch, updated_at: now.toISOString() });

/** Adds an item; every order line is its own line so the kitchen sees each plate. */
export function addToOrder(
  order: OpenOrder,
  product: CatalogueProduct,
  newId: () => string,
  now: Date,
  extras: { options?: ChosenOption[]; note?: string; quantityMilli?: number } = {},
): OpenOrder {
  // Reuse the cart rules (active product, options, quantity) without merging lines.
  const scratch = addProduct(emptyCart({ base_currency: 'USD', rounding: 'half_away_from_zero' }), product, newId, extras.quantityMilli ?? 1000, extras);
  return touched(order, now, { lines: [...order.lines, scratch.lines[0]!] });
}

/** Only items the kitchen has not seen can be taken off; sent items are voided after payment, as refunds. */
export function removeFromOrder(order: OpenOrder, lineId: string, now: Date): OpenOrder {
  if (order.sent_line_ids.includes(lineId)) throw new CheckoutError('unknown_line', 'That item has gone to the kitchen; it can be refunded after payment.');
  if (!order.lines.some((l) => l.line_id === lineId)) throw new CheckoutError('unknown_line', 'That item is not on the order.');
  return touched(order, now, { lines: order.lines.filter((l) => l.line_id !== lineId) });
}

export function unsentLines(order: OpenOrder): CartLine[] {
  return order.lines.filter((l) => !order.sent_line_ids.includes(l.line_id));
}

/** Marks what has not been sent as sent; returns the lines for the kitchen ticket. */
export function sendToKitchen(order: OpenOrder, now: Date): { order: OpenOrder; ticket: CartLine[] } {
  const ticket = unsentLines(order);
  if (ticket.length === 0) return { order, ticket };
  const status: OrderStatus = order.status === 'open' || order.status === 'served' || order.status === 'ready' ? 'sent' : order.status;
  return { order: touched(order, now, { sent_line_ids: [...order.sent_line_ids, ...ticket.map((l) => l.line_id)], status }), ticket };
}

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { sent: 'preparing', preparing: 'ready', ready: 'served' };

/** Moves the order one step through the kitchen: sent → preparing → ready → served. */
export function advanceOrder(order: OpenOrder, now: Date): OpenOrder {
  const next = NEXT[order.status];
  return next ? touched(order, now, { status: next }) : order;
}

/** A cart for paying some (or all) of the order's items, carrying the order details onto the sale. */
export function cartForOrder(order: OpenOrder, business: Pick<BusinessInfo, 'base_currency' | 'rounding'>, lineIds?: readonly string[]): Cart {
  const lines = lineIds ? order.lines.filter((l) => lineIds.includes(l.line_id)) : order.lines;
  if (lines.length === 0) throw new CheckoutError('nothing_to_sell', 'Choose at least one item to pay for.');
  return {
    ...emptyCart(business),
    lines,
    order: { order_number: order.order_number, service_type: order.service_type, ...(order.table ? { table: order.table } : {}) },
  };
}

/** After a sale paid some items: the order without them, or null when nothing is left to pay. */
export function afterPayment(order: OpenOrder, paidLineIds: readonly string[], saleId: string, now: Date): OpenOrder | null {
  const lines = order.lines.filter((l) => !paidLineIds.includes(l.line_id));
  if (lines.length === 0) return null;
  return touched(order, now, { lines, paid_sale_ids: [...order.paid_sale_ids, saleId] });
}

/** Splits the bill into `ways` nearly equal parts, in minor units; the first parts carry any remainder. */
export function evenSplit(totalMinor: number, ways: number): number[] {
  if (!Number.isInteger(ways) || ways < 1) throw new CheckoutError('bad_amount', 'Split between at least one person.');
  const base = Math.floor(totalMinor / ways);
  return Array.from({ length: ways }, (_, i) => base + (i < totalMinor - base * ways ? 1 : 0));
}

/**
 * Even split paid as split tender on one sale: whose turn it is and what they
 * owe. `paidParts` is how many payments are on the sale so far; the share is
 * capped at what is still due, so someone overpaying in cash only shortens
 * the rest. Null once everyone has paid or nothing is due.
 */
export function nextSplitShare(totalMinor: number, ways: number, paidParts: number, remainingMinor: number): { person: number; ways: number; amountMinor: number } | null {
  if (remainingMinor <= 0) return null;
  const shares = evenSplit(totalMinor, ways);
  // Anyone beyond the agreed number of people simply pays what is left.
  const share = paidParts < ways ? shares[paidParts]! : remainingMinor;
  return { person: Math.min(paidParts + 1, ways), ways, amountMinor: Math.min(share, remainingMinor) };
}

/** Kitchen ticket: big order number, where it goes, each plate with its choices and note. No prices. */
export function buildKitchenTicket(order: OpenOrder, lines: CartLine[], ctx: { formatTime?: (iso: string) => string; extra?: boolean }, widthChars: ReceiptDocument['widthChars'] = 42): ReceiptDocument {
  const time = (ctx.formatTime ?? ((iso: string) => iso.slice(11, 16)))(order.updated_at);
  const where = order.service_type === 'takeaway' ? 'TAKEAWAY' : order.table ? `TABLE ${order.table}` : 'SIT-IN';
  const blocks: ReceiptBlock[] = [
    { kind: 'text', text: `ORDER ${order.order_number}`, align: 'center', bold: true, size: 'large' },
    { kind: 'text', text: where, align: 'center', bold: true },
    { kind: 'columns', left: ctx.extra ? 'ADDED TO ORDER' : 'NEW ORDER', right: time },
    { kind: 'divider' },
  ];
  for (const l of lines) {
    const qty = l.product.unit === 'each' ? `${l.quantity_milli / 1000} x ` : `${(l.quantity_milli / 1000).toFixed(3)} ${l.product.unit} `;
    blocks.push({ kind: 'text', text: `${qty}${l.product.name}`, bold: true });
    for (const o of l.options ?? []) blocks.push({ kind: 'text', text: `   ${o.group}: ${o.name}` });
    if (l.note) blocks.push({ kind: 'text', text: `   NOTE: ${l.note}` });
  }
  blocks.push({ kind: 'divider' });
  blocks.push({ kind: 'feed', lines: 3 });
  blocks.push({ kind: 'cut' });
  return { widthChars, blocks };
}
