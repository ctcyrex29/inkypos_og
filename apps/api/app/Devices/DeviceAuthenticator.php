<?php

namespace App\Devices;

use App\Audit\Audit;
use App\Http\ApiException;
use App\Models\Device;
use App\Models\DeviceChallenge;
use App\Support\Base64Url;
use Illuminate\Support\Carbon;

/**
 * Challenge-response sign-in for tills. The device proves possession of its
 * Ed25519 private key; no shared secret is ever stored on the server.
 */
final class DeviceAuthenticator
{
    /** Exact bytes signed by the device; mirrors deviceAuthMessage() in packages/core. */
    public static function message(string $deviceId, string $challenge): string
    {
        return "inkypos-device-auth:v1:{$deviceId}:{$challenge}";
    }

    public static function verify(string $publicKeyB64, string $message, string $signatureB64): bool
    {
        $publicKey = Base64Url::decode($publicKeyB64);
        $signature = Base64Url::decode($signatureB64);
        if ($publicKey === null || strlen($publicKey) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES
            || $signature === null || strlen($signature) !== SODIUM_CRYPTO_SIGN_BYTES) {
            return false;
        }

        return sodium_crypto_sign_verify_detached($signature, $message, $publicKey);
    }

    /** @return array{challenge: string, expires_at: string} */
    public function issueChallenge(Device $device): array
    {
        $this->assertUsable($device);

        $challenge = Base64Url::encode(random_bytes(32));
        $expires = now()->addSeconds((int) config('inkypos.tokens.device_challenge_seconds'));
        DeviceChallenge::create([
            'device_id' => $device->id,
            'challenge_hash' => hash('sha256', $challenge),
            'expires_at' => $expires,
        ]);

        return ['challenge' => $challenge, 'expires_at' => $expires->toIso8601String()];
    }

    /** @return array{access_token: string, access_expires_at: string} */
    public function exchange(Device $device, string $challenge, string $signature): array
    {
        $this->assertUsable($device);

        // Single use: claim the challenge before checking the signature.
        $claimed = DeviceChallenge::where('device_id', $device->id)
            ->where('challenge_hash', hash('sha256', $challenge))
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->update(['used_at' => now()]);

        if ($claimed === 0 || ! self::verify($device->public_key, self::message($device->id, $challenge), $signature)) {
            Audit::record('device.auth_failed', $device, tenantId: $device->tenant_id, actor: $device);

            throw ApiException::unauthenticated('Device authentication failed.');
        }

        $expires = now()->addMinutes((int) config('inkypos.tokens.device_access_minutes'));
        $token = $device->createToken('device', ['device'], $expires);
        $device->forceFill(['last_seen_at' => now()])->save();

        return ['access_token' => $token->plainTextToken, 'access_expires_at' => $expires->toIso8601String()];
    }

    private function assertUsable(Device $device): void
    {
        if ($device->isRevoked()) {
            throw ApiException::deviceRevoked();
        }
    }

    public static function pruneBefore(Carbon $cutoff): int
    {
        return DeviceChallenge::where('expires_at', '<', $cutoff)->delete();
    }
}
