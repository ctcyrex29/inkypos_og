/**
 * InkyPOS 2.0 — Storage Abstraction Interface
 * Cross-platform storage contract implemented for Expo SQLite (Native) and IndexedDB (Web).
 */

import { OutboxItem, OutboxStatus, Product, SaleTransaction } from '../core/types.ts';

export interface IStorageAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  init(): Promise<void>;

  // Sales
  saveSale(sale: SaleTransaction): Promise<void>;
  getSales(limit?: number): Promise<SaleTransaction[]>;
  getSaleById(id: string): Promise<SaleTransaction | null>;

  // Outbox
  saveOutboxItem(item: OutboxItem): Promise<void>;
  getOutboxItems(status?: OutboxStatus): Promise<OutboxItem[]>;
  updateOutboxItem(id: string, updates: Partial<OutboxItem>): Promise<void>;
  deleteOutboxItem(id: string): Promise<void>;

  // Products & Catalogue Snapshot
  saveProducts(products: Product[]): Promise<void>;
  getProducts(): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  adjustProductStock(productId: string, deltaQuantity: number): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  clearProducts(): Promise<void>;

  // Device & Auth State
  saveDeviceState(key: string, value: unknown): Promise<void>;
  getDeviceState<T = unknown>(key: string): Promise<T | null>;

  // Diagnostics & Recovery
  clearAll(): Promise<void>;
}
