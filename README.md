# InkyPOS 2.0

Multi-tenant, offline-first POS by InkGenius Technologies.

| Path | What |
|---|---|
| `packages/core` | Shared TypeScript: money, pricing, IDs, sync schema, API contracts and client, platform/storage ports |
| `apps/pos` | Expo app (Android, iOS, web) |
| `apps/api` | Laravel 13 API |
| `docs/ARCHITECTURE.md` | Design proposal |
| `docs/BACKLOG.md` | Phased backlog |

## Setup

```bash
npm run install:all                      # core + app (no workspaces; see ARCHITECTURE §1)
cd apps/api && composer install && cp .env.example .env && php artisan key:generate
```

On this machine, PHP's SQLite extension is present but not enabled, so commands that need it pass `-d extension=pdo_sqlite`. Avast's HTTPS scanning intercepts TLS, so Composer needs `SSL_CERT_FILE` pointed at Avast's root (the same file as `NODE_EXTRA_CA_CERTS`).

## Run

```bash
cd apps/api && php artisan serve                 # API on :8000
cd apps/pos && npx expo start                    # Expo Go / dev build / web
```

Set `EXPO_PUBLIC_API_URL` to reach the API from a phone (use the LAN IP). The Android emulator default is `http://10.0.2.2:8000`.

## Test

```bash
npm run test:core        # vitest
npm run test:pos         # jest-expo
npm run test:api         # PHPUnit (in-memory SQLite)
npm run typecheck
```

Live contract test against a running API: `INKYPOS_API_URL=http://127.0.0.1:8000 npx vitest run contract` (from `packages/core`).
