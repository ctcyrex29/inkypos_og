<?php

/*
| Proxies in front of the API (nginx, a load balancer, Cloudflare). Their
| X-Forwarded-For header is believed for the visitor's real address, which the
| rate limits and the activity log use; without this every visitor would share
| the proxy's address and one rate limit. TRUSTED_PROXIES is a comma-separated
| list of IPs/CIDRs, or "*" only when the API cannot be reached except through
| the proxy (firewall). Unset: no proxy, addresses are taken as they arrive.
| Read by Illuminate\Http\Middleware\TrustProxies on every request.
*/
return [
    'proxies' => env('TRUSTED_PROXIES') ?: null,
];
