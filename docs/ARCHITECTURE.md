# InkyPOS 2.0 — Architecture proposal

Status: **Phases 1–4 and 5a implemented.** Everything marked *planned* is design, not code.

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

**Implementation (Phase 3).** The repositories are written once, in `local-store.ts`, on top of a small transactional document-store interface (`StorageDriver` in `driver.ts`), which supports `get`, `insert`, `put`, `delete`, and indexed `query`/`count`. Platforms differ only in their drivers:

| Driver | Used on | Notes |
|---|---|---|
| `MemoryDriver` | tests | reference behaviour; copy-on-write rollback |
| `SqliteDriver` | native (expo-sqlite); Node tests (node:sqlite) | one table per store (`k`, `doc` JSON, one column per index field); WAL and `synchronous = FULL`; explicit `BEGIN IMMEDIATE` behind a mutex |
| `IndexedDbDriver` | web | one readwrite transaction over all stores; array index keys; migrations inside `versionchange` |

Index rules follow IndexedDB everywhere: key parts are strings or numbers (flags stored as 0/1), and numbers sort before strings. A transaction callback may only await its own store operations, never network or timers. That is why `commitSale` validates and hashes synchronously inside the transaction.

Migrations (`schema.ts`) are declarative steps: `createStore`, `createIndex`, `deleteIndex`, and `transform` (a pure row rewrite). They are append-only, and each migration is atomic. A driver applies **every migration not yet recorded** in `_migrations`, not just those above the highest version, so features developed in parallel (each claiming its own version number) can merge in either order. Migrations must therefore not depend on one another unless they share a branch.

Every event enters the outbox through one function (`appendEvent`), which allocates `device_sequence`, validates the whole event and stores the exact bytes. Receipt numbers are **not** the device sequence: sales and refunds each have their own gap-free counter in `meta` (`receipt_seq:sale`, `receipt_seq:refund`), allocated in the same transaction, so shift and cash events never leave holes in receipt numbering. A till without a counter yet (new, or upgraded from before the counters existed) starts after the sales or refunds it already holds.

The contract (`contract.ts`) is framework-free: Vitest runs it against all three drivers, and the app's **Diagnostics** screen runs the same scenarios against throwaway databases on the real device.

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
  "event_type": "sale.completed",   // | stock.adjusted | refund.issued | shift.opened | shift.closed | cash.movement
  "device_sequence": 42,            // strictly increasing per device; gaps are detectable
  "occurred_at": "2026-10-20T09:15:00+02:00",  // device clock: informational, not trusted for ordering
  "tenant_id", "branch_id", "register_id", "device_id", "actor_user_id",
  "aggregate_id": "<sale_id>",
  "payload": { … }
}
```

The `sale.completed` payload carries the lines (with price and tax snapshots), totals, payments, change and stock movements. The schema **re-verifies the arithmetic** with the same `priceLine` function checkout uses: each line's tax and total, the sale totals, tendered amount minus change equals the total, and stock movements equal the sold quantities. Payments carry their own currency and, when it differs from the sale currency, an `exchange_rate` and rate version. That supports USD/ZWG split tender.

Payment `status` records what the till knows (`recorded`, `pending_confirmation`, `confirmed`, `failed`, `voided`). It never implies settlement.

**Refunds and voids (Phase 5b).** A completed sale is never changed. Corrections are `refund.issued` events naming the original sale and lines; a void is a refund of everything with reason `void`. Amounts follow one rule on both sides (`sales/refund.ts`, `app/Sales/Refunds.php`): after returning `q` of `Q` sold, the cumulative refund for that line is `round(T × q / Q)`, where `T` is the line total, and each refund is the difference from the previous cumulative figure. Partial refunds therefore add up to the line exactly, with no drift from rounding. The schema checks the refund's own arithmetic; the server also checks against stored data: unknown original sale → conflict `refund_original_unknown`; more returned than sold → conflict `refund_exceeds_sale`; an amount that breaks the rule → rejected.

**Shifts and cash (Phase 5b).** `shift.opened` (float per currency), `cash.movement` (in/out with a reason) and `shift.closed` (expected and counted cash per currency). Sales and refunds carry `shift_id`. Expected cash = float + cash tendered − change − cash refunds ± movements, per currency (`sales/shift.ts`). Closing an unknown or already closed shift is a conflict, not a rejection, because the till's record of the cash count must never be lost.

**Push:** `POST /api/v1/sync/events` with `{ batch_id, device_id, events[≤100] }` and `Idempotency-Key: <batch_id>`.
**Ack:** one result per event:

| result | meaning | device state |
|---|---|---|
| `accepted` | stored, projected into central tables | `synced` |
| `duplicate` | already stored; returns the original outcome (**lost-ack recovery**) | `synced` |
| `conflict` | stored centrally **and** a conflict record opened for a manager | `needs_review` |
| `rejected` | failed validation; nothing projected | `needs_review` (kept, never dropped) |

**Server processing (Phase 4, implemented in `app/Sync/SyncProcessor.php`):** each event is handled in its own database transaction, holding a lock on the device row so sequence checks can't interleave. In order:

1. If `(tenant_id, event_id)` already exists, the server compares the **canonical** payload hash (sha256 of JSON with object keys sorted, so key order doesn't matter).
   - Same hash: it returns the original outcome. A previously accepted event is answered `duplicate`, which is how a lost acknowledgement recovers.
   - Different hash: conflict `event_id_reused`; the incoming payload is kept in the conflict record.
2. The device's sequence number is already taken: conflict `sequence_reused`.
3. The event must name the authenticated device's own tenant, branch and register. Otherwise it's **rejected** (`device_mismatch`).
4. Validation: the JSON Schema generated from zod (`resources/schemas`, a byte-identical copy of the core's, guarded by a test), then a PHP port of the arithmetic rules. A failure is **rejected** (`validation_failed`); the event is stored for review, never projected.
5. Accepted: the event row and its projections (`sales`, `sale_lines`, `sale_payments`, and the append-only `stock_movements`) are written inside a savepoint. A colliding child ID rolls the projection back and becomes conflict `record_id_reused`. A jump in the device's sequence numbers is accepted and logged as a `sequence_gap` conflict for the manager.

Batch-level problems answer 403 or 422 before any event is touched: invalid JSON, more than 100 events, a `device_id` other than the authenticated device, or an event without an ID. Otherwise one bad event never blocks the rest of its batch.

**Pull (Phase 5a, implemented; OG-1 added categories and customers):** `GET /api/v1/sync/changes?cursor=` returns reference data: business, branches, registers, categories, products (with barcodes and category), payment methods, exchange rates, staff (tills only) and customers (name and phone only). Product cost and low-stock level are back-office fields and never reach tills.

- Every write to that data also appends to `catalogue_changes` in the same transaction.
- An empty cursor starts a paged **snapshot** of everything current: products paged by id (`snap:<seq>:<id>`), then customers paged by id (`snapc:<seq>:<id>`). It remembers the log position where it began, then continues from the log (`log:<seq>`), so an edit made mid-snapshot is still delivered.
- Several edits to one entity within a page collapse to its current state.
- The till checks each page against the zod schemas in `catalogue/contracts.ts` and applies it, cursor included, in one local transaction. A malformed page is refused whole, and the cursor doesn't move.
- The log position is recorded on every sale as `catalogue_version`.

**Retry:** exponential backoff with full jitter (2 s base, 5 min cap), honouring `Retry-After`. Retries resend the **exact stored bytes** (`OutboxEntry.body`).

**Reports (OG-2).** Reports read the projected tables and group by the business's local day (`tenants.timezone`). Amounts stay in the currency recorded; nothing is converted. Payment status is reported as recorded, never as settled. The profit figure is labelled an estimate: cost of goods uses each product's current last cost, and sales of products without a cost are reported separately. Money that never passes through a till (expenses, supplier payments) is recorded in the back office as append-only rows; till cash taken from the drawer stays a `cash.movement` event.

## 6. Conflict policies

From `packages/core/src/sync/conflict-policy.ts`. **Nothing financial or inventory-related uses last-write-wins.**

| Data | Strategy | Opens a review when… |
|---|---|---|
| Catalogue | server authoritative | a sale references a product deactivated after the device snapshot |
| Prices | server authoritative; the sale keeps its price snapshot | the snapshot was older than the tenant's tolerance |
| Stock | append-only ledger of signed deltas | on-hand would go negative where the tenant forbids it |
| Payments | append-only, immutable | pending confirmation times out; reference reused |
| Completed sales | append-only, immutable; corrections are void/refund events | same `event_id` with a different hash; sequence gap; revoked device; totals fail server re-validation; `actor_user_id` not active staff when the sale occurred (`unknown_actor`, the sale is kept) |
| Staff | server authoritative; tills replace their copy on pull | — |
| Subscriptions | server authoritative | sales recorded offline after the grace deadline |

## 7. Multi-tenancy and subscriptions (Phase 2)

- One database, with a `tenant_id` column on every tenant-owned table. Enforcement has three layers:
  - The tenant is resolved only from the authenticated token. A user picks one per request with `X-Tenant-Id`, which is checked against their memberships. A device token is bound to its own tenant.
  - A `BelongsToTenant` global scope **fails closed**: a query without a tenant throws `MissingTenantContext`. Role permissions (owner, manager, cashier) apply on top.
  - Composite `(id, tenant_id)` foreign keys, so the database itself rejects a row that points at another tenant's branch or register.

  Another tenant's records return 404. `TenantIsolationTest` fails if a tenant route is added without a cross-tenant test.
- **Users** get 15-minute Sanctum access tokens and 30-day single-use refresh tokens. Presenting an already-used refresh token revokes the whole token family (theft detection). Enrolling a till uses a manager's sign-in only briefly; the till keeps no user credentials.
- **Devices** generate an Ed25519 key pair at registration. The public key is stored server-side, and short-lived Sanctum tokens are issued against a signed challenge. Revocation deletes the tokens and blocks the key. Events from a revoked device that occurred after revocation go to review.
- **Offline grace:** the server issues a signed entitlement (`valid_until`, `grace_until`, feature limits). Offline, the device behaves like this:
  - **active** → normal.
  - **grace** → sales allowed, with a persistent banner.
  - **restricted** → no new sales. Syncing, viewing, reprinting and exporting are always allowed, so pending sales can always leave the device.

  The document is base64url JSON signed with Ed25519. `php artisan inkypos:entitlement-key` generates the key pair; the public key ships in the app as `EXPO_PUBLIC_ENTITLEMENT_KEYS`. The app verifies the document when it arrives **and** every time it reads it back from storage. It is valid for 72 hours (never beyond the paid period), followed by 7 days of offline grace.

  A device clock more than 5 minutes behind the last server time the till has seen counts as **restricted** (`clock_rollback`). That last-seen time only moves forward and is kept in secure storage. Adding monotonic uptime to this check is deferred, because it needs a native module.

- **Staff sign-in on the till (offline).** Every event the till records (sales, refunds and voids, shift open/close, cash movements) carries the signed-in person as `actor_user_id`, not the device. Shift, refund and cash screens send the user to sign in first, like checkout.
  - Owners and managers set a 4–6 digit PIN per membership (`PUT /staff/{user}/pin`; `DELETE` clears it; `PATCH /staff/{user}` with `active` deactivates). Repeated digits and straight runs (1111, 1234, 9876) are refused. Managers cannot change owners, and nobody can deactivate themselves. A deactivated membership also loses back-office access to that business.
  - **Till-only staff** (`POST /staff`): a user with a name and no email or password, plus a membership in one business (cashier, or manager when an owner adds them). Login looks users up by email, so they can never sign in to the back office or the API; they only sign in on tills with their PIN. Only till-only staff can be renamed through `PATCH /staff/{user}`; people with a login own their name.
  - Only a slow hash is stored: PBKDF2-HMAC-SHA256, a random 16-byte salt per membership, and an iteration count (`STAFF_PIN_ITERATIONS`, default 100,000) kept with the hash, so it can be raised later without breaking existing PINs. `App\Staff\StaffPin` (PHP) and `packages/core/src/staff/pin.ts` (pure JS via `@noble/hashes`, async so the UI keeps drawing) are checked against shared vectors (`test-vectors/staff-pin.v1.json`).
  - Staff reach tills as the `staff` entity in `GET /sync/changes` (user id, name, role, active, PIN hash and parameters, version). Every change is recorded in `catalogue_changes`. **Only device principals receive staff**; a user reading the feed, cashiers included, never sees PIN hashes. Tills refuse iteration counts outside 10,000–1,000,000.
  - Lockout is per person and stored in the till's database (`pin_attempts`), so it survives restarts and pulls. After 4 consecutive wrong PINs, each further failure locks that person out for 30 s, doubling up to 15 minutes. A correct PIN resets the count. Setting the clock back does not lift a lockout. Setting it forward can, because there is no monotonic clock yet (same limitation as the entitlement check).
  - The signed-in cashier is held in memory only. They are signed out after 5 minutes without a touch, scan or search (also when the app returns from the background after that long), when they tap Sign out or Switch cashier, and when a pull deactivates them or changes their role or PIN. Checkout requires a signed-in person. Diagnostics and the development sample sale are for owners and managers only (`tillRoleCan`).
  - **Limits.** A 4–6 digit PIN has at most a million values, so the hash only slows down someone who copies a till's database; it cannot stop them. The lockout protects the till's own sign-in screen. PINs are not account passwords and grant nothing on the server. On the server, an uploaded event whose actor was not an active member of the business at `occurred_at` (for example, an older till still sending its device id) is **accepted and flagged** `unknown_actor`, never rejected.

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

**Decided (2026-10-21):** desktop ships as the **installable web build** first, and printing uses the browser print dialog. If USB/serial receipt printers or cash drawers need more than the browser allows, a thin shell (Electron or Tauri) around the same build follows. React Native Windows/macOS isn't used.

## 10. Fiscalisation

`App\Fiscal\FiscalProvider` is the provider-neutral interface. The only implementation is `DisabledFiscalProvider`, and any other configured value fails at boot. No endpoints, certificates or compliance claims exist in code. Phase 8 begins only after the applicable Zimbabwean requirements and the authorised integration route are verified.

## 11. Inkgenius Technologies, roles and the web app

InkyPOS is a product of **Inkgenius Technologies**, which owns the software and activates the businesses that use it.

**Two kinds of account, kept apart.**

- **Business staff** (`users` + `memberships`) work inside one business:
  - **Manager:** everything in the business, including selling on the tills.
  - **Cashier:** sells.

  "Owner" was merged into Manager (migration `2026_10_27_090000`). Every business keeps at least one active manager who has a back-office login. Till-only staff have no email and sign in on tills only.
- **Inkgenius staff** (`platform_users`) use the platform portal. Their tokens carry the `platform` ability, and business routes refuse them; platform routes refuse business and till tokens. The roles (`App\Platform\PlatformRole`):

  | Can… | Administrator | Support | Technician | Accounts Department |
  |---|---|---|---|---|
  | view businesses | ✓ | ✓ | ✓ | ✓ |
  | create businesses | ✓ | | | ✓ |
  | activate / suspend businesses | ✓ | | | ✓ |
  | change plans and subscriptions | ✓ | | | ✓ |
  | reset a manager's password | ✓ | ✓ | | |
  | switch off a till | ✓ | | ✓ | |
  | see a business's activity log | ✓ | ✓ | ✓ | |
  | manage Inkgenius staff accounts | ✓ | | | |

  The first administrator comes from `php artisan inkypos:platform-admin <email> <name>`; everyone else is added in the portal. Every platform action is audited with `actor_type = platform`.

**Getting onto InkyPOS.** A business can register itself. It is then **pending**: it can sign in, but every business route answers `403 business_pending` until Accounts or an Administrator activates it (`SIGNUP_REQUIRES_ACTIVATION`, on by default). Inkgenius can also create a business directly. That business is active at once, and its first manager gets a temporary password, shown once. A business can be a **shop**, a **restaurant**, or **both**; restaurant features are on for the last two.

**Web app (`apps/web`).** React 19 + Vite + Tailwind 4 with **shadcn/ui** components (new-york style, indigo theme), reusing `@inkypos/core` for contracts and the API client.

- **Pages:**
  - `/login` for business managers; `/signup` for a business to register itself; `/inkgenius/login` for Inkgenius staff.
  - `/app`, the business back office: dashboard; reports (sales and VAT, shifts with Z reports, profit, activity log); products (category, cost, low-stock level, options, recipes); categories; stock (levels, adjustments, counts, history); goods received and suppliers; customers; money (cash book, expenses, supplier balances and payments); staff; tills; settings.
  - `/inkgenius`, the platform portal: overview with the activation queue, businesses, business details, plans, and the Inkgenius team.
- **Sign-in behaviour:** sign-in forms read values from the submitted form, so browser autofill always works, and failures are always shown. A business session refreshes its 15-minute token automatically. Sessions are kept in `sessionStorage`, so they end with the browser tab.
- **Configuration:** set `VITE_API_URL` when hosting.
- **The till:** stays the Expo app (Android, iOS, web) and is for selling only. The whole back office lives in the web app; the till's **Back office** button opens it in the browser (`EXPO_PUBLIC_BACKOFFICE_URL`, or port 5173 on the API's host when developing locally). Till-level settings that belong to one device (printer, diagnostics) stay on the till.
