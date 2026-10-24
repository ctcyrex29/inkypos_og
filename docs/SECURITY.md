# Security: injection, abuse and denial of service

InkyPOS is built and run by **Inkgenius Technologies**. This page covers what the API itself does, and what has to be set up where it is hosted. Tests: `apps/api/tests/Feature/Api/V1/SecurityTest.php` and `SecurityHardeningTest.php`.

## SQL injection

- All database access goes through Laravel's query builder or Eloquent. Every value a user sends is a **bound parameter**, never pasted into SQL text.
- The only hand-written SQL fragments (`selectRaw` sums in reports and stock) are fixed text with no user input in them.
- Text searches use `App\Support\Like`:
  - the term is a bound parameter;
  - `%` and `_` typed by a user match themselves rather than acting as wildcards;
  - terms are capped at 100 characters.

  The escape character is `!` because it means the same in SQLite and MySQL.
- Column names are never taken from requests.
- Tenant isolation is fail-closed on top of this (`app/Tenancy`, ARCHITECTURE §7).
- Tests send classic injection strings to every search and check that nothing is matched or changed.

## Denial of service (one client sending too much)

| Limit | Where | Value |
|---|---|---|
| Request body size | `LimitRequestSize` (before parsing) | 512 KB; 4 MB for `POST /sync/events` (up to 100 events) |
| All API traffic from one address | `throttle:per-ip` | 1,200 per minute (`RATE_LIMIT_PER_IP_PER_MINUTE`) |
| Per signed-in user or till | `throttle:api` | 240 per minute |
| Login, sign-up, device sign-in, password change | `throttle:auth` | 10 per minute per email (or device) and address; 60 per minute per address |
| Password guessing on one account from many addresses | `throttle:auth` | 20 per minute and 100 per hour per email, whatever the address (`RATE_LIMIT_PER_ACCOUNT_PER_*`) |
| Page sizes | each list endpoint | capped (e.g. 200 products, 200 audit entries, 92-day report periods) |
| Till PIN guessing | on the till, offline | lockout after 4 failures, growing to 15 minutes |

Over a limit, the API answers `429 rate_limited` or `413 payload_too_large` without doing the work.

## Distributed denial of service (many machines at once)

An application cannot defend itself against a flood from thousands of addresses. By the time a request reaches PHP, the server has already spent the bandwidth and the connection. This must be set up where InkyPOS is hosted, **before going live**:

1. **Put the API behind a DDoS-absorbing proxy**, such as Cloudflare (free or Pro plan) or the hosting provider's equivalent.
   - Proxy the API's DNS record (orange cloud).
   - Turn on the WAF managed rules.
   - Add a rate-limiting rule on `/api/v1/auth/*`.
2. **Accept traffic only from the proxy.** Firewall the origin server so it only takes connections from the proxy's address ranges, so attackers can't go around it.
3. **Pass real client addresses through.** Set `TRUSTED_PROXIES` to the proxy's addresses (`config/trustedproxy.php`). Without it every visitor looks like the proxy: they would all share one rate limit (one attacker could block everyone's sign-in) and the activity log would record the wrong addresses.
4. **Web server limits** (nginx in front of PHP-FPM):
   - `limit_req` and `limit_conn` per address;
   - `client_max_body_size 4m`;
   - short `client_body_timeout` and `client_header_timeout` (slow-request attacks);
   - a bounded PHP-FPM `pm.max_children` so the database is never overwhelmed.
5. **Rate-limit store.** Use Redis for the cache, so limits are shared when more than one API server runs.
6. **Monitoring.** Alert on 429/5xx spikes and on database connection saturation.

Tills keep selling offline during an outage and sync afterwards, so a DDoS stops syncing and back-office use, not sales.

## Other settings to tighten for production

- **APP_DEBUG=false.** The API refuses to start in production with debug on. Database errors never reach the caller even in debug mode (they hold SQL and values); the log has them under the request id.
- **CORS:** set `CORS_ALLOWED_ORIGINS` to the web app's domains. Unset, any origin is allowed in local development and none in production. The phone app sends no origin and is unaffected.
- **PHP:** set `expose_php = Off` in php.ini (the API also removes `X-Powered-By`).
- **HTTPS only.** The API sends HSTS on secure requests. Security headers (`nosniff`, `DENY` framing, no referrer, locked-down CSP) are on every API response.
- **Secrets:** `APP_KEY`, the entitlement signing key and the database password must come from the environment, never from the repository.

## Accounts and sign-in

- **Passwords** are stored with bcrypt. Business passwords need 10 characters; Inkgenius staff need 12.
- **Changing a password** (`POST /me/password`, `POST /platform/me/password`, "Change password" in the account menu) needs the current one and signs the person out everywhere else.
- **Temporary passwords** (a business created by Inkgenius, a manager password reset, new Inkgenius staff, the `inkypos:platform-admin` command) must be replaced at the first sign-in. Until then the API answers `403 password_change_required` to everything except `/me`, sign-out and the password change.
- **Inkgenius staff use an authenticator app** (TOTP, RFC 6238: Google Authenticator, Microsoft Authenticator, Authy) as well as a password, because their accounts reach every business.
  - At the first sign-in they scan a QR code; until then the portal answers `403 two_factor_setup_required`.
  - Each code works once. The secret is encrypted with `APP_KEY`.
  - Lost phone: an administrator uses **Reset authenticator** on the Team page. If the only administrator loses theirs: `php artisan inkypos:platform-reset-two-factor email`.
  - `PLATFORM_REQUIRE_TWO_FACTOR` must stay `true` outside tests.
- **Sessions:** business access tokens last 15 minutes with single-use refresh tokens (reuse signs the person out everywhere); Inkgenius tokens last 8 hours; till tokens 1 hour, renewed by a signed challenge.

## Web app

- The built app carries a **Content-Security-Policy** (`vite.config.ts`): scripts only from its own files, API calls only to the InkyPOS API (`VITE_API_URL`). Set `VITE_API_URL` when building for hosting.
- The web host must also send, as headers: `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. A meta tag cannot set framing rules.
- Sign-in tokens are kept in the browser tab (sessionStorage) and end when the tab closes.

## Dependencies

- Check before every release: `composer audit` in `apps/api`, and `npm audit --omit=dev` in `apps/web`, `apps/pos` and `packages/core`.
- Known and accepted (October 2026): advisories in Expo's command-line build tools (`@expo/cli` with its own old zod 3, `node-forge`, `xcode`/`uuid`). They run on the build machine, not in the app on phones. npm's suggested fix downgrades Expo and breaks the till; take Expo's patch release when it comes.

## Accepted risks

- **Till PINs can be recovered from a stolen till.** Tills hold PBKDF2 hashes of 4–6 digit PINs so staff can sign in offline; so few combinations cannot resist an offline search. Revoke a lost till at once (Tills page, or an Inkgenius Technician) and have its staff set new PINs. PINs only open the till, never the back office.
- **Self sign-up is open.** Anyone can register a business, but it does nothing until Inkgenius activates it; sign-up is rate-limited per address.
- **Sign-up says when an email is already registered.** Needed to tell a manager why sign-up failed; guessing is rate-limited.

## Review log

- **2026-10-23:** dependency audit, secret scan, code review of sign-in, tenancy, sync and platform routes, live probing. Fixed: outdated PHP libraries (41 advisories), database details in debug error responses, rate limits behind a proxy, per-account guessing limit, password change and forced replacement of temporary passwords, authenticator codes for Inkgenius staff, CORS, web Content-Security-Policy, a crash on sign-up with a differently-capitalised email, PHP version header.
