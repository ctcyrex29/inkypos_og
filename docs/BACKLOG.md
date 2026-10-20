# Implementation backlog

✅ done · ⬜ to do. Each phase ends with its tests green on every platform it touches.

## Phase 1 — Foundation ✅
- ✅ Repo layout: `packages/core`, `apps/pos`, `apps/api`
- ✅ Core: money, rounding, allocation, line pricing, UUIDv7
- ✅ Core: sync event schema v1 (draft), push/ack/pull contracts, generated JSON Schema
- ✅ Core: local sync state machine, backoff, conflict policy table
- ✅ Core: API envelopes, error codes, endpoint catalogue, typed client
- ✅ Core: platform and storage ports (interfaces only)
- ✅ Expo app: Expo Router, design tokens, API status screen, jest-expo tests, web export
- ✅ Laravel: `/api/v1` routing, request-id middleware, JSON error envelope, health endpoint, disabled fiscal provider
- ✅ Opt-in live contract test (TypeScript client ↔ Laravel)

## Phase 2 — Auth, tenancy, subscriptions, devices ✅ (two items open)
- ⬜ MySQL in CI (Docker) alongside SQLite unit runs. **Not done:** no MySQL or Docker on the dev machine. The schema uses only portable features (composite FKs, no partial indexes)
- ✅ Migrations: tenants, memberships, branches, registers, plans, subscriptions, devices, device challenges, refresh tokens, audit log (UUIDv7 keys; composite `(id, tenant_id)` foreign keys)
- ✅ Signup (business + owner + 14-day trial), login, rotating refresh tokens with reuse detection, logout
- ✅ Device registration with an Ed25519 public key; single-use challenge-response device tokens (libsodium ↔ @noble/ed25519, shared test vector)
- ✅ Tenant from the token only; fail-closed `BelongsToTenant` scope; roles (owner/manager/cashier); a route-coverage test forces a cross-tenant test for every tenant route
- ✅ Device revocation (tokens deleted, key refused, `device_revoked`); the app locks the till
- ✅ Signed entitlement document; client active/grace/restricted evaluation; clock rollback detected against the last trusted server time
- ⬜ Clock-rollback check that also uses monotonic uptime (needs a native module; deferred)
- ✅ Rate limiting: credential endpoints per identity+IP and per IP; the API per principal
- ✅ Plan limits (branches, registers) enforced server-side
- ✅ App: manager sign-in and register-selection setup flow; SecureStore (native) / IndexedDB + non-extractable WebCrypto key (web); status and locked screens

## Phase 3 — Local database abstraction
- ⬜ Shared `LocalStore` contract-test suite in core
- ⬜ In-memory reference implementation
- ⬜ `expo-sqlite` adapter: migrations table, WAL, one transaction per migration
- ⬜ IndexedDB adapter (`idb`): versioned upgrades, tests on `fake-indexeddb`
- ⬜ Storage health: persistence request + warning on web, usage/quota display
- ⬜ Run the contract suite on Android and iOS development builds

## Phase 4 — Offline sale persistence and outbox
- ⬜ `commitSale` atomic write incl. outbox + `device_sequence` allocation
- ⬜ Sync worker: batch, send exact stored bytes, apply acks, backoff, `Retry-After`
- ⬜ Server: `sync_events` table, unique (tenant_id, event_id), payload hash, per-event transaction, projections
- ⬜ Server: JSON Schema validation from `packages/core/schema` + PHP port of the arithmetic checks
- ⬜ Shared golden test vectors (`packages/core/test-vectors/*.json`) run by vitest **and** PHPUnit
- ⬜ Tests: kill the app mid-commit (no partial sale); restart keeps the outbox; resend after a lost ack → `duplicate`; same id + different payload → `conflict`
- ⬜ UI: per-sale badge (local / pending / synced / needs review), unsynced counter

## Phase 5 — Catalogue, inventory, checkout, payments, printing
- ⬜ Catalogue pull + snapshot; barcode lookup; search
- ⬜ Checkout: cart, discounts (allocation), tax inclusive/exclusive, split tender, multi-currency with rate snapshot
- ⬜ Configurable payment types per tenant; `pending_confirmation` workflow
- ⬜ Events: `sale.voided`, `refund.issued`, `shift.opened/closed`, `cash.movement`
- ⬜ Barcode: camera (native + web) and HID wedge
- ⬜ Receipts: platform-neutral `ReceiptDocument` → ESC/POS (dev build module) and HTML/PDF (expo-print / browser)
- ⬜ Desktop decision (PWA only vs. shell), see ARCHITECTURE §9

## Phase 6 — Conflicts, multi-device, reports, reconciliation
- ⬜ Conflict records + manager review UI + resolution events
- ⬜ Multi-device simulation tests (N devices, shared stock, partitions, reordering)
- ⬜ Reports: sales by day/register/cashier/payment method, tax summary, stock on hand
- ⬜ Reconciliation: device totals vs. central totals per shift; sequence-gap report

## Phase 7 — Subscription admin, hardening, deployment
- ⬜ Plan/subscription administration; billing provider TBD
- ⬜ Security review: restrict CORS origins (currently `*`), headers, secrets rotation, audit log coverage, dependency audit (npm currently reports advisories in the Expo toolchain)
- ⬜ Recovery runbooks: native device loss, web storage eviction, recovery-bundle import
- ⬜ EAS build/submit profiles; web hosting; Laravel deployment, queues, backups, monitoring
- ⬜ E2E: Maestro (Android/iOS), Playwright (web) on the critical workflows

## Phase 8 — Fiscalisation (gated)
- ⬜ Verify the applicable Zimbabwean requirements and the authorised integration route (owner: InkGenius)
- ⬜ Only then: a provider adapter behind `FiscalProvider`, fiscal receipt fields, retry and offline rules from the spec
