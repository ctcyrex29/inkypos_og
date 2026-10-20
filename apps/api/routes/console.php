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

Artisan::command('inkypos:prune-device-challenges', function () {
    $this->info(DeviceAuthenticator::pruneBefore(now()->subDay()).' expired challenges deleted.');
})->purpose('Delete expired device sign-in challenges');

Schedule::command('inkypos:prune-device-challenges')->daily();
Schedule::command('sanctum:prune-expired --hours=24')->daily();
