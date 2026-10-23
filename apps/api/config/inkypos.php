<?php

return [

    /*
    | Fiscalisation provider. Only "disabled" exists. Adding a provider requires
    | verified regulatory requirements and an authorised integration route
    | (docs/ARCHITECTURE.md, Phase 8). Unknown values fail at boot.
    */
    'fiscal' => [
        'provider' => env('FISCAL_PROVIDER', 'disabled'),
    ],

    'tokens' => [
        'user_access_minutes' => (int) env('USER_ACCESS_MINUTES', 15),
        'refresh_days' => (int) env('REFRESH_TOKEN_DAYS', 30),
        'device_access_minutes' => (int) env('DEVICE_ACCESS_MINUTES', 60),
        'device_challenge_seconds' => 120,
    ],

    /*
    | Signed entitlement documents (docs/ARCHITECTURE.md §7). Generate a key pair
    | with `php artisan inkypos:entitlement-key`; the public half ships in the app.
    */
    'entitlements' => [
        'signing_key' => env('ENTITLEMENT_SIGNING_KEY'),
        'key_id' => env('ENTITLEMENT_KEY_ID', 'k1'),
        'validity_hours' => (int) env('ENTITLEMENT_VALIDITY_HOURS', 72),
        'offline_grace_days' => (int) env('ENTITLEMENT_OFFLINE_GRACE_DAYS', 7),
    ],

    /*
    | Till sign-in PINs (App\Staff\StaffPin). Tills verify offline in JavaScript,
    | so this is a balance between slowing guesses and sign-in speed on a cheap
    | phone. Existing PINs keep the count they were set with.
    */
    /*
    | Abuse limits (docs/SECURITY.md). Per signed-in user/device: 240/min; login: 10/min
    | per email and IP, 60/min per IP. This one caps all API traffic from one address.
    */
    'rate_limits' => [
        'per_ip_per_minute' => (int) env('RATE_LIMIT_PER_IP_PER_MINUTE', 1200),
    ],

    'staff_pin' => [
        'iterations' => (int) env('STAFF_PIN_ITERATIONS', 100_000),
    ],

    /*
    | Self sign-up creates a business that waits for Inkgenius Technologies to
    | activate it in the platform portal. Switch off only for local development.
    */
    'signup' => [
        'requires_activation' => (bool) env('SIGNUP_REQUIRES_ACTIVATION', true),
    ],

    'trial' => [
        'plan' => 'starter',
        'days' => 14,
    ],

    // Prices and billing are out of scope until Phase 7.
    'plans' => [
        'starter' => [
            'name' => 'Starter',
            'limits' => ['max_branches' => 1, 'max_registers' => 2],
            'features' => ['offline_sales'],
        ],
        'growth' => [
            'name' => 'Growth',
            'limits' => ['max_branches' => 5, 'max_registers' => 20],
            'features' => ['offline_sales', 'multi_branch_reports'],
        ],
    ],

];
