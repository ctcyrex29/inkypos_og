/**
 * InkyPOS 2.0 — IndexedDB Storage Adapter (Web Platform)
 * Provides durable transactional client-side persistence for browser POS terminals.
 */

import { IStorageAdapter } from './adapter.ts';
import { OutboxItem, OutboxStatus, Product, SaleTransaction } from '../core/types.ts';

const DB_NAME = 'inkypos_db_v2';
const DB_VERSION = 1;

export class IndexedDBStorageAdapter implements IStorageAdapter {
  name = 'IndexedDBStorageAdapter';
  private db: IDBDatabase | null = null;

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  async init(): Promise<void> {
    if (this.db) return;
    if (!('indexedDB' in window)) {
      throw new Error('IndexedDB is not available in this environment');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('sales')) {
          const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
          salesStore.createIndex('tenantId', 'tenantId', { unique: false });
          salesStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
          outboxStore.createIndex('status', 'status', { unique: false });
          outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('products')) {
          const prodStore = db.createObjectStore('products', { keyPath: 'id' });
          prodStore.createIndex('barcode', 'barcode', { unique: false });
          prodStore.createIndex('category', 'category', { unique: false });
        }

        if (!db.objectStoreNames.contains('device_state')) {
          db.createObjectStore('device_state', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private getStore(name: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) {
      throw new Error('IndexedDB is not initialized. Call init() first.');
    }
    const tx = this.db.transaction(name, mode);
    return tx.objectStore(name);
  }

  async saveSale(sale: SaleTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('sales', 'readwrite');
        const req = store.put(sale);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getSales(limit?: number): Promise<SaleTransaction[]> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('sales', 'readonly');
        const req = store.getAll();
        req.onsuccess = () => {
          const items: SaleTransaction[] = req.result || [];
          items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          resolve(limit ? items.slice(0, limit) : items);
        };
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getSaleById(id: string): Promise<SaleTransaction | null> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('sales', 'readonly');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveOutboxItem(item: OutboxItem): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('outbox', 'readwrite');
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getOutboxItems(status?: OutboxStatus): Promise<OutboxItem[]> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('outbox', 'readonly');
        const req = store.getAll();
        req.onsuccess = () => {
          let items: OutboxItem[] = req.result || [];
          if (status) {
            items = items.filter((i) => i.status === status);
          }
          items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async updateOutboxItem(id: string, updates: Partial<OutboxItem>): Promise<void> {
    const existing = await this.getOutboxItemById(id);
    if (!existing) return;
    const merged = { ...existing, ...updates };
    return this.saveOutboxItem(merged);
  }

  private async getOutboxItemById(id: string): Promise<OutboxItem | null> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('outbox', 'readonly');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async deleteOutboxItem(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('outbox', 'readwrite');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveProducts(products: Product[]): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('products', 'readwrite');
        const store = tx.objectStore('products');
        for (const p of products) {
          store.put(p);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getProducts(): Promise<Product[]> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('products', 'readonly');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getProductById(id: string): Promise<Product | null> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('products', 'readonly');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async adjustProductStock(productId: string, deltaQuantity: number): Promise<void> {
    const product = await this.getProductById(productId);
    if (product) {
      product.stockQuantity += deltaQuantity;
      await this.saveProducts([product]);
    }
  }

  async deleteProduct(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('products', 'readwrite');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async clearProducts(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('products', 'readwrite');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveDeviceState(key: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('device_state', 'readwrite');
        const req = store.put({ key, value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getDeviceState<T = unknown>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('device_state', 'readonly');
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && 'value' in req.result) {
            resolve(req.result.value as T);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async clearAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(
          ['sales', 'outbox', 'products', 'device_state'],
          'readwrite'
        );
        tx.objectStore('sales').clear();
        tx.objectStore('outbox').clear();
        tx.objectStore('products').clear();
        tx.objectStore('device_state').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }
}
