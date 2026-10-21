# InkyPOS OG

Multi-tenant, offline-first POS by InkGenius Technologies.

| Path | What |
|---|---|
| `packages/core` | Shared TypeScript: money, pricing, IDs, sync schema, auth/entitlement contracts, Ed25519, API client, platform/storage ports |
| `apps/pos` | Expo app (Android, iOS, web) |
| `apps/api` | Laravel 13 API |
| `docs/ARCHITECTURE.md` | Design proposal |
| `docs/BACKLOG.md` | Phased backlog |

## Setup

```bash
npm run install:all                      # core + app (no workspaces; see ARCHITECTURE §1)
cd apps/api && composer install && cp .env.example .env && php artisan key:generate
php artisan inkypos:entitlement-key      # prints ENTITLEMENT_* lines for .env and EXPO_PUBLIC_ENTITLEMENT_KEYS for the app
php artisan migrate
php artisan inkypos:demo-catalogue owner@example.com   # optional: 12 sample products, payment types, a demo ZWG rate
```

The API needs PHP's `sodium`, `pdo_sqlite` and `sqlite3` extensions (`pdo_mysql` in production). They ship with PHP for Windows but are commented out in `php.ini`; on this machine they are enabled, and the original is saved as `php.ini.bak-inkypos`.

Avast's HTTPS scanning intercepts TLS here, so Composer needs `SSL_CERT_FILE` pointed at Avast's root certificate (the same file as `NODE_EXTRA_CA_CERTS`).

## Run

```bash
cd apps/api && php artisan serve --host=0.0.0.0 --port=8000   # 0.0.0.0 so phones on the Wi-Fi can reach it
cd apps/pos && npx expo start            # Expo Go / dev build / web
```

App configuration (build time):

- `EXPO_PUBLIC_API_URL`: use the LAN IP to reach the API from a phone. The Android emulator default is `http://10.0.2.2:8000`.
- `EXPO_PUBLIC_ENTITLEMENT_KEYS`: public entitlement keys, e.g. `{"k1":"…"}`. Without them every till reports "Selling paused".

The first launch shows **Set up this till**. A manager signs in once, picks a register, and the device enrols with its own key.

Day to day on the till: **Shift and cash drawer** opens a shift with the float (selling needs an open shift), records cash in/out, and closes with the counted cash and over/short. Receipts have **Refund or void**. **Back office** is for managers (sign in per visit) to edit products, prices, barcodes, payment types and the ZWG rate; tills pick the changes up on their next sync.

After pulling a change that adds API migrations, run `php artisan migrate` in `apps/api`.

## Test

```bash
npm run test:core        # vitest
npm run test:pos         # jest-expo
npm run test:api         # PHPUnit (in-memory SQLite)
npm run typecheck
npm run lint             # ESLint (Expo config) on the app
```

Live end-to-end test against a running API, run from `packages/core`. It covers signup, device enrolment, challenge sign-in, the signed entitlement, cross-tenant refusal, revocation and refresh-token reuse:

```bash
INKYPOS_API_URL=http://127.0.0.1:8000 INKYPOS_ENTITLEMENT_KEYS='{"k1":"<public key>"}' npx vitest run contract
```
