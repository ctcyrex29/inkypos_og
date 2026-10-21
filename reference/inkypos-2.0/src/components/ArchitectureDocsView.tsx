/**
 * InkyPOS 2.0 — Architecture & Implementation Backlog Specifications
 * InkGenius Technologies
 */

import React, { useState } from 'react';
import {
  FolderTree,
  Package,
  Layers,
  Database,
  Globe,
  ListTodo,
  CheckCircle2,
  FileCode,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

export const ArchitectureDocsView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<
    'repo' | 'dependencies' | 'storage' | 'api' | 'events' | 'backlog'
  >('repo');

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto space-y-6">
      {/* Page Title */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-slate-900">
              InkyPOS 2.0 — Architecture Specifications & Foundation Proposal
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            InkGenius Technologies production design proposal and foundation verification report.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Foundation Tests: 28/28 Passed</span>
        </div>
      </div>

      {/* Navigation Pills */}
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {[
          { id: 'repo', label: '1. Repository Structure', icon: FolderTree },
          { id: 'dependencies', label: '2. Dependency Choices', icon: Package },
          { id: 'storage', label: '3. Storage Interface', icon: Database },
          { id: 'api', label: '4. Laravel API Contracts', icon: Globe },
          { id: 'events', label: '5. Sync Event Schema', icon: Layers },
          { id: 'backlog', label: '6. Implementation Backlog', icon: ListTodo },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id as typeof activeSection)}
            className={`px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all ${
              activeSection === id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Content Section */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        {activeSection === 'repo' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-indigo-600" />
              <span>Proposed Production Monorepo Structure</span>
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              InkyPOS 2.0 uses a modular monorepo (or clean multi-project architecture) separating
              the frontend Expo application, backend Laravel 11 API, and shared TypeScript domain
              contracts to prevent code duplication and guarantee contract fidelity:
            </p>

            <pre className="p-4 bg-slate-900 text-emerald-300 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
{`inkypos-2.0/
├── packages/
│   ├── core/                      # Reusable pure TypeScript domain logic
│   │   ├── src/
│   │   │   ├── types.ts           # Tenant, Register, Sale, Payment, SyncEvent
│   │   │   ├── currency.ts        # Dual-currency (USD + ZiG) & split payment math
│   │   │   ├── tax.ts             # 15% VAT, zero-rated, exemptions
│   │   │   ├── sales.ts           # Atomic transaction builder & receipt sequence
│   │   │   ├── subscription.ts    # Tier limits & offline grace period evaluator
│   │   │   ├── sync.ts            # Idempotency, retry backoff & conflict policies
│   │   │   └── fiscal.ts          # Neutral IFiscalAdapter interface
│   │   └── package.json
│   │
│   ├── storage/                   # Cross-platform persistence abstraction
│   │   ├── src/
│   │   │   ├── adapter.ts         # IStorageAdapter interface
│   │   │   ├── expo-sqlite.ts     # Expo SQLite (Android / iOS)
│   │   │   ├── indexeddb.ts       # IndexedDB (Browser / Web)
│   │   │   └── memory.ts          # In-memory adapter (Unit tests)
│   │   └── package.json
│   │
├── apps/
│   ├── mobile-web/                # Expo Multi-Platform Frontend
│   │   ├── app/                   # Expo Router file-based routes
│   │   │   ├── (auth)/login.tsx
│   │   │   ├── (tabs)/
│   │   │   │   ├── index.tsx      # POS Register & Cart
│   │   │   │   ├── outbox.tsx     # Sync & Reconciliation
│   │   │   │   ├── sales.tsx      # Sales Ledger
│   │   │   │   └── settings.tsx   # Device & Branch Configuration
│   │   │   └── _layout.tsx
│   │   ├── components/            # Cross-platform UI components
│   │   ├── app.json               # Expo configuration & plugins
│   │   └── package.json
│   │
│   └── backend-api/               # Laravel 11 PHP + MySQL Central API
│       ├── app/
│       │   ├── Http/Controllers/Api/V1/
│       │   │   ├── AuthController.php
│       │   │   ├── DeviceController.php
│       │   │   ├── CatalogueController.php
│       │   │   ├── SyncBatchController.php
│       │   │   └── SubscriptionController.php
│       │   ├── Models/            # Tenant, Branch, Register, Product, Sale, SyncAck
│       │   ├── Services/
│       │   │   ├── IdempotencyService.php
│       │   │   └── ConflictManager.php
│       ├── database/migrations/   # MySQL multi-tenant schemas
│       └── routes/api.php         # Versioned REST endpoints (v1)`}
            </pre>
          </div>
        )}

        {activeSection === 'dependencies' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" />
              <span>Technology & Dependency Choices</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h3 className="font-bold text-slate-900 text-sm">Frontend (Expo / React Native)</h3>
                <ul className="space-y-1.5 text-slate-600 list-disc pl-4">
                  <li>
                    <strong className="text-slate-800">Expo SDK 52+:</strong> Managed workflow with
                    EAS build support for Android APK/AAB and iOS IPA distribution.
                  </li>
                  <li>
                    <strong className="text-slate-800">Expo Router:</strong> Type-safe URL routing
                    supporting native stacks and web URLs seamlessly.
                  </li>
                  <li>
                    <strong className="text-slate-800">expo-sqlite:</strong> Fast, ACID-compliant
                    SQLite v14 async database for native Android/iOS offline storage.
                  </li>
                  <li>
                    <strong className="text-slate-800">expo-secure-store:</strong> Encrypted key-value
                    storage backed by Android Keystore and iOS Keychain for device tokens.
                  </li>
                  <li>
                    <strong className="text-slate-800">IndexedDB:</strong> Transactional web storage
                    with structured cloning and secondary indexing for browser POS.
                  </li>
                </ul>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h3 className="font-bold text-slate-900 text-sm">Backend (Laravel 11 & MySQL 8)</h3>
                <ul className="space-y-1.5 text-slate-600 list-disc pl-4">
                  <li>
                    <strong className="text-slate-800">Laravel 11 REST API:</strong> High-speed PHP
                    framework with Sanctum token authentication and policy-based authorization.
                  </li>
                  <li>
                    <strong className="text-slate-800">MySQL 8.0 InnoDB:</strong> ACID transactions,
                    foreign key constraints, and JSON column support for audit logs.
                  </li>
                  <li>
                    <strong className="text-slate-800">Server-Enforced Idempotency:</strong> Central
                    idempotency table indexed on <code className="bg-slate-200 px-1 rounded">idempotency_key</code> to
                    guarantee single-execution safety during network retries.
                  </li>
                  <li>
                    <strong className="text-slate-800">Audit Logging:</strong> Immutable financial
                    events ledger preserving cashier actions, stock adjustments, and refunds.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'storage' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-600" />
              <span>Platform-Specific Storage Interface (`IStorageAdapter`)</span>
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Because browser storage (IndexedDB) and native mobile storage (Expo SQLite) have
              different underlying execution models, InkyPOS 2.0 unifies them behind a robust,
              asynchronous, typed interface:
            </p>

            <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
{`export interface IStorageAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  init(): Promise<void>;

  // Atomic Sales Persistence
  saveSale(sale: SaleTransaction): Promise<void>;
  getSales(limit?: number): Promise<SaleTransaction[]>;
  getSaleById(id: string): Promise<SaleTransaction | null>;

  // Durable Synchronization Outbox
  saveOutboxItem(item: OutboxItem): Promise<void>;
  getOutboxItems(status?: OutboxStatus): Promise<OutboxItem[]>;
  updateOutboxItem(id: string, updates: Partial<OutboxItem>): Promise<void>;
  deleteOutboxItem(id: string): Promise<void>;

  // Local Catalogue Snapshots & Stock Movement
  saveProducts(products: Product[]): Promise<void>;
  getProducts(): Promise<Product[]>;
  adjustProductStock(productId: string, deltaQuantity: number): Promise<void>;

  // Device & Security State
  saveDeviceState(key: string, value: unknown): Promise<void>;
  getDeviceState<T>(key: string): Promise<T | null>;
}`}
            </pre>
          </div>
        )}

        {activeSection === 'api' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-600" />
              <span>Laravel REST API Contracts (v1)</span>
            </h2>
            <div className="space-y-2 text-xs">
              {[
                {
                  method: 'POST',
                  path: '/api/v1/devices/register',
                  desc: 'Registers a new POS terminal with fingerprint, device name, and platform. Checks tenant subscription limits.',
                },
                {
                  method: 'GET',
                  path: '/api/v1/catalogue/snapshot',
                  desc: 'Retrieves authorized product catalogue, tax categories, and active exchange rate (USD to ZiG).',
                },
                {
                  method: 'POST',
                  path: '/api/v1/sync/events',
                  desc: 'Batch event synchronization endpoint. Processes sales atomically, validates idempotency keys, and returns acknowledgements.',
                },
                {
                  method: 'POST',
                  path: '/api/v1/devices/heartbeat',
                  desc: 'Periodic ping updating terminal lastSeenAt timestamp and returning tenant subscription grace window status.',
                },
                {
                  method: 'POST',
                  path: '/api/v1/devices/revoke',
                  desc: 'Tenant administrator endpoint revoking stolen or retired terminal credentials immediately.',
                },
              ].map(({ method, path, desc }) => (
                <div
                  key={path}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-3"
                >
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                      method === 'POST'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {method}
                  </span>
                  <div>
                    <code className="font-mono font-bold text-slate-900">{path}</code>
                    <p className="text-slate-500 text-[11px] mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'events' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Synchronization Event Schema & Conflict Policies</span>
            </h2>
            <p className="text-xs text-slate-600">
              Each offline transaction generates an immutable, versioned event with a unique UUID v4
              and composite idempotency key:
            </p>

            <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
{`export interface SyncEvent<T = unknown> {
  eventId: string;             // UUID v4
  eventType: 'SALE_CREATED' | 'PAYMENT_RECORDED' | 'STOCK_ADJUSTED';
  eventVersion: number;        // e.g. 1
  tenantId: string;            // Strict tenant isolation
  branchId: string;            // Branch topology
  registerId: string;          // Originating till
  idempotencyKey: string;      // "sale:{tenantId}:{registerId}:{saleId}"
  payload: T;                  // Typed transaction payload
  occurredAt: string;          // ISO timestamp generated on client
}`}
            </pre>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2 text-xs">
              <h4 className="font-bold text-slate-800">Domain-Specific Conflict Policies</h4>
              <ul className="space-y-1 text-slate-600 list-disc pl-4">
                <li>
                  <strong>Financial Sales:</strong> Immutable APPEND_AUDIT strategy. Sales are never
                  discarded or overwritten.
                </li>
                <li>
                  <strong>Stock Movements:</strong> Delta adjustments ledger. No Last-Write-Wins.
                </li>
                <li>
                  <strong>Catalogue & Prices:</strong> Server authoritative for newly opened
                  transactions; committed offline sales retain price snapshots.
                </li>
                <li>
                  <strong>Payment Discrepancies:</strong> Flagged for Manager Review Queue.
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'backlog' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-indigo-600" />
              <span>InkyPOS 2.0 Implementation Roadmap & Backlog</span>
            </h2>

            <div className="space-y-3 text-xs">
              {[
                {
                  phase: 'Phase 1',
                  title: 'Core Domain Foundation & Laravel API Contracts',
                  status: 'COMPLETED & VERIFIED',
                  items:
                    'Pure domain logic (currency, tax, sales, subscriptions, sync), typed API contracts, platform storage interface, and 28 unit tests.',
                },
                {
                  phase: 'Phase 2',
                  title: 'Multi-Tenant Authentication & Device Registration',
                  status: 'FOUNDATION IMPLEMENTED',
                  items:
                    'Tenant isolation, branch/register topology, device revocation token management, and subscription tier ceilings.',
                },
                {
                  phase: 'Phase 3',
                  title: 'Cross-Platform Local Storage & Schema Migrations',
                  status: 'FOUNDATION IMPLEMENTED',
                  items:
                    'Expo SQLite v14 schema definitions for iOS/Android, IndexedDB for web, and memory adapter for automated headless testing.',
                },
                {
                  phase: 'Phase 4',
                  title: 'Offline Sale Persistence & Durable Outbox Engine',
                  status: 'FOUNDATION IMPLEMENTED',
                  items:
                    'Atomic sale packaging, UUID generation, local receipt numbering, durable outbox queue with exponential backoff and idempotency.',
                },
                {
                  phase: 'Phase 5',
                  title: 'Catalogue, Inventory, Checkout & Dual-Currency Payments',
                  status: 'FOUNDATION IMPLEMENTED',
                  items:
                    'Product catalogue browsing, barcode scanning simulator, split payment modal (Cash USD/ZiG, EcoCash, InnBucks, Cards), and printable receipt layout.',
                },
                {
                  phase: 'Phase 6',
                  title: 'Conflict Resolution, Lost-ACK Recovery & Financial Reconciliation',
                  status: 'FOUNDATION IMPLEMENTED',
                  items:
                    'Safe duplicate ACK handling, cross-tenant conflict trapping, manager review routing, and central vs local balance reconciliation.',
                },
                {
                  phase: 'Phase 7',
                  title: 'Subscription Administration & Offline Grace Period Policies',
                  status: 'FOUNDATION IMPLEMENTED',
                  items:
                    'Configurable grace period windows (7d starter, 14d growth, 30d enterprise), interactive grace simulator, and terminal lockout rules.',
                },
                {
                  phase: 'Phase 8',
                  title: 'Fiscalisation Integration (ZIMRA FDMS Ready)',
                  status: 'INACTIVE SPEC READY',
                  items:
                    'Provider-neutral IFiscalAdapter interface, staging simulation stub, Z-report closure workflow, and regulatory boundary protections.',
                },
              ].map(({ phase, title, status, items }) => (
                <div
                  key={phase}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-700">{phase}:</span>
                      <span className="font-bold text-slate-800">{title}</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        status === 'COMPLETED & VERIFIED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">{items}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
