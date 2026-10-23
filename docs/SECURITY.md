# Security: injection, abuse and denial of service

InkyPOS is built and run by **Inkgenius Technologies**. This page covers what the API itself does, and what has to be set up where it is hosted. Tests: `apps/api/tests/Feature/Api/V1/SecurityTest.php`.

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
| Login, sign-up, device sign-in | `throttle:auth` | 10 per minute per email (or device) and address; 60 per minute per address |
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
3. **Pass real client addresses through.** Configure Laravel's trusted proxies so the limits above see each client's address, not the proxy's.
4. **Web server limits** (nginx in front of PHP-FPM):
   - `limit_req` and `limit_conn` per address;
   - `client_max_body_size 4m`;
   - short `client_body_timeout` and `client_header_timeout` (slow-request attacks);
   - a bounded PHP-FPM `pm.max_children` so the database is never overwhelmed.
5. **Rate-limit store.** Use Redis for the cache, so limits are shared when more than one API server runs.
6. **Monitoring.** Alert on 429/5xx spikes and on database connection saturation.

Tills keep selling offline during an outage and sync afterwards, so a DDoS stops syncing and back-office use, not sales.

## Other settings to tighten for production

- **CORS:** it currently allows any origin. Set the allowed origins to the back-office and portal domains when they are hosted.
- **HTTPS only.** The API sends HSTS on secure requests. Security headers (`nosniff`, `DENY` framing, no referrer, locked-down CSP) are on every API response.
- **Secrets:** `APP_KEY`, the entitlement signing key and the database password must come from the environment, never from the repository.
