<?php

namespace App\Entitlements;

use App\Models\Device;
use App\Models\Tenant;
use App\Support\Base64Url;
use RuntimeException;

/**
 * Issues the signed entitlement document the till uses to decide, offline,
 * whether it may keep selling (packages/core/src/auth/entitlement.ts).
 */
final class EntitlementIssuer
{
    /** @return array{payload: string, signature: string, key_id: string} */
    public function issue(Tenant $tenant, ?Device $device): array
    {
        $subscription = $tenant->subscription()->with('plan')->first();
        $now = now();
        $entitled = $subscription !== null && $tenant->isActive() && $subscription->isEntitled($now);

        if ($entitled) {
            $validUntil = $now->copy()->addHours((int) config('inkypos.entitlements.validity_hours'));
            if ($subscription->current_period_ends_at->isBefore($validUntil)) {
                $validUntil = $subscription->current_period_ends_at->copy();
            }
            $graceUntil = $validUntil->copy()->addDays((int) config('inkypos.entitlements.offline_grace_days'));
        } else {
            $validUntil = $graceUntil = $now->copy();
        }

        $plan = $subscription?->plan;
        $payload = [
            'v' => 1,
            'tenant_id' => $tenant->id,
            'device_id' => $device?->id,
            'plan_code' => $plan->code ?? 'none',
            'status' => $entitled ? $subscription->status : 'inactive',
            'features' => $plan->features ?? [],
            'limits' => [
                'max_branches' => max(1, $plan?->limit('max_branches') ?? 1),
                'max_registers' => max(1, $plan?->limit('max_registers') ?? 1),
            ],
            'issued_at' => $now->toIso8601String(),
            'valid_until' => $validUntil->toIso8601String(),
            'grace_until' => $graceUntil->toIso8601String(),
        ];

        $encoded = Base64Url::encode(json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

        return [
            'payload' => $encoded,
            'signature' => Base64Url::encode(sodium_crypto_sign_detached($encoded, $this->secretKey())),
            'key_id' => (string) config('inkypos.entitlements.key_id'),
        ];
    }

    private function secretKey(): string
    {
        $key = Base64Url::decode((string) config('inkypos.entitlements.signing_key'));
        if ($key === null || strlen($key) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) {
            throw new RuntimeException('ENTITLEMENT_SIGNING_KEY is missing or invalid. Run `php artisan inkypos:entitlement-key`.');
        }

        return $key;
    }
}
