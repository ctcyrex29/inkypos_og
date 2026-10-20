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

export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)!.version;
