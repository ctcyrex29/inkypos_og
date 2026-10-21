/**
 * InkyPOS 2.0 — Product Catalog & Snapshot Service
 * InkGenius Technologies
 *
 * Manages local product storage, offline price snapshots, tax snapshot matrices,
 * and immutable catalog snapshots for durable offline-first checkout.
 */

import { Product, TaxCategory, CurrencyCode } from './types.ts';
import { IStorageAdapter } from '../storage/adapter.ts';
import { DEFAULT_TAX_CATEGORIES, calculateItemTax } from './tax.ts';
import { roundToDecimals, usdToZig, DEFAULT_ZIG_RATE } from './currency.ts';
import { CentralLaravelService } from '../api/central-service.ts';

export interface PriceSnapshot {
  productId: string;
  priceUSD: number;
  priceZIG: number;
  exchangeRate: number;
  effectiveFrom: string;
  snapshotVersion: number;
}

export interface TaxSnapshot {
  taxCategoryId: string;
  name: string;
  rate: number;
  isExempt: boolean;
}

export interface ProductWithSnapshot {
  product: Product;
  priceSnapshot: PriceSnapshot;
  taxSnapshot: TaxSnapshot;
  calculatedTaxUSD: number;
  netPriceUSD: number;
}

export interface CatalogSnapshot {
  snapshotId: string;
  tenantId: string;
  version: number;
  createdAt: string;
  syncedAt?: string;
  productsCount: number;
  checksum: string;
  products: Product[];
  taxCategories: TaxCategory[];
  exchangeRateUSDToZIG: number;
  isDurableOffline: boolean;
}

/**
 * Fast deterministic string hash for snapshot integrity checksum
 */
export function computeSnapshotChecksum(products: Product[], taxCategories: TaxCategory[]): string {
  const data = JSON.stringify({
    p: products.map((p) => [p.id, p.priceUSD, p.taxCategoryId, p.stockQuantity]),
    t: taxCategories.map((t) => [t.id, t.rate, t.isExempt]),
  });

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `chk_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export class ProductCatalogService {
  private storage: IStorageAdapter;

  constructor(storage: IStorageAdapter) {
    this.storage = storage;
  }

  /**
   * Retrieves all active products from local terminal storage
   */
  async getLocalProducts(): Promise<Product[]> {
    return this.storage.getProducts();
  }

  /**
   * Finds a product by ID
   */
  async getProductById(id: string): Promise<Product | null> {
    return this.storage.getProductById(id);
  }

  /**
   * Finds a product by barcode (essential for fast POS barcode scanner)
   */
  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const products = await this.storage.getProducts();
    return products.find((p) => p.barcode === barcode.trim()) || null;
  }

  /**
   * Saves or updates a single product in local storage
   */
  async saveProduct(product: Product): Promise<void> {
    const existing = await this.storage.getProducts();
    const index = existing.findIndex((p) => p.id === product.id);

    let updatedList: Product[];
    if (index >= 0) {
      updatedList = existing.map((p) => (p.id === product.id ? product : p));
    } else {
      updatedList = [...existing, product];
    }

    await this.storage.saveProducts(updatedList);
  }

  /**
   * Deletes a product locally (or marks inactive)
   */
  async deleteProduct(productId: string): Promise<void> {
    await this.storage.deleteProduct(productId);
  }

  /**
   * Adjusts stock quantity in local ledger
   */
  async adjustStock(productId: string, deltaQuantity: number): Promise<void> {
    await this.storage.adjustProductStock(productId, deltaQuantity);
  }

  /**
   * Bulk imports an array of products into local storage and creates a new durable snapshot.
   * Supports 'append' (updating existing by ID or barcode) or 'replace' modes.
   */
  async bulkImportProducts(
    tenantId: string,
    productsToImport: Product[],
    mode: 'append' | 'replace' = 'append',
    exchangeRate: number = DEFAULT_ZIG_RATE,
    taxCategories: TaxCategory[] = DEFAULT_TAX_CATEGORIES
  ): Promise<{
    importedCount: number;
    totalProductsCount: number;
    snapshot: CatalogSnapshot;
  }> {
    let finalProducts: Product[];

    if (mode === 'replace') {
      await this.storage.clearProducts();
      finalProducts = [...productsToImport];
    } else {
      const existing = await this.storage.getProducts();
      const productMap = new Map<string, Product>();

      for (const p of existing) {
        productMap.set(p.id, p);
      }

      // Also map barcodes to avoid duplicates with different IDs
      const barcodeToIdMap = new Map<string, string>();
      for (const p of existing) {
        barcodeToIdMap.set(p.barcode.trim(), p.id);
      }

      for (const incoming of productsToImport) {
        const existingIdFromBarcode = barcodeToIdMap.get(incoming.barcode.trim());
        const targetId = incoming.id || existingIdFromBarcode;

        if (targetId && productMap.has(targetId)) {
          // Update existing
          productMap.set(targetId, { ...productMap.get(targetId)!, ...incoming, id: targetId });
        } else {
          // New product
          productMap.set(incoming.id, incoming);
          barcodeToIdMap.set(incoming.barcode.trim(), incoming.id);
        }
      }

      finalProducts = Array.from(productMap.values());
    }

    // Persist atomically to local storage
    await this.storage.saveProducts(finalProducts);

    // Retrieve active snapshot version to increment
    const activeSnapshot = await this.getActiveSnapshot(tenantId);
    const version = activeSnapshot ? activeSnapshot.version : 0;

    // Create durable checksummed snapshot
    const newSnapshot = await this.createSnapshot(
      tenantId,
      finalProducts,
      taxCategories,
      exchangeRate,
      version
    );

    return {
      importedCount: productsToImport.length,
      totalProductsCount: finalProducts.length,
      snapshot: newSnapshot,
    };
  }

  /**
   * Resolves price snapshot and tax snapshot for a product at checkout time
   */
  resolveProductSnapshot(
    product: Product,
    taxCategories: TaxCategory[] = DEFAULT_TAX_CATEGORIES,
    exchangeRate: number = DEFAULT_ZIG_RATE,
    snapshotVersion: number = 1
  ): ProductWithSnapshot {
    const taxCat =
      taxCategories.find((t) => t.id === product.taxCategoryId) || taxCategories[0];

    const taxCalc = calculateItemTax(product.priceUSD, 1, taxCat, true);

    const priceSnapshot: PriceSnapshot = {
      productId: product.id,
      priceUSD: product.priceUSD,
      priceZIG: usdToZig(product.priceUSD, exchangeRate),
      exchangeRate,
      effectiveFrom: new Date().toISOString(),
      snapshotVersion,
    };

    const taxSnapshot: TaxSnapshot = {
      taxCategoryId: taxCat.id,
      name: taxCat.name,
      rate: taxCat.rate,
      isExempt: taxCat.isExempt,
    };

    return {
      product,
      priceSnapshot,
      taxSnapshot,
      calculatedTaxUSD: taxCalc.taxAmountUSD,
      netPriceUSD: taxCalc.taxableAmountUSD,
    };
  }

  /**
   * Generates a new immutable snapshot of the product catalog, prices, and tax rules
   */
  async createSnapshot(
    tenantId: string,
    products: Product[],
    taxCategories: TaxCategory[] = DEFAULT_TAX_CATEGORIES,
    exchangeRate: number = DEFAULT_ZIG_RATE,
    priorVersion: number = 0
  ): Promise<CatalogSnapshot> {
    const version = priorVersion + 1;
    const checksum = computeSnapshotChecksum(products, taxCategories);
    const now = new Date().toISOString();

    const snapshot: CatalogSnapshot = {
      snapshotId: `snap-${tenantId}-${Date.now().toString(36)}`,
      tenantId,
      version,
      createdAt: now,
      syncedAt: now,
      productsCount: products.length,
      checksum,
      products: JSON.parse(JSON.stringify(products)),
      taxCategories: JSON.parse(JSON.stringify(taxCategories)),
      exchangeRateUSDToZIG: exchangeRate,
      isDurableOffline: true,
    };

    // Store snapshot in device state
    await this.storage.saveDeviceState(`snapshot_active_${tenantId}`, snapshot);
    await this.storage.saveDeviceState(`snapshot_history_${tenantId}_v${version}`, snapshot);

    return snapshot;
  }

  /**
   * Retrieves the active snapshot for the tenant
   */
  async getActiveSnapshot(tenantId: string): Promise<CatalogSnapshot | null> {
    return this.storage.getDeviceState<CatalogSnapshot>(`snapshot_active_${tenantId}`);
  }

  /**
   * Fetches latest authorized catalogue snapshot from Laravel central API
   * and persists it atomically in local storage.
   */
  async syncFromCentral(
    tenantId: string,
    centralService: CentralLaravelService
  ): Promise<CatalogSnapshot> {
    const centralSnapshot = await centralService.getCatalogueSnapshot(tenantId);

    // Save products to local storage
    await this.storage.saveProducts(centralSnapshot.products);

    // Create durable snapshot
    const activeSnapshot = await this.getActiveSnapshot(tenantId);
    const version = activeSnapshot ? activeSnapshot.version : 0;

    const newSnapshot = await this.createSnapshot(
      tenantId,
      centralSnapshot.products,
      centralSnapshot.taxCategories,
      centralSnapshot.exchangeRateUSDToZIG,
      version
    );

    return newSnapshot;
  }

  /**
   * Validates snapshot integrity against its checksum
   */
  verifySnapshotIntegrity(snapshot: CatalogSnapshot): boolean {
    const calculated = computeSnapshotChecksum(snapshot.products, snapshot.taxCategories);
    return calculated === snapshot.checksum;
  }
}
