/**
 * InkyPOS 2.0 — Memory Storage Adapter
 * Used for unit testing, fast deterministic isolation, and environments without IndexedDB.
 */

import { IStorageAdapter } from './adapter.ts';
import { OutboxItem, OutboxStatus, Product, SaleTransaction } from '../core/types.ts';

export class MemoryStorageAdapter implements IStorageAdapter {
  name = 'MemoryStorageAdapter';
  private sales: Map<string, SaleTransaction> = new Map();
  private outbox: Map<string, OutboxItem> = new Map();
  private products: Map<string, Product> = new Map();
  private deviceState: Map<string, unknown> = new Map();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async init(): Promise<void> {
    // No-op for in-memory
  }

  async saveSale(sale: SaleTransaction): Promise<void> {
    this.sales.set(sale.id, JSON.parse(JSON.stringify(sale)));
  }

  async getSales(limit?: number): Promise<SaleTransaction[]> {
    const list = Array.from(this.sales.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return limit ? list.slice(0, limit) : list;
  }

  async getSaleById(id: string): Promise<SaleTransaction | null> {
    const item = this.sales.get(id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async saveOutboxItem(item: OutboxItem): Promise<void> {
    this.outbox.set(item.id, JSON.parse(JSON.stringify(item)));
  }

  async getOutboxItems(status?: OutboxStatus): Promise<OutboxItem[]> {
    const items = Array.from(this.outbox.values());
    const filtered = status ? items.filter((i) => i.status === status) : items;
    return filtered.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async updateOutboxItem(id: string, updates: Partial<OutboxItem>): Promise<void> {
    const existing = this.outbox.get(id);
    if (existing) {
      this.outbox.set(id, { ...existing, ...updates });
    }
  }

  async deleteOutboxItem(id: string): Promise<void> {
    this.outbox.delete(id);
  }

  async saveProducts(products: Product[]): Promise<void> {
    for (const p of products) {
      this.products.set(p.id, JSON.parse(JSON.stringify(p)));
    }
  }

  async getProducts(): Promise<Product[]> {
    return Array.from(this.products.values());
  }

  async getProductById(id: string): Promise<Product | null> {
    const p = this.products.get(id);
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }

  async adjustProductStock(productId: string, deltaQuantity: number): Promise<void> {
    const p = this.products.get(productId);
    if (p) {
      p.stockQuantity += deltaQuantity;
      this.products.set(productId, p);
    }
  }

  async deleteProduct(id: string): Promise<void> {
    this.products.delete(id);
  }

  async clearProducts(): Promise<void> {
    this.products.clear();
  }

  async saveDeviceState(key: string, value: unknown): Promise<void> {
    this.deviceState.set(key, JSON.parse(JSON.stringify(value)));
  }

  async getDeviceState<T = unknown>(key: string): Promise<T | null> {
    const val = this.deviceState.get(key);
    return val !== undefined ? (JSON.parse(JSON.stringify(val)) as T) : null;
  }

  async clearAll(): Promise<void> {
    this.sales.clear();
    this.outbox.clear();
    this.products.clear();
    this.deviceState.clear();
  }
}
