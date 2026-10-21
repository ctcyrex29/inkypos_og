import type { Migration } from './driver';

/**
 * Local database migrations. Append only: never edit a migration that has
 * shipped; add a new version instead. Index fields hold numbers or strings
 * only (flags are stored as 0/1).
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    steps: [
      { op: 'createStore', store: { name: 'meta', key: 'k', indexes: [] } },
      { op: 'createStore', store: { name: 'settings', key: 'k', indexes: [] } },
      {
        op: 'createStore',
        store: {
          name: 'products',
          key: 'product_id',
          indexes: [
            { name: 'by_sku', fields: ['sku'] },
            { name: 'by_name', fields: ['name_lc'] },
          ],
        },
      },
      {
        op: 'createStore',
        store: { name: 'barcodes', key: 'barcode', indexes: [{ name: 'by_product', fields: ['product_id'] }] },
      },
      {
        op: 'createStore',
        store: {
          name: 'sales',
          key: 'sale_id',
          indexes: [
            { name: 'by_completed', fields: ['completed_at_ms'] },
            { name: 'by_state', fields: ['sync_state'] },
          ],
        },
      },
      {
        op: 'createStore',
        store: {
          name: 'stock_movements',
          key: 'movement_id',
          indexes: [{ name: 'by_product', fields: ['product_id', 'device_sequence'] }],
        },
      },
      {
        op: 'createStore',
        store: {
          name: 'outbox',
          key: 'event_id',
          indexes: [
            { name: 'by_seq', fields: ['device_sequence'], unique: true },
            // open = 1 while the server has not given a final answer
            { name: 'by_open', fields: ['open', 'device_sequence'] },
            { name: 'by_state', fields: ['state'] },
          ],
        },
      },
    ],
  },
];

MIGRATIONS.push({
  version: 2,
  name: 'reference_data',
  steps: [
    // business / branch / register details, keyed "<entity>:<id>"
    { op: 'createStore', store: { name: 'reference', key: 'k', indexes: [{ name: 'by_entity', fields: ['entity'] }] } },
    { op: 'createStore', store: { name: 'payment_methods', key: 'id', indexes: [{ name: 'by_position', fields: ['position'] }] } },
    {
      op: 'createStore',
      store: { name: 'exchange_rates', key: 'id', indexes: [{ name: 'by_pair', fields: ['base_currency', 'quote_currency', 'version'] }] },
    },
    // Products written before units existed are sold per item.
    { op: 'transform', store: 'products', fn: (row) => ({ unit: 'each', ...row }) },
  ],
});

MIGRATIONS.push({
  version: 3,
  name: 'staff_sign_in',
  steps: [
    // People who can sign in on this till, as pulled from the server (entity "staff").
    { op: 'createStore', store: { name: 'staff', key: 'id', indexes: [{ name: 'by_name', fields: ['name_lc'] }] } },
    // Failed PIN attempts per person. Local only and never replaced by a pull, so a lockout survives restarts.
    { op: 'createStore', store: { name: 'pin_attempts', key: 'user_id', indexes: [] } },
  ],
});

// Version 3 (staff sign-in) and 4 were built on parallel branches. The
// drivers apply any unrecorded migration, so a till may receive them in either order.
MIGRATIONS.push({
  version: 4,
  name: 'refunds_shifts_cash',
  steps: [
    {
      op: 'createStore',
      store: {
        name: 'refunds',
        key: 'refund_id',
        indexes: [
          { name: 'by_original', fields: ['original_sale_id'] },
          { name: 'by_shift', fields: ['shift_id'] },
        ],
      },
    },
    { op: 'createStore', store: { name: 'shifts', key: 'shift_id', indexes: [{ name: 'by_opened', fields: ['opened_at_ms'] }, { name: 'by_open', fields: ['open'] }] } },
    { op: 'createStore', store: { name: 'cash_movements', key: 'movement_id', indexes: [{ name: 'by_shift', fields: ['shift_id'] }] } },
    { op: 'createIndex', store: 'sales', index: { name: 'by_shift', fields: ['shift_id'] } },
  ],
});

MIGRATIONS.push({
  version: 5,
  name: 'categories_customers',
  steps: [
    { op: 'createStore', store: { name: 'categories', key: 'id', indexes: [{ name: 'by_position', fields: ['position'] }] } },
    // phone_k: digits only ('' when none), so "077 123" finds "+263 77 123 4567" by its digits.
    {
      op: 'createStore',
      store: { name: 'customers', key: 'id', indexes: [{ name: 'by_name', fields: ['name_lc'] }, { name: 'by_phone', fields: ['phone_k'] }] },
    },
    // category_k: the category id, or '' for none (index keys cannot be null).
    { op: 'transform', store: 'products', fn: (row) => ({ category_k: '', ...row }) },
    { op: 'createIndex', store: 'products', index: { name: 'by_category', fields: ['category_k', 'name_lc'] } },
  ],
});

MIGRATIONS.push({
  version: 6,
  name: 'restaurant_orders',
  steps: [
    // Open restaurant orders: local to the till until paid (a paid order is an ordinary sale).
    { op: 'createStore', store: { name: 'orders', key: 'order_id', indexes: [{ name: 'by_number', fields: ['order_day', 'order_number'] }] } },
  ],
});

export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)!.version;
