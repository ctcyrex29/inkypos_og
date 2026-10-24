<?php

/*
| Websites allowed to call the API from a browser: the web back office and the
| web till. CORS_ALLOWED_ORIGINS is a comma-separated list such as
| https://app.inkypos.co.zw. When unset, any origin is allowed in local
| development and none in production. The phone app sends no origin and is not
| affected. Sign-in uses bearer tokens, never cookies, so credentials are off.
*/
$origins = array_values(array_filter(array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')))));
$local = in_array(env('APP_ENV', 'production'), ['local', 'testing'], true);

return [
    'paths' => ['api/*'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins' => $origins !== [] ? $origins : ($local ? ['*'] : []),
    'allowed_origins_patterns' => [],
    // The headers in HEADERS (packages/core/src/api/contracts.ts).
    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Request-Id', 'Idempotency-Key', 'X-Device-Id', 'X-Tenant-Id', 'X-Client-Version'],
    'exposed_headers' => ['X-Request-Id', 'Retry-After'],
    'max_age' => 600,
    'supports_credentials' => false,
];
