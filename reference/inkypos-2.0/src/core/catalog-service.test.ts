/**
 * InkyPOS 2.0 — Product Catalog & Snapshot Service Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../storage/memory.ts';
import {
  ProductCatalogService,
  computeSnapshotChecksum,
} from './catalog-service.ts';
import { Product, TaxCategory } from './types.ts';
import { CentralLaravelService } from '../api/central-service.ts';

const mockTaxCategories: TaxCategory[] = [
  { id: 'tax-vat-std', name: 'Standard VAT (15%)', rate: 0.15, isExempt: false },
  { id: 'tax-vat-zero', name: 'Zero-Rated (0%)', rate: 0.0, isExempt: false },
  { id: 'tax-vat-exempt', name: 'Exempt', rate: 0.0, isExempt: true },
];

const mockProducts: Product[] = [
  {
    id: 'prod-001',
    tenantId: 'tenant-01',
    name: 'Sugar 2kg',
    barcode: '600100010001',
    sku: 'SUG-01',
    category: 'Groceries',
    priceUSD: 2.30,
    taxCategoryId: 'tax-vat-std',
    costPriceUSD: 1.80,
    stockQuantity: 100,
    allowNegativeStock: false,
    active: true,
  },
  {
    id: 'prod-002',
    tenantId: 'tenant-01',
    name: 'Fresh Milk 1L',
    barcode: '600100010002',
    sku: 'MLK-01',
    category: 'Dairy',
    priceUSD: 1.50,
    taxCategoryId: 'tax-vat-zero',
    costPriceUSD: 1.10,
    stockQuantity: 40,
    allowNegativeStock: false,
    active: true,
  },
];

test('computeSnapshotChecksum: generates deterministic checksum and catches modifications', () => {
  const chk1 = computeSnapshotChecksum(mockProducts, mockTaxCategories);
  const chk2 = computeSnapshotChecksum(mockProducts, mockTaxCategories);
  assert.equal(chk1, chk2);
  assert.match(chk1, /^chk_[0-9a-f]+$/);

  // Altering price should alter checksum
  const modifiedProducts = [
    { ...mockProducts[0], priceUSD: 2.50 },
    mockProducts[1],
  ];
  const chkModified = computeSnapshotChecksum(modifiedProducts, mockTaxCategories);
  assert.notEqual(chk1, chkModified);
});

test('ProductCatalogService: saves, retrieves, and adjusts local products', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.init();
  const service = new ProductCatalogService(storage);

  await service.saveProduct(mockProducts[0]);
  const prods = await service.getLocalProducts();
  assert.equal(prods.length, 1);
  assert.equal(prods[0].id, 'prod-001');

  // Find by barcode
  const found = await service.getProductByBarcode('600100010001');
  assert.ok(found);
  assert.equal(found.name, 'Sugar 2kg');

  // Adjust stock
  await service.adjustStock('prod-001', -10);
  const updated = await service.getProductById('prod-001');
  assert.equal(updated?.stockQuantity, 90);

  // Update product price
  await service.saveProduct({ ...mockProducts[0], priceUSD: 2.45 });
  const afterUpdate = await service.getProductById('prod-001');
  assert.equal(afterUpdate?.priceUSD, 2.45);
});

test('ProductCatalogService: resolves price snapshot and tax snapshot accurately', () => {
  const storage = new MemoryStorageAdapter();
  const service = new ProductCatalogService(storage);

  const resolved = service.resolveProductSnapshot(
    mockProducts[0], // Sugar 2kg ($2.30, 15% standard VAT)
    mockTaxCategories,
    25.40, // 1 USD = 25.40 ZiG
    3
  );

  assert.equal(resolved.priceSnapshot.priceUSD, 2.30);
  assert.equal(resolved.priceSnapshot.priceZIG, 58.42); // 2.30 * 25.40 = 58.42
  assert.equal(resolved.priceSnapshot.snapshotVersion, 3);
  assert.equal(resolved.taxSnapshot.name, 'Standard VAT (15%)');
  assert.equal(resolved.taxSnapshot.rate, 0.15);

  // Gross inclusive VAT calculation: 2.30 / 1.15 = 2.00 net, 0.30 tax
  assert.equal(resolved.netPriceUSD, 2.00);
  assert.equal(resolved.calculatedTaxUSD, 0.30);
});

test('ProductCatalogService: creates and verifies durable offline catalog snapshots', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.init();
  const service = new ProductCatalogService(storage);

  const snapshot = await service.createSnapshot(
    'tenant-01',
    mockProducts,
    mockTaxCategories,
    25.40,
    0
  );

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.productsCount, 2);
  assert.equal(snapshot.isDurableOffline, true);
  assert.ok(snapshot.checksum);

  // Verify integrity
  assert.equal(service.verifySnapshotIntegrity(snapshot), true);

  // Check stored active snapshot
  const activeSnap = await service.getActiveSnapshot('tenant-01');
  assert.ok(activeSnap);
  assert.equal(activeSnap.version, 1);
  assert.equal(activeSnap.products.length, 2);

  // Create second version
  const snap2 = await service.createSnapshot(
    'tenant-01',
    mockProducts,
    mockTaxCategories,
    25.40,
    1
  );
  assert.equal(snap2.version, 2);
});

test('ProductCatalogService: syncs from central Laravel service and populates local storage', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.init();
  const service = new ProductCatalogService(storage);
  const central = new CentralLaravelService();

  const snapshot = await service.syncFromCentral('tenant-harare-01', central);
  assert.ok(snapshot);
  assert.ok(snapshot.products.length > 0);
  assert.equal(snapshot.tenantId, 'tenant-harare-01');

  // Verify local storage is populated
  const localProds = await service.getLocalProducts();
  assert.equal(localProds.length, snapshot.products.length);
});
