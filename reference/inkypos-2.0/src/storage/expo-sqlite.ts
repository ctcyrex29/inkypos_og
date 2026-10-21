/**
 * InkyPOS 2.0 — Expo SQLite Storage Adapter (Android & iOS Native)
 * Provides production-ready SQLite database abstraction with migrations and transactions.
 */

import { IStorageAdapter } from './adapter.ts';
import { OutboxItem, OutboxStatus, Product, SaleTransaction } from '../core/types.ts';

export const SQLITE_SCHEMA_V1 = `
-- InkyPOS 2.0 SQLite Schema
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_products (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  barcode TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  price_usd REAL NOT NULL,
  tax_category_id TEXT NOT NULL,
  stock_quantity REAL NOT NULL,
  allow_negative_stock INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON local_products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON local_products(category);

CREATE TABLE IF NOT EXISTS local_sales (
  id TEXT PRIMARY KEY NOT NULL,
  receipt_number TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  register_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  subtotal_usd REAL NOT NULL,
  discount_usd REAL NOT NULL,
  tax_total_usd REAL NOT NULL,
  total_usd REAL NOT NULL,
  currency TEXT NOT NULL,
  total_display REAL NOT NULL,
  exchange_rate REAL NOT NULL,
  fiscal_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON local_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_tenant ON local_sales(tenant_id);

CREATE TABLE IF NOT EXISTS local_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  register_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL,
  last_attempt_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON local_outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_retry ON local_outbox(next_retry_at);

CREATE TABLE IF NOT EXISTS local_device_state (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * Interface representing the modern Expo SQLite v14+ asynchronous database handle
 */
export interface ExpoSQLiteDatabaseLike {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: unknown[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  withTransactionAsync<T>(task: () => Promise<T>): Promise<T>;
}

export class ExpoSQLiteStorageAdapter implements IStorageAdapter {
  name = 'ExpoSQLiteStorageAdapter';
  private db: ExpoSQLiteDatabaseLike | null = null;

  constructor(customDb?: ExpoSQLiteDatabaseLike) {
    if (customDb) {
      this.db = customDb;
    }
  }

  async isAvailable(): Promise<boolean> {
    // Available when running in React Native with expo-sqlite loaded
    return (
      typeof window !== 'undefined' &&
      typeof (window as unknown as { ExpoSQLite?: unknown }).ExpoSQLite !== 'undefined'
    );
  }

  async init(): Promise<void> {
    if (!this.db) {
      throw new Error(
        'ExpoSQLiteStorageAdapter: SQLite database handle not injected. In Expo native app, pass SQLite.openDatabaseAsync("inkypos.db")'
      );
    }
    await this.db.execAsync(SQLITE_SCHEMA_V1);
  }

  async saveSale(sale: SaleTransaction): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.runAsync(
      `INSERT OR REPLACE INTO local_sales (
        id, receipt_number, tenant_id, branch_id, register_id, cashier_id,
        subtotal_usd, discount_usd, tax_total_usd, total_usd, currency,
        total_display, exchange_rate, fiscal_status, created_at, status, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sale.id,
      sale.localReceiptNumber,
      sale.tenantId,
      sale.branchId,
      sale.registerId,
      sale.cashierId,
      sale.subtotalUSD,
      sale.discountUSD,
      sale.taxTotalUSD,
      sale.totalUSD,
      sale.currency,
      sale.totalInDisplayCurrency,
      sale.exchangeRateUsed,
      sale.fiscalStatus,
      sale.createdAt,
      sale.status,
      JSON.stringify(sale)
    );
  }

  async getSales(limit: number = 50): Promise<SaleTransaction[]> {
    if (!this.db) throw new Error('DB not initialized');
    const rows = await this.db.getAllAsync<{ raw_json: string }>(
      `SELECT raw_json FROM local_sales ORDER BY created_at DESC LIMIT ?`,
      limit
    );
    return rows.map((r) => JSON.parse(r.raw_json));
  }

  async getSaleById(id: string): Promise<SaleTransaction | null> {
    if (!this.db) throw new Error('DB not initialized');
    const row = await this.db.getFirstAsync<{ raw_json: string }>(
      `SELECT raw_json FROM local_sales WHERE id = ?`,
      id
    );
    return row ? JSON.parse(row.raw_json) : null;
  }

  async saveOutboxItem(item: OutboxItem): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.runAsync(
      `INSERT OR REPLACE INTO local_outbox (
        id, event_id, event_type, tenant_id, register_id, idempotency_key,
        status, retry_count, next_retry_at, last_attempt_at, error_message, created_at, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      item.syncEvent.eventId,
      item.syncEvent.eventType,
      item.syncEvent.tenantId,
      item.syncEvent.registerId,
      item.syncEvent.idempotencyKey,
      item.status,
      item.retryCount,
      item.nextRetryAt,
      item.lastAttemptAt || null,
      item.errorMessage || null,
      item.createdAt,
      JSON.stringify(item)
    );
  }

  async getOutboxItems(status?: OutboxStatus): Promise<OutboxItem[]> {
    if (!this.db) throw new Error('DB not initialized');
    let rows: { raw_json: string }[];
    if (status) {
      rows = await this.db.getAllAsync<{ raw_json: string }>(
        `SELECT raw_json FROM local_outbox WHERE status = ? ORDER BY created_at ASC`,
        status
      );
    } else {
      rows = await this.db.getAllAsync<{ raw_json: string }>(
        `SELECT raw_json FROM local_outbox ORDER BY created_at ASC`
      );
    }
    return rows.map((r) => JSON.parse(r.raw_json));
  }

  async updateOutboxItem(id: string, updates: Partial<OutboxItem>): Promise<void> {
    const existing = await this.getOutboxItemById(id);
    if (!existing) return;
    const merged = { ...existing, ...updates };
    await this.saveOutboxItem(merged);
  }

  private async getOutboxItemById(id: string): Promise<OutboxItem | null> {
    if (!this.db) throw new Error('DB not initialized');
    const row = await this.db.getFirstAsync<{ raw_json: string }>(
      `SELECT raw_json FROM local_outbox WHERE id = ?`,
      id
    );
    return row ? JSON.parse(row.raw_json) : null;
  }

  async deleteOutboxItem(id: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.runAsync(`DELETE FROM local_outbox WHERE id = ?`, id);
  }

  async saveProducts(products: Product[]): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.withTransactionAsync(async () => {
      for (const p of products) {
        await this.db!.runAsync(
          `INSERT OR REPLACE INTO local_products (
            id, tenant_id, name, barcode, sku, category,
            price_usd, tax_category_id, stock_quantity, allow_negative_stock, active, raw_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          p.id,
          p.tenantId,
          p.name,
          p.barcode,
          p.sku,
          p.category,
          p.priceUSD,
          p.taxCategoryId,
          p.stockQuantity,
          p.allowNegativeStock ? 1 : 0,
          p.active ? 1 : 0,
          JSON.stringify(p)
        );
      }
    });
  }

  async getProducts(): Promise<Product[]> {
    if (!this.db) throw new Error('DB not initialized');
    const rows = await this.db.getAllAsync<{ raw_json: string }>(
      `SELECT raw_json FROM local_products WHERE active = 1 ORDER BY name ASC`
    );
    return rows.map((r) => JSON.parse(r.raw_json));
  }

  async getProductById(id: string): Promise<Product | null> {
    if (!this.db) throw new Error('DB not initialized');
    const row = await this.db.getFirstAsync<{ raw_json: string }>(
      `SELECT raw_json FROM local_products WHERE id = ?`,
      id
    );
    return row ? JSON.parse(row.raw_json) : null;
  }

  async adjustProductStock(productId: string, deltaQuantity: number): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.runAsync(
      `UPDATE local_products SET stock_quantity = stock_quantity + ? WHERE id = ?`,
      deltaQuantity,
      productId
    );
  }

  async deleteProduct(id: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.runAsync(`DELETE FROM local_products WHERE id = ?`, id);
  }

  async clearProducts(): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.runAsync(`DELETE FROM local_products`);
  }

  async saveDeviceState(key: string, value: unknown): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.runAsync(
      `INSERT OR REPLACE INTO local_device_state (key, value_json, updated_at) VALUES (?, ?, ?)`,
      key,
      JSON.stringify(value),
      new Date().toISOString()
    );
  }

  async getDeviceState<T = unknown>(key: string): Promise<T | null> {
    if (!this.db) throw new Error('DB not initialized');
    const row = await this.db.getFirstAsync<{ value_json: string }>(
      `SELECT value_json FROM local_device_state WHERE key = ?`,
      key
    );
    return row ? (JSON.parse(row.value_json) as T) : null;
  }

  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.execAsync(`
      DELETE FROM local_sales;
      DELETE FROM local_outbox;
      DELETE FROM local_products;
      DELETE FROM local_device_state;
    `);
  }
}
