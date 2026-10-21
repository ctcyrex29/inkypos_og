/**
 * InkyPOS 2.0 — Bulk Import Unit Tests
 * InkGenius Technologies
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsvString,
  normalizeTaxCategoryId,
  validateAndTransformProducts,
  SAMPLE_CSV_TEMPLATE,
  SAMPLE_JSON_TEMPLATE,
} from './bulk-import.ts';
import { Product } from './types.ts';
import { MemoryStorageAdapter } from '../storage/memory.ts';
import { ProductCatalogService } from './catalog-service.ts';

test('parseCsvString: correctly parses standard and quoted CSV text with commas', () => {
  const csv = `name,barcode,price,category
"Probrands Sugar, 2kg",6001001,2.40,Groceries
"Cooking Oil ""Pure Drop"" 2L",6001002,3.90,Groceries
Milk 1L,6001003,1.50,Dairy`;

  const rows = parseCsvString(csv);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, 'Probrands Sugar, 2kg');
  assert.equal(rows[0].barcode, '6001001');
  assert.equal(rows[0].price, '2.40');
  assert.equal(rows[1].name, 'Cooking Oil "Pure Drop" 2L');
  assert.equal(rows[2].name, 'Milk 1L');
});

test('normalizeTaxCategoryId: handles various tax naming conventions', () => {
  assert.equal(normalizeTaxCategoryId('15%'), 'tax-vat-std');
  assert.equal(normalizeTaxCategoryId('standard'), 'tax-vat-std');
  assert.equal(normalizeTaxCategoryId('zero'), 'tax-vat-zero');
  assert.equal(normalizeTaxCategoryId('0%'), 'tax-vat-zero');
  assert.equal(normalizeTaxCategoryId('exempt'), 'tax-vat-exempt');
  assert.equal(normalizeTaxCategoryId(undefined), 'tax-vat-std');
});

test('validateAndTransformProducts: validates valid products and flags invalid entries', () => {
  const rawList = [
    {
      name: 'Valid Bread 700g',
      barcode: '60019991',
      sku: 'BRD-01',
      price: '1.20',
      stock: '50',
      tax: 'zero',
    },
    {
      name: '', // Missing name!
      barcode: '60019992',
      price: '2.00',
    },
    {
      name: 'Invalid Price Item',
      barcode: '60019993',
      price: '-5.00', // Negative price
    },
  ];

  const result = validateAndTransformProducts(rawList, 'tenant-test', []);
  assert.equal(result.totalParsed, 3);
  assert.equal(result.validCount, 1);
  assert.equal(result.invalidCount, 2);
  assert.equal(result.validProducts.length, 1);
  assert.equal(result.validProducts[0].name, 'Valid Bread 700g');
  assert.equal(result.validProducts[0].priceUSD, 1.20);
  assert.equal(result.validProducts[0].taxCategoryId, 'tax-vat-zero');
});

test('validateAndTransformProducts: detects existing barcode and marks as update', () => {
  const existing: Product[] = [
    {
      id: 'prod-existing-1',
      tenantId: 'tenant-test',
      name: 'Old Sugar',
      barcode: '600100010001',
      sku: 'SUG-01',
      category: 'Groceries',
      priceUSD: 2.00,
      taxCategoryId: 'tax-vat-std',
      stockQuantity: 20,
      allowNegativeStock: false,
      active: true,
    },
  ];

  const incoming = [
    {
      name: 'Updated Sugar 2kg',
      barcode: '600100010001', // Same barcode!
      sku: 'SUG-01',
      price: '2.50',
      stock: '60',
    },
    {
      name: 'Brand New Item',
      barcode: '600100099999',
      price: '4.00',
      stock: '10',
    },
  ];

  const result = validateAndTransformProducts(incoming, 'tenant-test', existing);
  assert.equal(result.validCount, 2);
  assert.equal(result.updateCount, 1);
  assert.equal(result.newCount, 1);

  // The update preserves existing ID
  const updatedItem = result.items.find((i) => i.isUpdate);
  assert.ok(updatedItem);
  assert.equal(updatedItem.product.id, 'prod-existing-1');
  assert.equal(updatedItem.product.priceUSD, 2.50);
});

test('ProductCatalogService.bulkImportProducts: appends and updates local products with snapshot bump', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.init();
  const service = new ProductCatalogService(storage);

  const initialProducts: Product[] = [
    {
      id: 'p1',
      tenantId: 'tenant-test',
      name: 'Initial Item',
      barcode: '60011111',
      sku: 'INIT-01',
      category: 'General',
      priceUSD: 1.00,
      taxCategoryId: 'tax-vat-std',
      stockQuantity: 10,
      allowNegativeStock: false,
      active: true,
    },
  ];

  await service.createSnapshot('tenant-test', initialProducts);
  await storage.saveProducts(initialProducts);

  const parsed = parseCsvString(SAMPLE_CSV_TEMPLATE);
  const validated = validateAndTransformProducts(parsed, 'tenant-test', initialProducts);

  assert.ok(validated.validProducts.length > 0);

  // Import in append mode
  const importResult = await service.bulkImportProducts(
    'tenant-test',
    validated.validProducts,
    'append'
  );

  assert.equal(importResult.importedCount, validated.validProducts.length);
  // Total should be initial (1) + newly imported
  assert.equal(importResult.totalProductsCount, 1 + validated.validProducts.length);
  assert.equal(importResult.snapshot.version, 2);

  // Verify products persisted in storage
  const allStored = await service.getLocalProducts();
  assert.equal(allStored.length, 1 + validated.validProducts.length);
});

test('ProductCatalogService.bulkImportProducts: replace mode overwrites catalogue', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.init();
  const service = new ProductCatalogService(storage);

  const initialProducts: Product[] = [
    {
      id: 'p-old-1',
      tenantId: 'tenant-test',
      name: 'Old Deprecated Item',
      barcode: '60019999',
      sku: 'OLD-01',
      category: 'Old',
      priceUSD: 9.99,
      taxCategoryId: 'tax-vat-std',
      stockQuantity: 1,
      allowNegativeStock: false,
      active: true,
    },
  ];

  await storage.saveProducts(initialProducts);

  const newProducts: Product[] = [
    {
      id: 'p-new-1',
      tenantId: 'tenant-test',
      name: 'Fresh New Product',
      barcode: '60020000',
      sku: 'NEW-01',
      category: 'Fresh',
      priceUSD: 5.00,
      taxCategoryId: 'tax-vat-zero',
      stockQuantity: 100,
      allowNegativeStock: false,
      active: true,
    },
  ];

  const res = await service.bulkImportProducts('tenant-test', newProducts, 'replace');
  assert.equal(res.totalProductsCount, 1);
  const stored = await service.getLocalProducts();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Fresh New Product');
});
