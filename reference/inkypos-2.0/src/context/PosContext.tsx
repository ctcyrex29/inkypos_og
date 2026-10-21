/**
 * InkyPOS 2.0 — POS State Context
 * Orchestrates local offline storage, active register session, cart, outbox sync,
 * and central server communication.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  Branch,
  CartItem,
  CurrencyCode,
  OfflineGraceStatus,
  OutboxItem,
  PaymentRecord,
  Product,
  Register,
  SaleTransaction,
  Tenant,
  User,
} from '../core/types.ts';
import { IStorageAdapter } from '../storage/adapter.ts';
import { getDefaultStorageAdapter } from '../storage/index.ts';
import { centralService } from '../api/central-service.ts';
import { buildSaleTransaction } from '../core/sales.ts';
import { DEFAULT_ZIG_RATE, roundToDecimals } from '../core/currency.ts';
import { evaluateOfflineGraceStatus } from '../core/subscription.ts';
import { determineNextOutboxState } from '../core/sync.ts';
import {
  ProductCatalogService,
  CatalogSnapshot,
} from '../core/catalog-service.ts';
import { DEFAULT_TAX_CATEGORIES } from '../core/tax.ts';

interface PosContextType {
  storage: IStorageAdapter | null;
  isInitialized: boolean;
  // Network simulation
  isOnline: boolean;
  setIsOnline: (val: boolean) => void;
  // Active tenant & session
  tenant: Tenant;
  setTenant: (tenant: Tenant) => void;
  branch: Branch;
  register: Register;
  cashier: User;
  // Multi-currency
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  exchangeRate: number;
  setExchangeRate: (rate: number) => void;
  // Catalogue & Snapshots
  catalogService: ProductCatalogService | null;
  products: Product[];
  activeSnapshot: CatalogSnapshot | null;
  refreshProducts: () => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  adjustProductStock: (productId: string, delta: number) => Promise<void>;
  syncCatalogSnapshot: () => Promise<CatalogSnapshot | null>;
  createLocalSnapshot: () => Promise<CatalogSnapshot | null>;
  bulkImportProducts: (
    productsToImport: Product[],
    mode?: 'append' | 'replace'
  ) => Promise<{ importedCount: number; snapshot: CatalogSnapshot } | null>;
  // Cart
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  // Checkout
  checkout: (payments: PaymentRecord[]) => Promise<SaleTransaction>;
  lastCompletedSale: SaleTransaction | null;
  setLastCompletedSale: (s: SaleTransaction | null) => void;
  // Outbox & Sync
  outboxItems: OutboxItem[];
  refreshOutbox: () => Promise<void>;
  triggerSync: () => Promise<{ success: boolean; message: string }>;
  simulateLostAck: (sale: SaleTransaction) => Promise<void>;
  simulateConflict: () => Promise<void>;
  // Local Sales
  localSales: SaleTransaction[];
  refreshSales: () => Promise<void>;
  // Offline grace
  graceStatus: OfflineGraceStatus;
  simulateGraceOffsetDays: (days: number) => void;
}

const PosContext = createContext<PosContextType | undefined>(undefined);

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [storage, setStorage] = useState<IStorageAdapter | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Active Tenant & Session
  const [tenants, setTenants] = useState<Tenant[]>(centralService.getAllTenants());
  const [tenant, setTenantState] = useState<Tenant>(centralService.getAllTenants()[0]);
  const [branch, setBranch] = useState<Branch>(centralService.getAllBranches(tenant.id)[0]);
  const [register, setRegister] = useState<Register>(centralService.getAllRegisters(tenant.id)[0]);
  const [cashier] = useState<User>({
    id: 'usr-ch-01',
    tenantId: tenant.id,
    name: 'Tinashe Moyo',
    email: 'tinashe@inkypos.zw',
    role: 'cashier',
    active: true,
  });

  const [catalogService, setCatalogService] = useState<ProductCatalogService | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<CatalogSnapshot | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(DEFAULT_ZIG_RATE);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);
  const [localSales, setLocalSales] = useState<SaleTransaction[]>([]);
  const [lastCompletedSale, setLastCompletedSale] = useState<SaleTransaction | null>(null);
  const [sequenceNumber, setSequenceNumber] = useState(1);
  const [simulatedDaysAgo, setSimulatedDaysAgo] = useState(0);

  // Initialize storage & catalog service
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const adapter = await getDefaultStorageAdapter();
        if (!mounted) return;
        setStorage(adapter);

        const catService = new ProductCatalogService(adapter);
        setCatalogService(catService);

        // Fetch or load active snapshot
        let snap = await catService.getActiveSnapshot(tenant.id);
        if (!snap) {
          snap = await catService.syncFromCentral(tenant.id, centralService);
        }
        setActiveSnapshot(snap);

        const loadedProds = await adapter.getProducts();
        const loadedSales = await adapter.getSales();
        const loadedOutbox = await adapter.getOutboxItems();

        setProducts(loadedProds);
        setLocalSales(loadedSales);
        setOutboxItems(loadedOutbox);
        setSequenceNumber(loadedSales.length + 1);
        setIsInitialized(true);
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, [tenant.id]);

  const setTenant = async (newTenant: Tenant) => {
    setTenantState(newTenant);
    const tenantBranches = centralService.getAllBranches(newTenant.id);
    const tenantRegisters = centralService.getAllRegisters(newTenant.id);
    if (tenantBranches.length > 0) setBranch(tenantBranches[0]);
    if (tenantRegisters.length > 0) setRegister(tenantRegisters[0]);
    setCart([]);

    if (storage) {
      const snapshot = await centralService.getCatalogueSnapshot(newTenant.id);
      await storage.saveProducts(snapshot.products);
      const prods = await storage.getProducts();
      setProducts(prods);
    }
  };

  const refreshProducts = useCallback(async () => {
    if (!storage) return;
    const prods = await storage.getProducts();
    setProducts(prods);
  }, [storage]);

  const saveProduct = async (product: Product) => {
    if (!catalogService) return;
    await catalogService.saveProduct(product);
    await refreshProducts();
    const updated = await catalogService.getLocalProducts();
    const newSnap = await catalogService.createSnapshot(
      tenant.id,
      updated,
      activeSnapshot?.taxCategories || DEFAULT_TAX_CATEGORIES,
      exchangeRate,
      activeSnapshot ? activeSnapshot.version : 0
    );
    setActiveSnapshot(newSnap);
  };

  const deleteProduct = async (productId: string) => {
    if (!catalogService) return;
    await catalogService.deleteProduct(productId);
    await refreshProducts();
    const updated = await catalogService.getLocalProducts();
    const newSnap = await catalogService.createSnapshot(
      tenant.id,
      updated,
      activeSnapshot?.taxCategories || DEFAULT_TAX_CATEGORIES,
      exchangeRate,
      activeSnapshot ? activeSnapshot.version : 0
    );
    setActiveSnapshot(newSnap);
  };

  const adjustProductStock = async (productId: string, delta: number) => {
    if (!catalogService) return;
    await catalogService.adjustStock(productId, delta);
    await refreshProducts();
  };

  const syncCatalogSnapshot = async (): Promise<CatalogSnapshot | null> => {
    if (!catalogService) return null;
    const snap = await catalogService.syncFromCentral(tenant.id, centralService);
    setActiveSnapshot(snap);
    await refreshProducts();
    return snap;
  };

  const createLocalSnapshot = async (): Promise<CatalogSnapshot | null> => {
    if (!catalogService) return null;
    const currentProds = await catalogService.getLocalProducts();
    const snap = await catalogService.createSnapshot(
      tenant.id,
      currentProds,
      activeSnapshot?.taxCategories || DEFAULT_TAX_CATEGORIES,
      exchangeRate,
      activeSnapshot ? activeSnapshot.version : 0
    );
    setActiveSnapshot(snap);
    return snap;
  };

  const bulkImportProducts = async (
    productsToImport: Product[],
    mode: 'append' | 'replace' = 'append'
  ): Promise<{ importedCount: number; snapshot: CatalogSnapshot } | null> => {
    if (!catalogService) return null;
    const result = await catalogService.bulkImportProducts(
      tenant.id,
      productsToImport,
      mode,
      exchangeRate,
      activeSnapshot?.taxCategories || DEFAULT_TAX_CATEGORIES
    );
    setActiveSnapshot(result.snapshot);
    await refreshProducts();
    return {
      importedCount: result.importedCount,
      snapshot: result.snapshot,
    };
  };

  const refreshSales = useCallback(async () => {
    if (!storage) return;
    const sales = await storage.getSales();
    setLocalSales(sales);
  }, [storage]);

  const refreshOutbox = useCallback(async () => {
    if (!storage) return;
    const items = await storage.getOutboxItems();
    setOutboxItems(items);
  }, [storage]);

  // Cart operations
  const addToCart = (product: Product, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        const newQty = existing.quantity + quantity;
        const totalUSD = roundToDecimals(product.priceUSD * newQty, 2);
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: newQty, totalUSD }
            : item
        );
      }
      return [
        ...prev,
        {
          product,
          quantity,
          unitPriceUSD: product.priceUSD,
          discountUSD: 0,
          taxAmountUSD: roundToDecimals(product.priceUSD * 0.15, 2),
          totalUSD: roundToDecimals(product.priceUSD * quantity, 2),
        },
      ];
    });
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              quantity,
              totalUSD: roundToDecimals(item.product.priceUSD * quantity - item.discountUSD, 2),
            }
          : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  // Atomic Checkout
  const checkout = async (payments: PaymentRecord[]): Promise<SaleTransaction> => {
    if (!storage) throw new Error('Storage adapter not ready');
    if (cart.length === 0) throw new Error('Cart is empty');

    const result = buildSaleTransaction({
      tenantId: tenant.id,
      branchId: branch.id,
      registerId: register.id,
      registerCode: branch.code,
      sequenceNumber,
      cashierId: cashier.id,
      cashierName: cashier.name,
      items: cart.map((c) => ({
        product: c.product,
        quantity: c.quantity,
        discountUSD: c.discountUSD,
      })),
      payments,
      primaryCurrency: currency,
      exchangeRate,
    });

    // 1. Atomically write Sale to local storage
    await storage.saveSale(result.sale);

    // 2. Adjust local product stock
    for (const item of result.sale.items) {
      await storage.adjustProductStock(item.product.id, -item.quantity);
    }

    // 3. Save durable sync event to outbox
    await storage.saveOutboxItem(result.outboxItem);

    setSequenceNumber((prev) => prev + 1);
    setLastCompletedSale(result.sale);
    setCart([]);

    await refreshProducts();
    await refreshSales();
    await refreshOutbox();

    // If online, trigger background sync
    if (isOnline) {
      setTimeout(() => {
        triggerSync();
      }, 500);
    }

    return result.sale;
  };

  // Synchronize Outbox with Central Service
  const triggerSync = async (): Promise<{ success: boolean; message: string }> => {
    if (!storage) return { success: false, message: 'Storage not available' };
    if (!isOnline) {
      return { success: false, message: 'Terminal is currently in Offline Mode' };
    }

    const pendingItems = await storage.getOutboxItems('PENDING');
    if (pendingItems.length === 0) {
      return { success: true, message: 'Outbox is clean. All events synchronized.' };
    }

    try {
      // Mark as SYNCING locally
      for (const item of pendingItems) {
        await storage.updateOutboxItem(item.id, { status: 'SYNCING' });
      }
      await refreshOutbox();

      // Submit batch to central Laravel service
      const response = await centralService.syncBatch({
        registerId: register.id,
        deviceToken: 'mock-device-token-auth',
        clientTimestamp: new Date().toISOString(),
        events: pendingItems.map((i) => i.syncEvent),
      });

      // Process acknowledgements
      for (const ack of response.acknowledgements) {
        const item = pendingItems.find((p) => p.syncEvent.eventId === ack.eventId);
        if (!item) continue;

        if (ack.status === 'PROCESSED' || ack.status === 'DUPLICATE_ACK') {
          const nextState = determineNextOutboxState(item, {
            success: true,
            isDuplicate: ack.status === 'DUPLICATE_ACK',
          });
          await storage.updateOutboxItem(item.id, nextState);
        } else if (ack.status === 'CONFLICT') {
          const nextState = determineNextOutboxState(item, {
            success: false,
            conflict: ack.conflict,
            errorMessage: ack.message,
          });
          await storage.updateOutboxItem(item.id, nextState);
        }
      }

      await refreshOutbox();
      return {
        success: true,
        message: `Synced ${response.processedCount} events (${response.duplicateCount} duplicates safely acknowledged, ${response.conflictCount} conflicts).`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Revert items back to pending with incremented retry count
      for (const item of pendingItems) {
        const nextState = determineNextOutboxState(item, {
          success: false,
          networkError: true,
          errorMessage: errorMsg,
        });
        await storage.updateOutboxItem(item.id, nextState);
      }
      await refreshOutbox();
      return { success: false, message: `Sync failed: ${errorMsg}` };
    }
  };

  // Simulate Lost ACK recovery
  const simulateLostAck = async (sale: SaleTransaction) => {
    if (!storage) return;
    const existingOutbox = await storage.getOutboxItems();
    const target = existingOutbox.find(
      (o) => o.syncEvent.payload && (o.syncEvent.payload as SaleTransaction).id === sale.id
    );

    if (target) {
      // Reset status to PENDING as if client lost the response
      await storage.updateOutboxItem(target.id, { status: 'PENDING' });
      await refreshOutbox();
    }
  };

  // Simulate conflict by trying to sync a sale assigned to another tenant
  const simulateConflict = async () => {
    if (!storage) return;
    const conflictItem: OutboxItem = {
      id: `out-conflict-${Date.now()}`,
      syncEvent: {
        eventId: `evt-conf-${Date.now()}`,
        eventType: 'SALE_CREATED',
        eventVersion: 1,
        tenantId: 'tenant-bulawayo-02', // deliberate mismatch
        branchId: branch.id,
        registerId: register.id,
        idempotencyKey: `sale:conflict-test:${Date.now()}`,
        payload: {
          id: `sale-conf-${Date.now()}`,
          tenantId: 'tenant-bulawayo-02',
          totalUSD: 45.0,
        },
        occurredAt: new Date().toISOString(),
      },
      status: 'PENDING',
      retryCount: 0,
      nextRetryAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await storage.saveOutboxItem(conflictItem);
    await refreshOutbox();
  };

  // Grace Period simulation
  const simulateGraceOffsetDays = (days: number) => {
    setSimulatedDaysAgo(days);
  };

  // Evaluate grace status based on simulated date
  const simulatedCurrentTime = new Date(Date.now() + simulatedDaysAgo * 24 * 60 * 60 * 1000);
  const graceStatus = evaluateOfflineGraceStatus(tenant, simulatedCurrentTime);

  return (
    <PosContext.Provider
      value={{
        storage,
        isInitialized,
        isOnline,
        setIsOnline,
        tenant,
        setTenant,
        branch,
        register,
        cashier,
        currency,
        setCurrency,
        exchangeRate,
        setExchangeRate,
        catalogService,
        products,
        activeSnapshot,
        refreshProducts,
        saveProduct,
        deleteProduct,
        adjustProductStock,
        syncCatalogSnapshot,
        createLocalSnapshot,
        bulkImportProducts,
        cart,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        checkout,
        lastCompletedSale,
        setLastCompletedSale,
        outboxItems,
        refreshOutbox,
        triggerSync,
        simulateLostAck,
        simulateConflict,
        localSales,
        refreshSales,
        graceStatus,
        simulateGraceOffsetDays,
      }}
    >
      {children}
    </PosContext.Provider>
  );
};

export function usePos() {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error('usePos must be used within a PosProvider');
  }
  return context;
}
