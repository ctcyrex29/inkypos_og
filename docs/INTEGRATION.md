# InkyPOS OG: integration plan

InkyPOS OG is one application built from four sources (kept unchanged in `reference/`):

- **InkyPOS 2.0** (this repository): the foundation. Offline-first sync with an append-only outbox, idempotent server, conflict review, tenant isolation, subscriptions with offline grace, staff PIN sign-in, refunds, shifts, back office.
- **InkyPOS v1** (`reference/inky-pos-v1`): the wide feature surface: inventory depth, customers, suppliers, accounting, reports, platform portal.
- **Restaurant POS** (`reference/restaurant-pos`): restaurant mode.
- **SwiftScan** and the **2.0 web prototype**: ideas only (scanning flow, subscription tiers).

## Rules for porting

Features are **re-implemented on the 2.0 engine, not copied**. Prototype code is a specification, not a dependency.

- Money stays in integer minor units (v1 and the prototypes use floating-point `REAL`/`number` dollars).
- Every business change on a till is an immutable sync event with a server projection and shared test vectors; no feature writes device-only tables that never reach the server.
- Identity is 2.0's: server accounts plus offline staff PINs. v1's hard-coded demo accounts and PINs are dropped.
- No fiscalisation claims (unchanged from 2.0: Phase 8 waits for verified requirements).
- AI Studio/Gemini scaffolding is not carried over.

## Source → target map

| Source feature | Where it lands | Notes |
|---|---|---|
| v1 inventory: categories, cost price, low-stock level, stock intake / damage / correction, valuation | **OG-1** | `stock.adjusted` exists; add reasons, categories and cost on products |
| v1 customers (credit limit, balance, loyalty) | **OG-1** | customer on a sale; account sales later need a decision on credit policy |
| v1 suppliers, purchases (goods received) | **OG-1** | goods received = stock movements with cost |
| v1 reports: sales log, VAT report, audit log; SwiftScan/restaurant reports; Z-report per shift | **OG-2** | merges with original Phase 6 reports and reconciliation |
| v1 accounting: cash book, disbursements, contacts ledger, financials; expenses | **OG-2** | expenses already exist as `cash.movement` reason `expense` |
| Restaurant: business type "restaurant", menu with combos (staple + relish + vegetable), modifiers, notes | **OG-3** | product options on the catalogue |
| Restaurant: tables and open tabs, order numbers, kitchen tickets and tracker, order status | **OG-3** | new events for open orders (`order.*`); a paid order ends as `sale.completed` |
| Restaurant: split bill (by item, by guest, even split) | **OG-3** | each part is its own sale, or split tender on one sale |
| Restaurant: recipe/ingredient auto-deduction | **OG-3** | stock movements derived from recipes at sale time |
| Restaurant/SwiftScan printing: RawBT intent on Android, kitchen tickets, Z-report slips | **OG-4** | RawBT works without a development build; direct Bluetooth needs one (ESC/POS encoder already in core) |
| v1 platform portal: companies, stores, installations, subscriptions, support, billing; 2.0 prototype tiers (starter / growth / enterprise limits) | **OG-5** | merges with original Phase 7 subscription admin |
| v1 look: logo, theme, responsive layout, bottom-sheet cart | **OG-1 onward** | brand assets ported early; layout patterns as screens are rebuilt |
| v1 public business finder (directory listing, WhatsApp, GPS) | **later, needs a decision** | a public listing is a different product surface |
| SwiftScan native Kotlin app | **not ported as code** | Expo app covers Android; its continuous-scan and discount UX inform checkout |

## Phases

Original phases 6–8 (conflict review, multi-device tests, subscription admin and hardening, fiscalisation) remain; OG phases interleave with them as above.

- **OG-1 Retail depth** ✅: categories, cost, low stock, stock intake/damage/correction/count, customers, suppliers, goods received; v1 logo.
- **OG-2 Reports and accounting** ✅: sales, VAT, shift X/Z reports, profit estimate, activity log, cash book, expenses, supplier payments and balances.
- **OG-3 Restaurant mode**: menu combos and modifiers, tables and tabs, kitchen tickets, order status, split bill, recipes.
- **OG-4 Printing**: RawBT on Android, kitchen tickets, Z-report slips; Bluetooth with a development build.
- **OG-5 Platform portal**: companies, installations, plans and tiers, support.

Each phase ends with all suites passing (core, app, API, live contract) and a browser check, as before.
