<?php

namespace Tests\Feature\Api\V1;

use App\Models\Subscription;
use App\Support\Base64Url;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

class SubscriptionTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private const TEST_PUBLIC_KEY = 'yqthfBTEJQ6tNuH1qH8imhk9s40jldCUZTbQjtr70HI'; // matches phpunit.xml

    /** @return array<string, mixed> */
    private function verifiedPayload(array $doc): array
    {
        $ok = sodium_crypto_sign_verify_detached(
            Base64Url::decode($doc['signature']), $doc['payload'], Base64Url::decode(self::TEST_PUBLIC_KEY)
        );
        $this->assertTrue($ok, 'entitlement signature must verify with the published key');
        $this->assertSame('test', $doc['key_id']);

        return json_decode(Base64Url::decode($doc['payload']), true, flags: JSON_THROW_ON_ERROR);
    }

    public function test_device_receives_a_signed_entitlement_for_its_trial(): void
    {
        $tenant = $this->makeTenant(status: 'trialing');
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($tenant);

        $payload = $this->verifiedPayload($this->getJson('/api/v1/entitlements', $this->deviceHeaders($device, $secret))->json('data'));

        $this->assertSame('trialing', $payload['status']);
        $this->assertSame($device->id, $payload['device_id']);
        $this->assertSame(['max_branches' => 1, 'max_registers' => 2], $payload['limits']);
        $validFor = now()->diffInHours($payload['valid_until']);
        $this->assertEqualsWithDelta(72, $validFor, 1);
        $this->assertEqualsWithDelta(7, now()->parse($payload['valid_until'])->diffInDays($payload['grace_until']), 0.01);
    }

    public function test_validity_never_extends_past_the_paid_period(): void
    {
        $tenant = $this->makeTenant(status: 'active');
        app(TenantContext::class)->run($tenant, fn () => Subscription::first()->update(['current_period_ends_at' => now()->addHours(5)]));

        $payload = $this->verifiedPayload($this->getJson('/api/v1/entitlements', $this->userHeaders($this->makeUser($tenant), $tenant))->json('data'));

        $this->assertEqualsWithDelta(5, now()->diffInHours($payload['valid_until']), 0.1);
    }

    public function test_cancelled_or_lapsed_subscriptions_are_inactive_immediately(): void
    {
        $tenant = $this->makeTenant(status: 'canceled');
        $payload = $this->verifiedPayload($this->getJson('/api/v1/entitlements', $this->userHeaders($this->makeUser($tenant), $tenant))->json('data'));
        $this->assertSame('inactive', $payload['status']);
        $this->assertSame($payload['valid_until'], $payload['grace_until']);

        $lapsed = $this->makeTenant(status: 'active');
        $this->travel(15)->days();
        $payload = $this->verifiedPayload($this->getJson('/api/v1/entitlements', $this->userHeaders($this->makeUser($lapsed), $lapsed))->json('data'));
        $this->assertSame('inactive', $payload['status']);
    }

    public function test_plan_limits_cap_branches_and_registers(): void
    {
        $tenant = $this->makeTenant(plan: 'starter'); // 1 branch, 2 registers
        $headers = $this->userHeaders($this->makeUser($tenant), $tenant);

        $branch = $this->postJson('/api/v1/branches', ['name' => 'Main', 'code' => 'MAIN'], $headers)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/branches', ['name' => 'Second', 'code' => 'TWO'], $headers)
            ->assertStatus(403)->assertJsonPath('error.code', 'plan_limit_reached');

        $this->postJson("/api/v1/branches/{$branch}/registers", ['name' => 'Till 1', 'code' => 'T1'], $headers)->assertCreated();
        $this->postJson("/api/v1/branches/{$branch}/registers", ['name' => 'Till 2', 'code' => 'T2'], $headers)->assertCreated();
        $this->postJson("/api/v1/branches/{$branch}/registers", ['name' => 'Till 3', 'code' => 'T3'], $headers)
            ->assertStatus(403)->assertJsonPath('error.code', 'plan_limit_reached');
    }

    public function test_inactive_subscription_cannot_add_devices(): void
    {
        $tenant = $this->makeTenant(status: 'suspended');
        [, $register] = $this->makeRegister($tenant);

        $this->postJson('/api/v1/devices', [
            'register_id' => $register->id, 'name' => 'Till', 'platform' => 'android',
            'public_key' => Base64Url::encode(sodium_crypto_sign_publickey(sodium_crypto_sign_keypair())),
        ], $this->userHeaders($this->makeUser($tenant), $tenant))
            ->assertStatus(403)->assertJsonPath('error.code', 'subscription_inactive');
    }
}
