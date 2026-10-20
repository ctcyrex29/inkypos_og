# InkyPOS 2.0 — Architecture proposal

Status: **Phase 1 (foundation) implemented.** Everything marked *planned* is design, not code.

## 1. Repository structure

```
inkypos/
├─ packages/
│  └─ core/                  @inkypos/core — platform-neutral TypeScript, no React, no Expo
│     ├─ src/money/          integer minor-unit money, rounding, allocation
│     ├─ src/sales/          shared line-pricing rule (client checkout + server-side verification)
│     ├─ src/ids/            UUIDv7 generation (injected CSPRNG)
│     ├─ src/sync/           event schema v1, local sync state machine, backoff, conflict policies
│     ├─ src/api/            response envelopes, error codes, endpoint catalogue, typed fetch client
│     ├─ src/platform/       ports: SecureStore, Connectivity, BarcodeScanner, ReceiptPrinter, Permissions
│     ├─ src/storage/        LocalStore port (repositories, atomic commit, outbox)
│     ├─ schema/             generated JSON Schema consumed by the Laravel API
│     └─ test/               vitest unit tests + opt-in live contract test
├─ apps/
│  ├─ pos/                   Expo app (Android, iOS, web; desktop via the web build — see §9)
│  │  ├─ src/app/            Expo Router routes only
│  │  ├─ src/features/       screens + hooks per feature
│  │  ├─ src/services/       app wiring of core (API client, id generation)
│  │  ├─ src/platform/       (planned) native + web adapters: *.native.ts / *.web.ts
│  │  └─ src/ui/             design tokens and shared components
│  └─ api/                   Laravel 13 API (PHP 8.3+, MySQL 8 in production)
└─ docs/                     this file, BACKLOG.md
```

**Why no npm workspaces?** The development machine blocks symlinks and directory junctions, and npm workspaces need them. The app consumes `@inkypos/core` from source through a TypeScript `paths` alias, a Metro resolver rule (`apps/pos/metro.config.js`), and a Jest `moduleNameMapper`. This works with or without symlink support. Switching to workspaces later is a small change.

## 2. Dependency choices

| Area | Choice | Reason |
|---|---|---|
| App framework | Expo SDK 58, React Native 0.88, React 19.3 | Requested; one codebase for Android, iOS and web |
| Navigation | Expo Router (`src/app`) | File-based routes, deep links, typed routes |
| Validation and contracts | zod 4 | Runtime validation and inferred types from one schema; exports JSON Schema for PHP |
| IDs | UUIDv7 (own 30-line implementation) | Time-sortable, globally unique, no dependency; randomness from `expo-crypto` |
| Native storage (planned) | `expo-sqlite` (WAL, explicit transactions) | Durable and transactional; available in Expo Go |
| Web storage (planned) | IndexedDB via the `idb` wrapper; tests with `fake-indexeddb` | Only widely available transactional browser store. `expo-sqlite` on web (wasm + OPFS) needs COOP/COEP headers; we can evaluate it later |
| Secrets (planned) | `expo-secure-store` (native); non-extractable WebCrypto key (web) | Keychain / Keystore. The web has no equivalent, and the web adapter says so |
| Barcode (planned) | `expo-camera` scanning; keyboard-wedge (HID) listener on every platform | Most POS scanners act as keyboards |
| Printing (planned) | `expo-print` (system dialog / PDF); ESC/POS over Bluetooth/USB via a custom Expo module | Thermal printers need a development build. **They do not work in Expo Go** |
| Unit tests | vitest (core), jest-expo + React Native Testing Library (app), PHPUnit (API) | Default tool for each layer |
| E2E (planned) | Maestro (Android/iOS), Playwright (web) | Exercise the same workflows on every platform |
| API | Laravel 13, Sanctum (Phase 2) | Revocable per-device tokens; no OAuth server needed |
| Database | MySQL 8 (InnoDB, `READ COMMITTED`, utf8mb4) | Requested. Tests use in-memory SQLite for speed; CI must also run against MySQL (Phase 2) |

## 3. Platform storage interface

Defined in `packages/core/src/storage/ports.ts`. The port is defined **per repository, not as raw SQL**, because SQLite and IndexedDB have different query and transaction models:

- `SalesRepository.commitSale(event)` writes the sale, lines, payments, stock movements **and** the outbox entry, and allocates `device_sequence`, all in **one** transaction. Native: a single SQLite write transaction. Web: a single IndexedDB `readwrite` transaction over every store it touches.
- `OutboxRepository` returns due entries in sequence order, records attempts and transport failures, and applies acknowledgements. It has **no delete method**.
- `CatalogueRepository.applyChanges` applies a pulled page and advances the cursor atomically.
- `LocalStore.info()` reports `persistent` (web: `navigator.storage.persisted()`) and usage/quota, so the UI can warn about eviction risk.
- `exportRecoveryBundle()` produces a signed JSON bundle of unsynced events (see §8).

Each adapter must pass one shared contract-test suite (Phase 3), run against an in-memory implementation, the web adapter on `fake-indexeddb`, and the native adapter on a device through a development build.

The other platform ports are in `packages/core/src/platform/ports.ts`. `Connectivity` deliberately separates "OS says network available" from "the API answered", since only the second is meaningful.

## 4. API contracts

- Base path `/api/v1`. Breaking changes require `/api/v2`. Additive fields are allowed within v1.
- Success: `{ "data": …, "meta": { "request_id", "api_version" } }`
- Error: `{ "error": { "code", "message", "details?" }, "meta": … }`. Codes are a closed set shared by both sides (`apiErrorCodeSchema` in TypeScript, `ApiExceptionRenderer` in PHP).
- Headers: `X-Request-Id` (client sends a UUIDv7; server echoes it or replaces it if malformed), `Idempotency-Key` (writes), `X-Device-Id`, `X-Client-Version`.
- The endpoint catalogue with phases is in `packages/core/src/api/contracts.ts` (`ENDPOINTS`). Only `GET /api/v1/health` exists today.
- The client classifies every failure as `retryable` or not (network, timeout, 408, 429, 5xx → retryable). A response that doesn't match the schema is a `contract_violation`, never silently accepted.

## 5. Synchronization event schema (v1, draft)

Source of truth: `packages/core/src/sync/events.ts`. Generated JSON Schema: `packages/core/schema/sync-push-request.v1.json`.

Devices upload **immutable events**, never mutable rows.

```jsonc
{
  "schema_version": 1,
  "event_id": "<uuidv7>",           // idempotency key, unique per tenant
  "event_type": "sale.completed",   // | "stock.adjusted" (more in Phase 5: sale.voided, refund.issued, shift.*, cash.movement)
  "device_sequence": 42,            // strictly increasing per device; gaps are detectable
  "occurred_at": "2026-10-20T09:15:00+02:00",  // device clock: informational, not trusted for ordering
  "tenant_id", "branch_id", "register_id", "device_id", "actor_user_id",
  "aggregate_id": "<sale_id>",
  "payload": { … }
}
```

The `sale.completed` payload carries the lines (with price and tax snapshots), totals, payments, change and stock movements. The schema **re-verifies the arithmetic** with the same `priceLine` function checkout uses: each line's tax and total, the sale totals, tendered amount minus change equals the total, and stock movements equal the sold quantities. Payments carry their own currency and, when it differs from the sale currency, an `exchange_rate` and rate version. That supports USD/ZWG split tender.

Payment `status` records what the till knows (`recorded`, `pending_confirmation`, `confirmed`, `failed`, `voided`). It never implies settlement.

**Push:** `POST /api/v1/sync/events` with `{ batch_id, device_id, events[≤100] }` and `Idempotency-Key: <batch_id>`.
**Ack:** one result per event:

| result | meaning | device state |
|---|---|---|
| `accepted` | stored, projected into central tables | `synced` |
| `duplicate` | already stored; returns the original outcome (**lost-ack recovery**) | `synced` |
| `conflict` | stored centrally **and** a conflict record opened for a manager | `needs_review` |
| `rejected` | failed validation; nothing projected | `needs_review` (kept, never dropped) |

**Server processing (Phase 4):** for each event, in one DB transaction: insert into `sync_events` (unique `tenant_id + event_id`, stores the `payload_sha256`). On a unique violation, compare hashes: same hash → `duplicate`, different hash → `conflict`. Then project into `sales`, `sale_lines`, `payments` and `stock_movements`, and commit. Tenant and device authorisation are checked before anything is written.

**Pull:** `GET /api/v1/sync/changes?cursor=` returns versioned upserts and deletes for reference data (products, prices, tax rates, exchange rates, payment methods, registers, entitlements).

**Retry:** exponential backoff with full jitter (2 s base, 5 min cap), honouring `Retry-After`. Retries resend the **exact stored bytes** (`OutboxEntry.body`).

## 6. Conflict policies

From `packages/core/src/sync/conflict-policy.ts`. **Nothing financial or inventory-related uses last-write-wins.**

| Data | Strategy | Opens a review when… |
|---|---|---|
| Catalogue | server authoritative | a sale references a product deactivated after the device snapshot |
| Prices | server authoritative; the sale keeps its price snapshot | the snapshot was older than the tenant's tolerance |
| Stock | append-only ledger of signed deltas | on-hand would go negative where the tenant forbids it |
| Payments | append-only, immutable | pending confirmation times out; reference reused |
| Completed sales | append-only, immutable; corrections are void/refund events | same `event_id` with a different hash; sequence gap; revoked device; totals fail server re-validation |
| Subscriptions | server authoritative | sales recorded offline after the grace deadline |

## 7. Multi-tenancy and subscriptions (Phase 2)

- One database, with a `tenant_id` column on every tenant-owned table. Enforcement has three layers: a tenant resolved only from the authenticated device or user token (never from request input), a `BelongsToTenant` global scope plus policies, and composite unique keys that start with `tenant_id`. Cross-tenant access returns 404, and a test suite tries it for every endpoint.
- **Devices** generate an Ed25519 key pair at registration. The public key is stored server-side, and short-lived Sanctum tokens are issued against a signed challenge. Revocation deletes the tokens and blocks the key. Events from a revoked device that occurred after revocation go to review.
- **Offline grace:** the server issues a signed entitlement (`valid_until`, `grace_until`, feature limits). Offline, the device behaves like this:
  - **active** → normal.
  - **grace** → sales allowed, with a persistent banner.
  - **restricted** → no new sales. Syncing, viewing, reprinting and exporting are always allowed, so pending sales can always leave the device.

  A clock moved backwards (detected against the last server time plus monotonic uptime) counts as **restricted**.

## 8. Device failure and recovery (summary; full runbook in Phase 7)

- **Native:** SQLite lives in the app sandbox. It survives restarts and updates; it does **not** survive uninstalling the app, a factory reset, or device loss.
- **Web:** IndexedDB can be evicted under storage pressure, or cleared by the user or browser. The app requests persistent storage and warns when it isn't granted. Private or incognito windows refuse offline mode.
- **Mitigations:**
  - sync as soon as possible;
  - show the count and age of unsynced items;
  - block closing a shift while sales are unsynced (with a manager override);
  - a manual **recovery export** (signed, encrypted bundle) through the share sheet or a download;
  - an import tool on the server that runs the bundle through normal sync, which is idempotent, so double-import is safe;
  - the server flags `device_sequence` gaps.

## 9. Desktop

Recommendation: ship desktop as the **installable web build (PWA)** first. If USB/serial printers or cash drawers need more than WebUSB/WebSerial provide, wrap the same web build in a thin shell (Electron or Tauri) in Phase 5. React Native Windows/macOS isn't recommended: Expo support there is limited. **This needs your decision before Phase 5.**

## 10. Fiscalisation

`App\Fiscal\FiscalProvider` is the provider-neutral interface. The only implementation is `DisabledFiscalProvider`, and any other configured value fails at boot. No endpoints, certificates or compliance claims exist in code. Phase 8 begins only after the applicable Zimbabwean requirements and the authorised integration route are verified.
