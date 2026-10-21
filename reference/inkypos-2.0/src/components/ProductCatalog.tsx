/**
 * InkyPOS 2.0 — ProductCatalog Component
 * InkGenius Technologies
 *
 * Manages local product storage, offline price snapshots, tax matrices,
 * and immutable catalog snapshots for reliable offline-first operations.
 */

import React, { useState, useMemo, useRef } from 'react';
import { usePos } from '../context/PosContext.tsx';
import { Product, TaxCategory } from '../core/types.ts';
import { DEFAULT_TAX_CATEGORIES } from '../core/tax.ts';
import { formatCurrency, usdToZig, roundToDecimals } from '../core/currency.ts';
import {
  parseCsvString,
  validateAndTransformProducts,
  SAMPLE_CSV_TEMPLATE,
  SAMPLE_JSON_TEMPLATE,
  BulkImportResult,
  ParsedProductItem,
} from '../core/bulk-import.ts';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Download,
  ShieldCheck,
  FileCode,
  Tag,
  DollarSign,
  Percent,
  Check,
  Trash2,
  Edit2,
  Layers,
  Archive,
  AlertCircle,
  X,
  Database,
  Barcode,
  Upload,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  Copy,
  ArrowRight,
} from 'lucide-react';

export const ProductCatalog: React.FC = () => {
  const {
    products,
    activeSnapshot,
    saveProduct,
    deleteProduct,
    adjustProductStock,
    syncCatalogSnapshot,
    createLocalSnapshot,
    bulkImportProducts,
    currency,
    exchangeRate,
    tenant,
    isOnline,
  } = usePos();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedTaxFilter, setSelectedTaxFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Bulk Import state
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [importFormat, setImportFormat] = useState<'CSV' | 'JSON'>('CSV');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importText, setImportText] = useState('');
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [bulkImportTab, setBulkImportTab] = useState<'editor' | 'preview'>('editor');
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State for Add / Edit
  const [formName, setFormName] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formCategory, setFormCategory] = useState('Groceries');
  const [formPriceUSD, setFormPriceUSD] = useState('');
  const [formCostPriceUSD, setFormCostPriceUSD] = useState('');
  const [formTaxCategoryId, setFormTaxCategoryId] = useState('tax-vat-std');
  const [formStockQuantity, setFormStockQuantity] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Categories list
  const categories = ['ALL', ...Array.from(new Set(products.map((p) => p.category)))];

  // Filtered products list
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchesTax = selectedTaxFilter === 'ALL' || p.taxCategoryId === selectedTaxFilter;
    const matchesStock =
      stockFilter === 'ALL'
        ? true
        : stockFilter === 'LOW'
        ? p.stockQuantity > 0 && p.stockQuantity < 20
        : p.stockQuantity <= 0;

    return matchesSearch && matchesCat && matchesTax && matchesStock;
  });

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormBarcode(`6001${Date.now().toString().slice(-8)}`);
    setFormSku(`SKU-${Date.now().toString(36).toUpperCase()}`);
    setFormCategory('Groceries');
    setFormPriceUSD('2.50');
    setFormCostPriceUSD('1.80');
    setFormTaxCategoryId('tax-vat-std');
    setFormStockQuantity('50');
    setFormError(null);
    setIsProductModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormBarcode(p.barcode);
    setFormSku(p.sku);
    setFormCategory(p.category);
    setFormPriceUSD(p.priceUSD.toString());
    setFormCostPriceUSD(p.costPriceUSD ? p.costPriceUSD.toString() : '');
    setFormTaxCategoryId(p.taxCategoryId);
    setFormStockQuantity(p.stockQuantity.toString());
    setFormError(null);
    setIsProductModalOpen(true);
  };

  // Handle Form Submission
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Product name is required');
      return;
    }
    if (!formBarcode.trim()) {
      setFormError('Barcode is required');
      return;
    }
    const price = parseFloat(formPriceUSD);
    if (isNaN(price) || price < 0) {
      setFormError('Valid price in USD is required');
      return;
    }
    const stock = parseInt(formStockQuantity, 10);
    if (isNaN(stock) || stock < 0) {
      setFormError('Valid stock quantity is required');
      return;
    }

    const prodToSave: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now().toString(36)}`,
      tenantId: tenant.id,
      name: formName.trim(),
      barcode: formBarcode.trim(),
      sku: formSku.trim() || `SKU-${Date.now()}`,
      category: formCategory.trim() || 'General',
      priceUSD: price,
      costPriceUSD: formCostPriceUSD ? parseFloat(formCostPriceUSD) : undefined,
      taxCategoryId: formTaxCategoryId,
      stockQuantity: stock,
      allowNegativeStock: false,
      active: true,
    };

    try {
      await saveProduct(prodToSave);
      setIsProductModalOpen(false);
      setNotification(`Product "${prodToSave.name}" saved & snapshot updated locally.`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  // Handle Delete
  const handleDeleteProduct = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}" from local storage?`)) {
      await deleteProduct(id);
      setNotification(`Product "${name}" deleted & local snapshot refreshed.`);
    }
  };

  // Sync snapshot from Central Laravel Server
  const handleSyncFromCentral = async () => {
    setIsSyncing(true);
    try {
      const snap = await syncCatalogSnapshot();
      if (snap) {
        setNotification(
          `Central snapshot v${snap.version} loaded successfully (${snap.productsCount} products cached).`
        );
      }
    } catch (err: unknown) {
      setNotification(`Failed to sync snapshot: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Force local snapshot generation
  const handleCreateSnapshot = async () => {
    const snap = await createLocalSnapshot();
    if (snap) {
      setNotification(
        `Immutable snapshot v${snap.version} created locally (Checksum: ${snap.checksum}).`
      );
    }
  };

  // Bulk Import Parsing & Transformation (Memoized)
  const parsedBulkResult = useMemo<BulkImportResult | null>(() => {
    if (!importText.trim()) {
      setJsonParseError(null);
      return null;
    }

    try {
      if (importFormat === 'CSV') {
        setJsonParseError(null);
        const rows = parseCsvString(importText);
        if (rows.length === 0) return null;
        return validateAndTransformProducts(rows, tenant.id, products);
      } else {
        try {
          const parsed = JSON.parse(importText);
          setJsonParseError(null);
          const array = Array.isArray(parsed) ? parsed : [parsed];
          return validateAndTransformProducts(array, tenant.id, products);
        } catch (err: unknown) {
          setJsonParseError(err instanceof Error ? err.message : String(err));
          return null;
        }
      }
    } catch {
      return null;
    }
  }, [importText, importFormat, tenant.id, products]);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setImportText(content);
        if (
          file.name.endsWith('.json') ||
          content.trim().startsWith('[') ||
          content.trim().startsWith('{')
        ) {
          setImportFormat('JSON');
        } else {
          setImportFormat('CSV');
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Load sample templates
  const handleLoadSample = (format: 'CSV' | 'JSON') => {
    setImportFormat(format);
    setImportText(format === 'CSV' ? SAMPLE_CSV_TEMPLATE : SAMPLE_JSON_TEMPLATE);
    setImportFileName(`sample_${format.toLowerCase()}_products.${format.toLowerCase()}`);
    setJsonParseError(null);
  };

  // Download template
  const handleDownloadTemplate = (format: 'CSV' | 'JSON') => {
    const content = format === 'CSV' ? SAMPLE_CSV_TEMPLATE : SAMPLE_JSON_TEMPLATE;
    const blob = new Blob([content], {
      type: format === 'CSV' ? 'text/csv' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inkypos_products_template.${format.toLowerCase()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Execute bulk import
  const handleExecuteBulkImport = async () => {
    if (!parsedBulkResult || parsedBulkResult.validProducts.length === 0) return;
    setIsImporting(true);
    try {
      const res = await bulkImportProducts(parsedBulkResult.validProducts, importMode);
      if (res) {
        setNotification(
          `Successfully bulk imported ${res.importedCount} products (${
            importMode === 'replace' ? 'replaced catalogue' : 'merged with local catalogue'
          }). Immutable snapshot v${res.snapshot.version} generated (Hash: ${res.snapshot.checksum}).`
        );
      }
      setIsBulkImportModalOpen(false);
      setImportText('');
      setImportFileName(null);
      setBulkImportTab('editor');
    } catch (err: unknown) {
      setNotification(`Bulk import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-slate-900">
              Product Catalog & Offline Snapshots
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Durable local product storage with price and tax snapshots for offline-first checkout.
          </p>
        </div>

        {/* Snapshot Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSyncFromCentral}
            disabled={isSyncing || !isOnline}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors"
            title="Download authorized catalogue and tax snapshots from central Laravel API"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync from Central</span>
          </button>

          <button
            onClick={handleCreateSnapshot}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors"
            title="Generate local checksummed snapshot of current products and tax rules"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>Create Snapshot</span>
          </button>

          <button
            onClick={() => setIsSnapshotModalOpen(true)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors"
            title="Inspect raw snapshot JSON and checksum integrity"
          >
            <FileCode className="w-3.5 h-3.5 text-purple-600" />
            <span>Snapshot JSON</span>
          </button>

          <button
            onClick={() => {
              setIsBulkImportModalOpen(true);
              if (!importText) {
                handleLoadSample('CSV');
              }
            }}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-all"
            title="Bulk import products from CSV or JSON file/text"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Bulk Import</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-xs flex items-center justify-between">
          <span>{notification}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Snapshot Health & Offline Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Active Snapshot
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-lg font-black text-slate-900">
              v{activeSnapshot?.version || 1}
            </span>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
              DURABLE
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block truncate">
            Hash: {activeSnapshot?.checksum || 'chk_active'}
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Products in Storage
          </span>
          <div className="text-lg font-black text-indigo-600 mt-1">
            {products.length} Products
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Cached in IndexedDB / SQLite
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Tax Snapshot Rules
          </span>
          <div className="text-lg font-black text-slate-900 mt-1">
            {DEFAULT_TAX_CATEGORIES.length} Tax Classes
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Std 15% VAT, Zero-Rated, Exempt
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Dual-Currency Snapshot
          </span>
          <div className="text-lg font-black text-amber-700 mt-1">
            1 USD = {exchangeRate} ZiG
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Real-time rate conversion locked
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Text Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search product by name, barcode, or SKU..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Tax Filter */}
          <div className="flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label="Filter by Tax Category"
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedTaxFilter}
              onChange={(e) => setSelectedTaxFilter(e.target.value)}
            >
              <option value="ALL">All Tax Rates</option>
              <option value="tax-vat-std">Standard VAT (15%)</option>
              <option value="tax-vat-zero">Zero-Rated (0%)</option>
              <option value="tax-vat-exempt">Exempt (0%)</option>
            </select>
          </div>

          {/* Stock Level Filter */}
          <div className="flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label="Filter by Stock Status"
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as 'ALL' | 'LOW' | 'OUT')}
            >
              <option value="ALL">All Stock Levels</option>
              <option value="LOW">Low Stock (&lt; 20)</option>
              <option value="OUT">Out of Stock (0)</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs pt-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Cached Local Products ({filteredProducts.length} items)
          </h3>
          <span className="text-[11px] text-slate-500">
            Durable offline storage snapshot for {tenant.name}
          </span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Boxes className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-medium">No products match your current filters.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Adjust search keywords or click "Add Product" to create a new item.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Product Name & Barcode</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Price Snapshot (USD)</th>
                  <th className="py-2.5 px-3">Price Snapshot (ZiG)</th>
                  <th className="py-2.5 px-3">Tax Category Snapshot</th>
                  <th className="py-2.5 px-3">Stock Level</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const taxCat =
                    DEFAULT_TAX_CATEGORIES.find((t) => t.id === p.taxCategoryId) ||
                    DEFAULT_TAX_CATEGORIES[0];

                  const priceZIG = usdToZig(p.priceUSD, exchangeRate);
                  // VAT included breakdown
                  const netPrice = roundToDecimals(
                    taxCat.isExempt || taxCat.rate === 0
                      ? p.priceUSD
                      : p.priceUSD / (1 + taxCat.rate),
                    2
                  );
                  const taxAmount = roundToDecimals(p.priceUSD - netPrice, 2);

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                          <span>{p.barcode}</span>
                          <span>•</span>
                          <span>{p.sku}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                          {p.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-black text-slate-900">${p.priceUSD.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-400">Net: ${netPrice.toFixed(2)}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-amber-700">ZiG {priceZIG.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-400">1:{exchangeRate}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block ${
                            taxCat.isExempt
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : taxCat.rate === 0
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {taxCat.name} (${taxAmount.toFixed(2)} tax)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-bold ${
                              p.stockQuantity > 20
                                ? 'text-emerald-700'
                                : p.stockQuantity > 0
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {p.stockQuantity} units
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => adjustProductStock(p.id, -1)}
                              disabled={p.stockQuantity <= 0}
                              className="w-5 h-5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded flex items-center justify-center font-bold text-slate-600"
                              title="Decrement stock by 1"
                            >
                              -
                            </button>
                            <button
                              onClick={() => adjustProductStock(p.id, 1)}
                              className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-600"
                              title="Increment stock by 1"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Edit Product"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id, p.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">
                  {editingProduct ? 'Edit Local Product' : 'Add New Local Product'}
                </h3>
                <p className="text-[10px] text-slate-400">
                  Updates local SQLite/IndexedDB catalogue and regenerates price snapshot.
                </p>
              </div>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-4 space-y-3.5 text-xs">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Red Seal Rolled Oats 1kg"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Barcode *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 600100099881"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU</label>
                  <input
                    type="text"
                    placeholder="e.g. OAT-1KG-01"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Groceries"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tax Category Snapshot *
                  </label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                    value={formTaxCategoryId}
                    onChange={(e) => setFormTaxCategoryId(e.target.value)}
                  >
                    {DEFAULT_TAX_CATEGORIES.map((tax) => (
                      <option key={tax.id} value={tax.id}>
                        {tax.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Selling Price (USD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    value={formPriceUSD}
                    onChange={(e) => setFormPriceUSD(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cost Price (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    value={formCostPriceUSD}
                    onChange={(e) => setFormCostPriceUSD(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Stock Quantity *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    value={formStockQuantity}
                    onChange={(e) => setFormStockQuantity(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 space-y-1">
                <div className="font-semibold text-slate-700">Calculated Snapshot Preview:</div>
                <div>
                  ZiG Price: ZiG{' '}
                  {formPriceUSD ? usdToZig(parseFloat(formPriceUSD) || 0, exchangeRate).toFixed(2) : '0.00'}{' '}
                  (Exchange Rate 1:{exchangeRate})
                </div>
                <div>
                  Tax Apportionment:{' '}
                  {formTaxCategoryId === 'tax-vat-std'
                    ? '15% VAT included in gross price'
                    : 'Zero-rated or exempt from VAT'}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
                >
                  Save to Local Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Snapshot JSON Inspector Modal */}
      {isSnapshotModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Offline Catalog Snapshot Inspector</h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Snapshot ID: {activeSnapshot?.snapshotId || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => setIsSnapshotModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">
                    Version & Tenant:
                  </span>
                  <div className="mt-0.5 font-bold text-slate-800">
                    Version {activeSnapshot?.version} ({activeSnapshot?.tenantId})
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Checksum:</span>
                  <div className="mt-0.5 font-mono text-emerald-700 font-bold">
                    {activeSnapshot?.checksum} (VERIFIED)
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Created At:</span>
                  <div className="mt-0.5 text-slate-700">
                    {activeSnapshot ? new Date(activeSnapshot.createdAt).toLocaleString() : 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">
                    Products & Rules:
                  </span>
                  <div className="mt-0.5 text-slate-700">
                    {activeSnapshot?.productsCount} products, {activeSnapshot?.taxCategories.length} tax rules
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-800 block mb-1">
                  Raw Snapshot Payload (JSON):
                </span>
                <pre className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl text-[10px] font-mono overflow-x-auto max-h-72 leading-relaxed">
                  {JSON.stringify(activeSnapshot, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <span className="text-[11px] text-slate-500">
                Preserved across app restarts and network dropouts
              </span>
              <button
                onClick={() => setIsSnapshotModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Import Modal (CSV & JSON) */}
      {isBulkImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150 flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    Bulk Product Catalogue Ingestion
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Fast setup for local offline storage via CSV or JSON with automatic checksummed snapshot generation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkImportModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode & Format Controls Bar */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              {/* Format Toggle */}
              <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setImportFormat('CSV')}
                  className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                    importFormat === 'CSV'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>CSV Format</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportFormat('JSON')}
                  className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                    importFormat === 'JSON'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileJson className="w-3.5 h-3.5 text-indigo-600" />
                  <span>JSON Format</span>
                </button>
              </div>

              {/* Ingestion Strategy */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Mode:
                </span>
                <select
                  aria-label="Import mode"
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                >
                  <option value="append">Append &amp; Update (Safe Merge)</option>
                  <option value="replace">Replace All (Overwrite Catalogue)</option>
                </select>
                {importMode === 'replace' && (
                  <span className="text-[10px] bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                    Clears existing
                  </span>
                )}
              </div>

              {/* Quick Template Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleLoadSample(importFormat)}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 shadow-xs flex items-center gap-1 transition-colors"
                  title="Load sample Zimbabwean retail products"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Load Sample</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate(importFormat)}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 shadow-xs flex items-center gap-1 transition-colors"
                  title="Download template file to your computer"
                >
                  <Download className="w-3 h-3 text-slate-500" />
                  <span>Template</span>
                </button>
                {importText && (
                  <button
                    type="button"
                    onClick={() => {
                      setImportText('');
                      setImportFileName(null);
                      setJsonParseError(null);
                    }}
                    className="px-2 py-1 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Clear input"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Navigation Tabs (Editor vs Preview) */}
            <div className="flex border-b border-slate-200 bg-white px-4 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setBulkImportTab('editor')}
                className={`pb-2 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                  bulkImportTab === 'editor'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>1. Data Input &amp; File Upload</span>
              </button>
              <button
                type="button"
                onClick={() => setBulkImportTab('preview')}
                className={`pb-2 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                  bulkImportTab === 'preview'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>2. Ingestion Preview &amp; Validation</span>
                {parsedBulkResult && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      parsedBulkResult.invalidCount > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {parsedBulkResult.validCount} ready
                  </span>
                )}
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* TAB 1: Editor & Upload */}
              {bulkImportTab === 'editor' && (
                <div className="space-y-4">
                  {/* File Upload Drop Zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/70 hover:bg-emerald-50/20 rounded-xl p-4 text-center cursor-pointer transition-all group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.json,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 rounded-full bg-white shadow-xs flex items-center justify-center text-slate-500 group-hover:text-emerald-600 group-hover:scale-105 transition-all">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-semibold text-slate-700">
                        {importFileName ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            File loaded: {importFileName}
                          </span>
                        ) : (
                          <span>Click to upload CSV or JSON file from your computer</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Supports .csv, .json, and plain-text catalog exports
                      </p>
                    </div>
                  </div>

                  {/* JSON Parse Error Box */}
                  {jsonParseError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">JSON Syntax Error:</div>
                        <div className="font-mono text-[11px] mt-0.5">{jsonParseError}</div>
                      </div>
                    </div>
                  )}

                  {/* Direct Textarea */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-bold text-slate-700">
                        Direct {importFormat} Text Input:
                      </label>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {importText ? `${importText.split('\n').length} lines` : 'Empty'}
                      </span>
                    </div>
                    <textarea
                      rows={10}
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder={
                        importFormat === 'CSV'
                          ? 'name,barcode,sku,category,price,cost,tax,stock\n"Mazoe Crush 2L",600100010010,DRK-2L-10,Beverages,3.80,2.90,standard,45\n"Lobels Bread 700g",600100010011,BRD-700G-11,Bakery,1.10,0.85,zero,120'
                          : '[\n  {\n    "name": "Mazoe Crush 2L",\n    "barcode": "600100010010",\n    "priceUSD": 3.80,\n    "taxCategoryId": "tax-vat-std",\n    "stockQuantity": 45\n  }\n]'
                      }
                      className="w-full p-3 text-xs font-mono bg-slate-900 text-emerald-400 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                    />
                  </div>

                  {/* Quick Format Help Guide */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Expected Headers &amp; Field Mappings:</span>
                    </div>
                    <p>
                      <strong>Required:</strong> <code className="bg-slate-200 px-1 rounded">name</code>,{' '}
                      <code className="bg-slate-200 px-1 rounded">price</code> (USD).
                    </p>
                    <p>
                      <strong>Optional / Auto-generated:</strong>{' '}
                      <code className="bg-slate-200 px-1 rounded">barcode</code> (auto-generated if omitted),{' '}
                      <code className="bg-slate-200 px-1 rounded">sku</code>,{' '}
                      <code className="bg-slate-200 px-1 rounded">category</code> (defaults to "General"),{' '}
                      <code className="bg-slate-200 px-1 rounded">cost</code>,{' '}
                      <code className="bg-slate-200 px-1 rounded">tax</code> (
                      <em className="text-slate-500">standard/15%, zero/0%, or exempt</em>),{' '}
                      <code className="bg-slate-200 px-1 rounded">stock</code>.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: Preview & Validation */}
              {bulkImportTab === 'preview' && (
                <div className="space-y-4">
                  {!parsedBulkResult ? (
                    <div className="p-8 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-xs font-semibold">No valid data entered yet.</p>
                      <p className="text-[11px] mt-1">
                        Switch back to tab 1 or click "Load Sample" to load catalogue data.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleLoadSample(importFormat)}
                        className="mt-3 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                      >
                        Load Sample {importFormat} Data
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Summary KPI Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            Total Parsed
                          </span>
                          <div className="text-base font-black text-slate-900 mt-0.5">
                            {parsedBulkResult.totalParsed}
                          </div>
                        </div>
                        <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase">
                            Valid Items
                          </span>
                          <div className="text-base font-black text-emerald-700 mt-0.5">
                            {parsedBulkResult.validCount}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                          <span className="text-[10px] font-bold text-blue-600 uppercase">
                            New Products
                          </span>
                          <div className="text-base font-black text-blue-700 mt-0.5">
                            {parsedBulkResult.newCount}
                          </div>
                        </div>
                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                          <span className="text-[10px] font-bold text-amber-600 uppercase">
                            Updates Found
                          </span>
                          <div className="text-base font-black text-amber-700 mt-0.5">
                            {parsedBulkResult.updateCount}
                          </div>
                        </div>
                        <div
                          className={`p-3 rounded-xl border ${
                            parsedBulkResult.invalidCount > 0
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                        >
                          <span className="text-[10px] font-bold uppercase">Invalid / Skipped</span>
                          <div className="text-base font-black mt-0.5">
                            {parsedBulkResult.invalidCount}
                          </div>
                        </div>
                      </div>

                      {/* Error details callout if invalid items exist */}
                      {parsedBulkResult.invalidCount > 0 && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 text-xs text-rose-800">
                          <div className="font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-rose-600" />
                            <span>
                              {parsedBulkResult.invalidCount} rows contain validation errors and will be skipped:
                            </span>
                          </div>
                          <ul className="list-disc list-inside text-[11px] space-y-0.5">
                            {parsedBulkResult.items
                              .filter((i) => !i.isValid)
                              .map((item, idx) => (
                                <li key={idx}>
                                  Row {idx + 1} ({item.product.name || 'Unnamed'}):{' '}
                                  {item.errors.join(', ')}
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}

                      {/* Items Preview Table */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 p-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                          <span>Items Ready for Storage ({parsedBulkResult.items.length})</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            Conversion Rate: 1 USD = {exchangeRate} ZiG
                          </span>
                        </div>
                        <div className="overflow-x-auto max-h-60">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 sticky top-0">
                              <tr>
                                <th className="p-2">Status</th>
                                <th className="p-2">Product &amp; Barcode</th>
                                <th className="p-2">Category</th>
                                <th className="p-2">Price (USD)</th>
                                <th className="p-2">Price (ZiG)</th>
                                <th className="p-2">Tax Class</th>
                                <th className="p-2">Initial Stock</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-sans">
                              {parsedBulkResult.items.map((item, index) => {
                                const prod = item.product;
                                const zigPrice = usdToZig(prod.priceUSD, exchangeRate);
                                const taxClass =
                                  DEFAULT_TAX_CATEGORIES.find((t) => t.id === prod.taxCategoryId) ||
                                  DEFAULT_TAX_CATEGORIES[0];

                                return (
                                  <tr
                                    key={index}
                                    className={!item.isValid ? 'bg-rose-50/50' : 'hover:bg-slate-50'}
                                  >
                                    <td className="p-2">
                                      {!item.isValid ? (
                                        <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                                          INVALID
                                        </span>
                                      ) : item.isUpdate ? (
                                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                          UPDATE
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                          NEW
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-2">
                                      <div className="font-bold text-slate-900">
                                        {prod.name || '(Missing Name)'}
                                      </div>
                                      <div className="text-[10px] text-slate-500 font-mono">
                                        {prod.barcode} • {prod.sku}
                                      </div>
                                    </td>
                                    <td className="p-2 text-slate-600">{prod.category}</td>
                                    <td className="p-2 font-black text-slate-900">
                                      ${prod.priceUSD.toFixed(2)}
                                    </td>
                                    <td className="p-2 font-bold text-amber-700">
                                      ZiG {zigPrice.toFixed(2)}
                                    </td>
                                    <td className="p-2">
                                      <span className="text-[10px] font-medium bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                        {taxClass.name}
                                      </span>
                                    </td>
                                    <td className="p-2 font-bold text-slate-800">
                                      {prod.stockQuantity} units
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  Generates an immutable snapshot in IndexedDB / SQLite with checksum hash for offline POS checkout.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkImportModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>

                {bulkImportTab === 'editor' ? (
                  <button
                    type="button"
                    onClick={() => setBulkImportTab('preview')}
                    disabled={!importText.trim()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
                  >
                    <span>Preview &amp; Validate</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setBulkImportTab('editor')}
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition-all"
                    >
                      Back to Editor
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteBulkImport}
                      disabled={isImporting || !parsedBulkResult || parsedBulkResult.validCount === 0}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {isImporting
                          ? 'Importing...'
                          : `Confirm & Import ${parsedBulkResult?.validCount || 0} Products`}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
