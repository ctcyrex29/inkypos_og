# Deploying the API on Railway

The API (`apps/api`, Laravel) runs on Railway with a Railway MySQL database. The web back office and portal (`apps/web`) stay on Vercel and call the API at `VITE_API_URL`.

`apps/api/railway.json` already tells Railway how to build (Railpack, which detects Laravel and serves `public/`), to run `php artisan migrate --force` before each deploy, and to check `/api/v1/health`. Migrations, the API test suite and `inkypos:platform-admin` have been run against MySQL 8.4.

## 1. Create the project

1. Sign in at railway.com and create a **New Project → Deploy from GitHub repo**, choosing this repository.
2. Open the new service → **Settings**:
   - **Root Directory**: `apps/api`
   - **Networking → Generate Domain** (gives `https://<name>.up.railway.app`; a custom domain such as `api.inkypos.app` can be added later, once you own the domain).
3. In the project, **New → Database → MySQL**.

## 2. Variables (service → Variables)

Generate the two secrets on your own computer, from `apps/api`:

```bash
php artisan key:generate --show
php artisan inkypos:entitlement-key --key-id=prod1
```

The second command prints a private signing key (for Railway) and a public key (for app builds). Use new keys for production; never reuse the development ones.

| Variable | Value |
|---|---|
| `APP_NAME` | `InkyPOS` |
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | output of `key:generate --show` |
| `APP_URL` | the Railway domain, e.g. `https://inkypos-api.up.railway.app` |
| `DB_CONNECTION` | `mysql` |
| `DB_URL` | `${{MySQL.MYSQL_URL}}` (Railway fills it in from the database) |
| `LOG_CHANNEL` | `stderr` |
| `LOG_LEVEL` | `info` |
| `CACHE_STORE` | `database` |
| `SESSION_DRIVER` | `database` |
| `QUEUE_CONNECTION` | `sync` |
| `TRUSTED_PROXIES` | `*` (Railway's edge is the only way in; needed for real client IPs and per-IP limits) |
| `CORS_ALLOWED_ORIGINS` | the Vercel production address, e.g. `https://inkypos.vercel.app` (comma-separate several) |
| `ENTITLEMENT_KEY_ID` | `prod1` |
| `ENTITLEMENT_SIGNING_KEY` | the private key from `inkypos:entitlement-key` |
| `PLATFORM_REQUIRE_TWO_FACTOR` | `true` |
| `SIGNUP_REQUIRES_ACTIVATION` | `true` |
| `MAIL_MAILER` | `log` (until an email provider is set up) |

Deploy. The log should show the migrations, then the health check passing at `/api/v1/health`.

## 3. Create the first Inkgenius administrator

In the API service, open the **⋯ menu → Shell** (or `railway ssh` with the Railway CLI) and run:

```bash
php artisan inkypos:platform-admin you@yourcompany.com "Your Name"
```

It prints a temporary password once. Sign in at `/inkgenius/login` on the web app; you will be asked to choose a new password and set up an authenticator app. Add the rest of the team from the portal.

## 4. Point the web app at the API (Vercel)

1. Vercel project → **Settings → Environment Variables**: set `VITE_API_URL` to the Railway domain (no trailing slash) for Production.
2. Redeploy, and use the **production** domain (Project → Domains), not a per-deployment preview link: previews change with every deploy and are behind Vercel sign-in when Deployment Protection is on.
3. Make sure that production domain is in the API's `CORS_ALLOWED_ORIGINS`.

## 5. Tills and app builds

Tills verify subscriptions with the public key. Put the `EXPO_PUBLIC_ENTITLEMENT_KEYS` line printed in step 2 (`{"prod1":"…"}`) and `EXPO_PUBLIC_API_URL` (the Railway domain) into the production app build's environment.

## Optional: scheduled clean-up

The API has daily housekeeping (`inkypos:prune-device-challenges`, `sanctum:prune-expired`). Add a second service from the same repo with Root Directory `apps/api`, the same variables, and a **Cron Schedule** of `0 3 * * *` with start command `php artisan schedule:run`. Nothing breaks without it; tables just grow slowly.
