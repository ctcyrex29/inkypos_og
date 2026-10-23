<?php

use App\Devices\DeviceAuthenticator;
use App\Support\Base64Url;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inkypos:entitlement-key {--key-id=k1}', function () {
    $pair = sodium_crypto_sign_keypair();
    $keyId = $this->option('key-id');

    $this->line('Add to the API .env (keep secret):');
    $this->line('  ENTITLEMENT_KEY_ID='.$keyId);
    $this->line('  ENTITLEMENT_SIGNING_KEY='.Base64Url::encode(sodium_crypto_sign_secretkey($pair)));
    $this->newLine();
    $this->line('Add to the app config (public):');
    $this->line('  EXPO_PUBLIC_ENTITLEMENT_KEYS='.json_encode([$keyId => Base64Url::encode(sodium_crypto_sign_publickey($pair))]));
})->purpose('Generate an Ed25519 key pair for signing entitlement documents');

Artisan::command('inkypos:demo-catalogue {email : A manager of the business to fill}', function () {
    $user = \App\Models\User::where('email', strtolower($this->argument('email')))->first();
    $membership = $user?->memberships()->with('tenant')->where('role', 'manager')->first();
    if (! $membership) {
        $this->error('No manager with that email.');

        return 1;
    }

    // Barcodes use the 20–29 "in-store" GS1 prefix range so they never collide with real products.
    $items = [
        ['BREAD-700', 'White bread 700g', 120, 'each', 'VAT15', 1500, '2000000000015'],
        ['MILK-1L', 'Fresh milk 1L', 110, 'each', 'ZERO', 0, '2000000000022'],
        ['SUGAR-2KG', 'White sugar 2kg', 290, 'each', 'VAT15', 1500, '2000000000039'],
        ['MEALIE-10KG', 'Roller meal 10kg', 750, 'each', 'ZERO', 0, '2000000000046'],
        ['OIL-2L', 'Cooking oil 2L', 420, 'each', 'VAT15', 1500, '2000000000053'],
        ['RICE-KG', 'Rice (per kg)', 180, 'kg', 'VAT15', 1500, '2000000000060'],
        ['TOMATO-KG', 'Tomatoes (per kg)', 150, 'kg', 'ZERO', 0, '2000000000077'],
        ['SOAP-BAR', 'Bath soap bar', 95, 'each', 'VAT15', 1500, '2000000000084'],
        ['MAZOE-2L', 'Orange crush 2L', 380, 'each', 'VAT15', 1500, '2000000000091'],
        ['EGGS-30', 'Eggs tray (30)', 550, 'each', 'ZERO', 0, '2000000000107'],
        ['SALT-1KG', 'Table salt 1kg', 70, 'each', 'VAT15', 1500, '2000000000114'],
        ['MATCHES-10', 'Matches (10 boxes)', 60, 'each', 'VAT15', 1500, '2000000000121'],
    ];

    app(\App\Tenancy\TenantContext::class)->run($membership->tenant, function () use ($items, $user) {
        $catalogue = app(\App\Catalogue\Catalogue::class);
        \Illuminate\Support\Facades\DB::transaction(function () use ($items, $user, $catalogue) {
            foreach ($items as [$sku, $name, $price, $unit, $taxCode, $rate, $barcode]) {
                if (\App\Models\Product::where('sku', $sku)->exists()) {
                    continue;
                }
                $p = \App\Models\Product::create([
                    'sku' => $sku, 'name' => $name, 'unit_price_minor' => $price, 'unit' => $unit,
                    'tax_code' => $taxCode, 'tax_rate_bp' => $rate, 'tax_inclusive' => true, 'active' => true, 'version' => 1,
                ]);
                $catalogue->setBarcodes($p, [$barcode]);
                $catalogue->record('product', $p->id);
            }
            if (\App\Models\PaymentMethod::count() === 0) {
                $catalogue->seedDefaults();
            }
            if (! \App\Models\ExchangeRate::where('quote_currency', 'ZWG')->exists()) {
                // Demo value only. Managers set the real rate.
                $r = \App\Models\ExchangeRate::create([
                    'base_currency' => 'USD', 'quote_currency' => 'ZWG', 'rate' => '0.03703704',
                    'version' => 1, 'effective_at' => now(), 'set_by_user_id' => $user->id,
                ]);
                $catalogue->record('exchange_rate', $r->id);
            }
        });
    });

    $this->info("Demo catalogue ready for {$membership->tenant->name}.");
})->purpose('Load sample products, default payment types and a demo ZWG rate into a business');

Artisan::command('inkypos:prune-device-challenges', function () {
    $this->info(DeviceAuthenticator::pruneBefore(now()->subDay()).' expired challenges deleted.');
})->purpose('Delete expired device sign-in challenges');

Artisan::command('inkypos:platform-admin {email} {name}', function () {
    // The first Inkgenius administrator; everyone else is added from the portal.
    $email = strtolower((string) $this->argument('email'));
    if (\App\Models\PlatformUser::where('email', $email)->exists()) {
        $this->error('An Inkgenius staff account with that email already exists.');

        return 1;
    }
    $password = \Illuminate\Support\Str::password(16, symbols: false);
    \App\Models\PlatformUser::create(['name' => $this->argument('name'), 'email' => $email, 'password' => $password, 'role' => 'administrator']);
    $this->info("Administrator {$email} created.");
    $this->line("Temporary password (shown once): {$password}");
})->purpose('Create an Inkgenius Technologies administrator for the platform portal');

Schedule::command('inkypos:prune-device-challenges')->daily();
Schedule::command('sanctum:prune-expired --hours=24')->daily();
