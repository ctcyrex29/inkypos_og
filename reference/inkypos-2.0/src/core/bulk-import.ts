/**
 * InkyPOS 2.0 — Bulk Product Import & Parser Utilities
 * InkGenius Technologies
 *
 * Supports CSV and JSON bulk ingestion with schema validation,
 * duplicate detection (barcode/SKU), and tax category normalization.
 */

import { Product } from './types.ts';
import { generateUUID } from './sales.ts';

export interface ParsedProductItem {
  raw: Record<string, string>;
  product: Product;
  isValid: boolean;
  errors: string[];
  isUpdate: boolean;
  existingId?: string;
}

export interface BulkImportResult {
  totalParsed: number;
  validCount: number;
  invalidCount: number;
  newCount: number;
  updateCount: number;
  items: ParsedProductItem[];
  validProducts: Product[];
}

/**
 * Robust single-pass CSV parser that handles quotes, escaped quotes, and commas inside quotes
 */
export function parseCsvString(csvText: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuote = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const records: Array<Record<string, string>> = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = row[c] !== undefined ? row[c] : '';
    }
    records.push(record);
  }

  return records;
}

/**
 * Normalizes tax category strings to valid IDs
 */
export function normalizeTaxCategoryId(val: string | undefined): string {
  if (!val) return 'tax-vat-std';
  const clean = val.toLowerCase().trim();

  if (clean.includes('zero') || clean === '0' || clean === '0%') {
    return 'tax-vat-zero';
  }
  if (clean.includes('exempt') || clean === 'none') {
    return 'tax-vat-exempt';
  }
  if (clean.includes('std') || clean.includes('standard') || clean.includes('15') || clean.includes('15%')) {
    return 'tax-vat-std';
  }
  return 'tax-vat-std';
}

/**
 * Validates and transforms raw parsed objects into validated Product entities
 */
export function validateAndTransformProducts(
  rawList: Array<Record<string, unknown>>,
  tenantId: string,
  existingProducts: Product[] = []
): BulkImportResult {
  const existingBarcodeMap = new Map(existingProducts.map((p) => [p.barcode.trim(), p]));
  const existingSkuMap = new Map(existingProducts.map((p) => [p.sku.trim().toLowerCase(), p]));

  const items: ParsedProductItem[] = [];
  const validProducts: Product[] = [];

  for (const raw of rawList) {
    const stringRecord: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      stringRecord[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = v !== null && v !== undefined ? String(v).trim() : '';
    }

    const errors: string[] = [];

    // 1. Name
    const name =
      stringRecord['name'] ||
      stringRecord['productname'] ||
      stringRecord['itemname'] ||
      stringRecord['title'] ||
      '';
    if (!name) {
      errors.push('Product name is required');
    }

    // 2. Barcode
    let barcode = stringRecord['barcode'] || stringRecord['upc'] || stringRecord['ean'] || '';
    if (!barcode) {
      barcode = `6001${Math.floor(10000000 + Math.random() * 90000000)}`;
    }

    // 3. SKU
    let sku = stringRecord['sku'] || stringRecord['code'] || stringRecord['itemcode'] || '';
    if (!sku) {
      sku = `SKU-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    }

    // 4. Category
    const category =
      stringRecord['category'] ||
      stringRecord['department'] ||
      stringRecord['group'] ||
      'General';

    // 5. Price USD
    const rawPrice =
      stringRecord['price'] ||
      stringRecord['priceusd'] ||
      stringRecord['sellingprice'] ||
      stringRecord['unitprice'] ||
      '0';
    const cleanPrice = parseFloat(rawPrice.replace(/[^0-9.-]/g, ''));
    if (isNaN(cleanPrice) || cleanPrice < 0) {
      errors.push(`Invalid price value: "${rawPrice}"`);
    }

    // 6. Cost Price
    const rawCost =
      stringRecord['cost'] ||
      stringRecord['costprice'] ||
      stringRecord['costusd'] ||
      '';
    const costPriceUSD = rawCost ? parseFloat(rawCost.replace(/[^0-9.-]/g, '')) : undefined;

    // 7. Stock Quantity
    const rawStock =
      stringRecord['stock'] ||
      stringRecord['quantity'] ||
      stringRecord['stockquantity'] ||
      stringRecord['qty'] ||
      '0';
    const stockQuantity = parseInt(rawStock.replace(/[^0-9-]/g, ''), 10);
    if (isNaN(stockQuantity) || stockQuantity < 0) {
      errors.push(`Invalid stock quantity: "${rawStock}"`);
    }

    // 8. Tax Category
    const rawTax =
      stringRecord['tax'] ||
      stringRecord['taxcategory'] ||
      stringRecord['vat'] ||
      stringRecord['taxrate'] ||
      '';
    const taxCategoryId = normalizeTaxCategoryId(rawTax);

    // Duplicate matching
    const existingMatch = existingBarcodeMap.get(barcode) || existingSkuMap.get(sku.toLowerCase());
    const isUpdate = !!existingMatch;
    const existingId = existingMatch?.id;

    const product: Product = {
      id: existingId || generateUUID(),
      tenantId,
      name,
      barcode,
      sku,
      category,
      priceUSD: isNaN(cleanPrice) ? 0 : cleanPrice,
      costPriceUSD: costPriceUSD !== undefined && !isNaN(costPriceUSD) ? costPriceUSD : undefined,
      taxCategoryId,
      stockQuantity: isNaN(stockQuantity) ? 0 : stockQuantity,
      allowNegativeStock: false,
      active: true,
    };

    const isValid = errors.length === 0;

    items.push({
      raw: stringRecord,
      product,
      isValid,
      errors,
      isUpdate,
      existingId,
    });

    if (isValid) {
      validProducts.push(product);
    }
  }

  const validCount = items.filter((i) => i.isValid).length;
  const invalidCount = items.length - validCount;
  const updateCount = items.filter((i) => i.isValid && i.isUpdate).length;
  const newCount = validCount - updateCount;

  return {
    totalParsed: items.length,
    validCount,
    invalidCount,
    newCount,
    updateCount,
    items,
    validProducts,
  };
}

/**
 * Sample CSV Template for quick user import & cashier testing
 */
export const SAMPLE_CSV_TEMPLATE = `name,barcode,sku,category,price,cost,tax,stock
"Mazoe Blackberry Crush 2L",600100010010,DRK-2L-10,Beverages,3.80,2.90,standard,45
"Lobels Prime White Bread 700g",600100010011,BRD-700G-11,Bakery,1.10,0.85,zero,120
"Colcom Pork Sausages 500g",600100010012,MET-500G-12,Butchery,4.50,3.60,standard,30
"Medicinal Paracetamol 500mg 20s",600100010013,MED-500MG-13,Pharmacy,0.90,0.60,exempt,150
"Bakers Choice Biscuits 200g",600100010014,BIS-200G-14,Confectionery,1.25,0.95,standard,80
"Probrands Iodised Table Salt 1kg",600100010015,SLT-1KG-15,Groceries,0.70,0.50,zero,200`;

/**
 * Sample JSON Template
 */
export const SAMPLE_JSON_TEMPLATE = JSON.stringify(
  [
    {
      name: 'Mazoe Blackberry Crush 2L',
      barcode: '600100010010',
      sku: 'DRK-2L-10',
      category: 'Beverages',
      priceUSD: 3.8,
      costPriceUSD: 2.9,
      taxCategoryId: 'tax-vat-std',
      stockQuantity: 45,
    },
    {
      name: 'Lobels Prime White Bread 700g',
      barcode: '600100010011',
      sku: 'BRD-700G-11',
      category: 'Bakery',
      priceUSD: 1.1,
      costPriceUSD: 0.85,
      taxCategoryId: 'tax-vat-zero',
      stockQuantity: 120,
    },
    {
      name: 'Colcom Pork Sausages 500g',
      barcode: '600100010012',
      sku: 'MET-500G-12',
      category: 'Butchery',
      priceUSD: 4.5,
      costPriceUSD: 3.6,
      taxCategoryId: 'tax-vat-std',
      stockQuantity: 30,
    },
    {
      name: 'Medicinal Paracetamol 500mg 20s',
      barcode: '600100010013',
      sku: 'MED-500MG-13',
      category: 'Pharmacy',
      priceUSD: 0.9,
      costPriceUSD: 0.6,
      taxCategoryId: 'tax-vat-exempt',
      stockQuantity: 150,
    },
  ],
  null,
  2
);
