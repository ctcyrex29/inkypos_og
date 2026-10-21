/**
 * InkyPOS 2.0 — Central Laravel + MySQL Service Simulator
 * Provides central API simulation enforcing multi-tenant isolation, idempotency,
 * transactional synchronization, device authorization/revocation, and audit logging.
 */

import {
  Branch,
  ConflictRecord,
  Product,
  Register,
  SaleTransaction,
  SubscriptionEntitlements,
  SyncEvent,
  Tenant,
  User,
} from '../core/types.ts';
import {
  CatalogueSnapshotResponse,
  DeviceRegisterRequest,
  DeviceRegisterResponse,
  EventAck,
  SyncBatchRequest,
  SyncBatchResponse,
} from './contracts.ts';
import { SUBSCRIPTION_TIERS } from '../core/subscription.ts';

// Initial Demo Seed Data
export const INITIAL_TENANTS: Tenant[] = [
  {
    id: 'tenant-harare-01',
    name: 'Harare Fresh Supermarkets',
    slug: 'harare-fresh',
    tin: '200194857-ZW',
    vatNumber: 'VAT-8849201',
    currency: 'USD',
    subscriptionTier: 'growth',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: '2027-12-31T23:59:59Z',
    lastServerSyncAt: new Date().toISOString(),
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tenant-bulawayo-02',
    name: 'Matopos Hardware & Spares',
    slug: 'matopos-hardware',
    tin: '300948215-ZW',
    vatNumber: 'VAT-3392810',
    currency: 'USD',
    subscriptionTier: 'starter',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: '2027-06-30T23:59:59Z',
    lastServerSyncAt: new Date().toISOString(),
    createdAt: '2026-02-15T00:00:00Z',
  },
];

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'branch-harare-cbd',
    tenantId: 'tenant-harare-01',
    name: 'Harare CBD Flagship',
    code: 'HRE-01',
    address: 'Corner First St & Nelson Mandela Ave',
    city: 'Harare',
    active: true,
  },
  {
    id: 'branch-harare-avondale',
    tenantId: 'tenant-harare-01',
    name: 'Avondale Shopping Centre',
    code: 'HRE-02',
    address: 'King George Rd',
    city: 'Harare',
    active: true,
  },
  {
    id: 'branch-bulawayo-main',
    tenantId: 'tenant-bulawayo-02',
    name: 'Bulawayo Industrial Site',
    code: 'BYO-01',
    address: 'Fife Street & 10th Ave',
    city: 'Bulawayo',
    active: true,
  },
];

export const INITIAL_REGISTERS: Register[] = [
  {
    id: 'reg-harare-01',
    tenantId: 'tenant-harare-01',
    branchId: 'branch-harare-cbd',
    name: 'Till 1 (Main Cashier)',
    deviceFingerprint: 'DEV-ANDROID-POS-T1',
    platform: 'android',
    status: 'authorized',
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: 'reg-harare-02',
    tenantId: 'tenant-harare-01',
    branchId: 'branch-harare-cbd',
    name: 'Till 2 (Express Lane)',
    deviceFingerprint: 'DEV-IOS-IPAD-T2',
    platform: 'ios',
    status: 'authorized',
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: 'reg-bulawayo-01',
    tenantId: 'tenant-bulawayo-02',
    branchId: 'branch-bulawayo-main',
    name: 'Till 1 (Counter POS)',
    deviceFingerprint: 'DEV-WEB-DESKTOP-B1',
    platform: 'web',
    status: 'authorized',
    lastSeenAt: new Date().toISOString(),
  },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-001',
    tenantId: 'tenant-harare-01',
    name: 'Probrands White Sugar 2kg',
    barcode: '600100010001',
    sku: 'SUG-2KG-01',
    category: 'Groceries',
    priceUSD: 2.40,
    taxCategoryId: 'tax-vat-std',
    costPriceUSD: 1.95,
    stockQuantity: 150,
    allowNegativeStock: false,
    active: true,
  },
  {
    id: 'prod-002',
    tenantId: 'tenant-harare-01',
    name: 'Gloria Self Raising Flour 2kg',
    barcode: '600100010002',
    sku: 'FLR-2KG-02',
    category: 'Groceries',
    priceUSD: 2.80,
    taxCategoryId: 'tax-vat-std',
    costPriceUSD: 2.20,
    stockQuantity: 85,
    allowNegativeStock: false,
    active: true,
  },
  {
    id: 'prod-003',
    tenantId: 'tenant-harare-01',
    name: 'Pure Drop Cooking Oil 2L',
    barcode: '600100010003',
    sku: 'OIL-2L-03',
    category: 'Groceries',
    priceUSD: 3.90,
    taxCategoryId: 'tax-vat-std',
    costPriceUSD: 3.10,
    stockQuantity: 40,
    allowNegativeStock: false,
    active: true,
  },
  {
    id: 'prod-004',
    tenantId: 'tenant-harare-01',
    name: 'Dairibord Chimombe Milk 1L',
    barcode: '600100010004',
    sku: 'MLK-1L-04',
    category: 'Dairy',
    priceUSD: 1.50,
    taxCategoryId: 'tax-vat-zero',
    costPriceUSD: 1.15,
    stockQuantity: 60,
    allowNegativeStock: false,
    active: true,
  },
  {
    id: 'prod-005',
    tenantId: 'tenant-harare-01',
    name: 'Mazoe Orange Crush 2L',
    barcode: '600100010005',
    sku: 'DRK-2L-05',
    category: 'Beverages',
    priceUSD: 3.60,
    taxCategoryId: 'tax-vat-std',
    costPriceUSD: 2.80,
    stockQuantity: 95,
    allowNegativeStock: false,
    active: true,
  },
  {
    id: 'prod-006',
    tenantId: 'tenant-harare-01',
    name: 'Sunlight Dishwashing Liquid 750ml',
    barcode: '600100010006',
    sku: 'CLN-750ML-06',
    category: 'Household',
    priceUSD: 1.80,
    taxCategoryId: 'tax-vat-std',
    costPriceUSD: 1.30,
    stockQuantity: 50,
    allowNegativeStock: false,
    active: true,
  },
  // Bulawayo Hardware Products
  {
    id: 'prod-byo-101',
    tenantId: 'tenant-bulawayo-02',
    name: 'PPC Surebuild Cement 50kg',
    barcode: '600200020001',
    sku: 'CEM-50KG-01',
    category: 'Building',
    priceUSD: 9.50,
    taxCategoryId: 'tax-vat-std',
    costPriceUSD: 7.80,
    stockQuantity: 200,
    allowNegativeStock: false,
    active: true,
  },
  {
    id: 'prod-byo-102',
    tenantId: 'tenant-bulawayo-02',
    name: 'Steel Roofing Nails 1kg (65mm)',
    barcode: '600200020002',
    sku: 'NLS-1KG-02',
    category: 'Fasteners',
    priceUSD: 3.20,
    taxCategoryId: 'tax-vat-std',
    costPriceUSD: 2.10,
    stockQuantity: 80,
    allowNegativeStock: false,
    active: true,
  },
];

export class CentralLaravelService {
  private tenants: Map<string, Tenant> = new Map();
  private branches: Map<string, Branch> = new Map();
  private registers: Map<string, Register> = new Map();
  private products: Map<string, Product> = new Map();
  private centralSales: Map<string, SaleTransaction> = new Map();
  // Central Idempotency Table: idempotencyKey -> EventAck
  private idempotencyStore: Map<string, EventAck> = new Map();
  private auditLogs: Array<{ timestamp: string; action: string; details: unknown }> = [];

  constructor() {
    this.seed();
  }

  private seed() {
    for (const t of INITIAL_TENANTS) this.tenants.set(t.id, { ...t });
    for (const b of INITIAL_BRANCHES) this.branches.set(b.id, { ...b });
    for (const r of INITIAL_REGISTERS) this.registers.set(r.id, { ...r });
    for (const p of INITIAL_PRODUCTS) this.products.set(p.id, { ...p });
  }

  // Multi-tenant check
  private verifyTenantAccess(tenantId: string): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant with ID ${tenantId} not found`);
    }
    return tenant;
  }

  async getCatalogueSnapshot(tenantId: string): Promise<CatalogueSnapshotResponse> {
    const tenant = this.verifyTenantAccess(tenantId);
    const tenantProducts = Array.from(this.products.values()).filter(
      (p) => p.tenantId === tenantId && p.active
    );

    return {
      tenantId: tenant.id,
      snapshotVersion: 1,
      products: tenantProducts,
      exchangeRateUSDToZIG: 25.40,
      primaryCurrency: tenant.currency,
      taxCategories: [
        { id: 'tax-vat-std', name: 'Standard VAT (15%)', rate: 0.15, isExempt: false },
        { id: 'tax-vat-zero', name: 'Zero-Rated (0%)', rate: 0.0, isExempt: false },
        { id: 'tax-vat-exempt', name: 'Exempt', rate: 0.0, isExempt: true },
      ],
      syncedAt: new Date().toISOString(),
    };
  }

  async registerDevice(req: DeviceRegisterRequest): Promise<DeviceRegisterResponse> {
    const tenant = Array.from(this.tenants.values()).find((t) => t.slug === req.tenantSlug);
    if (!tenant) {
      throw new Error(`Invalid tenant slug '${req.tenantSlug}'`);
    }

    const branch = this.branches.get(req.branchId);
    if (!branch || branch.tenantId !== tenant.id) {
      throw new Error(`Branch ${req.branchId} does not belong to tenant ${tenant.name}`);
    }

    const existingRegisters = Array.from(this.registers.values()).filter(
      (r) => r.tenantId === tenant.id && r.status === 'authorized'
    );

    const entitlements = SUBSCRIPTION_TIERS[tenant.subscriptionTier];
    if (existingRegisters.length >= entitlements.maxRegisters) {
      throw new Error(
        `Subscription limit reached. ${tenant.subscriptionTier} tier allows maximum ${entitlements.maxRegisters} registers.`
      );
    }

    const registerId = `reg-${Date.now().toString(36)}`;
    const newRegister: Register = {
      id: registerId,
      tenantId: tenant.id,
      branchId: branch.id,
      name: req.deviceName,
      deviceFingerprint: req.deviceFingerprint,
      platform: req.platform,
      status: 'authorized',
      lastSeenAt: new Date().toISOString(),
    };

    this.registers.set(registerId, newRegister);

    const dummyUser: User = {
      id: `usr-${Date.now().toString(36)}`,
      tenantId: tenant.id,
      email: 'cashier@inkypos.internal',
      name: 'Shift Cashier',
      role: 'cashier',
      active: true,
    };

    return {
      deviceToken: `dtok_${Buffer.from(`${tenant.id}:${registerId}:${Date.now()}`).toString('base64')}`,
      register: newRegister,
      tenant,
      branch,
      entitlements,
      assignedCashier: dummyUser,
    };
  }

  async revokeDevice(registerId: string): Promise<void> {
    const reg = this.registers.get(registerId);
    if (reg) {
      reg.status = 'revoked';
      this.registers.set(registerId, reg);
      this.auditLogs.push({
        timestamp: new Date().toISOString(),
        action: 'DEVICE_REVOKED',
        details: { registerId, deviceName: reg.name, tenantId: reg.tenantId },
      });
    }
  }

  async authorizeDevice(registerId: string): Promise<void> {
    const reg = this.registers.get(registerId);
    if (reg) {
      reg.status = 'authorized';
      this.registers.set(registerId, reg);
    }
  }

  /**
   * Batch Event Sync with Idempotency & Conflict Management
   */
  async syncBatch(req: SyncBatchRequest): Promise<SyncBatchResponse> {
    const register = this.registers.get(req.registerId);
    if (!register) {
      throw new Error(`Register ${req.registerId} is not recognized by central server`);
    }

    // Check device authorization
    if (register.status === 'revoked') {
      const acks: EventAck[] = req.events.map((e) => ({
        eventId: e.eventId,
        idempotencyKey: e.idempotencyKey,
        status: 'CONFLICT' as const,
        conflict: {
          conflictId: `conf-revoked-${e.eventId}`,
          reason: 'DEVICE_REVOKED',
          serverState: { registerStatus: 'revoked' },
          clientState: { registerId: req.registerId },
          resolutionStrategy: 'MANUAL_MANAGER_REVIEW',
        },
        message: 'This device has been revoked by tenant administration.',
      }));

      return {
        processedCount: 0,
        duplicateCount: 0,
        conflictCount: req.events.length,
        acknowledgements: acks,
        serverTimestamp: new Date().toISOString(),
      };
    }

    // Update last seen
    register.lastSeenAt = new Date().toISOString();
    this.registers.set(register.id, register);

    let processedCount = 0;
    let duplicateCount = 0;
    let conflictCount = 0;
    const acknowledgements: EventAck[] = [];

    for (const event of req.events) {
      // 1. Server-Enforced Idempotency Check
      const existingAck = this.idempotencyStore.get(event.idempotencyKey);
      if (existingAck) {
        duplicateCount++;
        acknowledgements.push({
          ...existingAck,
          status: 'DUPLICATE_ACK',
          message: 'Already committed on central server. Re-acknowledging safely.',
        });
        continue;
      }

      // 2. Process Event Type
      if (event.eventType === 'SALE_CREATED') {
        const sale = event.payload as SaleTransaction;

        // Verify Tenant Isolation
        if (sale.tenantId !== register.tenantId) {
          conflictCount++;
          const conflictAck: EventAck = {
            eventId: event.eventId,
            idempotencyKey: event.idempotencyKey,
            status: 'CONFLICT',
            conflict: {
              conflictId: `conf-tenant-${event.eventId}`,
              reason: 'SUBSCRIPTION_LOCKED',
              serverState: { expectedTenant: register.tenantId },
              clientState: { saleTenant: sale.tenantId },
              resolutionStrategy: 'SERVER_AUTHORITY',
            },
            message: 'Cross-tenant violation: Sale tenant does not match register authorization.',
          };
          this.idempotencyStore.set(event.idempotencyKey, conflictAck);
          acknowledgements.push(conflictAck);
          continue;
        }

        // Commit central sale atomically
        this.centralSales.set(sale.id, sale);

        // Adjust central inventory ledger
        for (const item of sale.items) {
          const product = this.products.get(item.product.id);
          if (product) {
            product.stockQuantity -= item.quantity;
            this.products.set(product.id, product);
          }
        }

        const ack: EventAck = {
          eventId: event.eventId,
          idempotencyKey: event.idempotencyKey,
          status: 'PROCESSED',
          centralSaleId: sale.id,
          message: 'Central sale committed and inventory adjusted successfully.',
        };

        this.idempotencyStore.set(event.idempotencyKey, ack);
        acknowledgements.push(ack);
        processedCount++;

        this.auditLogs.push({
          timestamp: new Date().toISOString(),
          action: 'CENTRAL_SALE_COMMITTED',
          details: {
            saleId: sale.id,
            receiptNumber: sale.localReceiptNumber,
            totalUSD: sale.totalUSD,
            tenantId: sale.tenantId,
            registerId: sale.registerId,
          },
        });
      } else {
        // Generic acknowledge for other events
        const ack: EventAck = {
          eventId: event.eventId,
          idempotencyKey: event.idempotencyKey,
          status: 'PROCESSED',
        };
        this.idempotencyStore.set(event.idempotencyKey, ack);
        acknowledgements.push(ack);
        processedCount++;
      }
    }

    return {
      processedCount,
      duplicateCount,
      conflictCount,
      acknowledgements,
      serverTimestamp: new Date().toISOString(),
    };
  }

  // Diagnostics and Reconciliation
  getCentralSales(tenantId: string): SaleTransaction[] {
    return Array.from(this.centralSales.values()).filter((s) => s.tenantId === tenantId);
  }

  getAllTenants(): Tenant[] {
    return Array.from(this.tenants.values());
  }

  getAllBranches(tenantId?: string): Branch[] {
    const all = Array.from(this.branches.values());
    return tenantId ? all.filter((b) => b.tenantId === tenantId) : all;
  }

  getAllRegisters(tenantId?: string): Register[] {
    const all = Array.from(this.registers.values());
    return tenantId ? all.filter((r) => r.tenantId === tenantId) : all;
  }

  getAuditLogs() {
    return [...this.auditLogs];
  }
}

// Singleton instance for in-memory central simulation
export const centralService = new CentralLaravelService();
