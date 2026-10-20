<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Models\Device;
use App\Support\Base64Url;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

class DeviceTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private function publicKey(): string
    {
        return Base64Url::encode(sodium_crypto_sign_publickey(sodium_crypto_sign_keypair()));
    }

    public function test_manager_registers_a_device_on_a_register(): void
    {
        $tenant = $this->makeTenant();
        [, $register] = $this->makeRegister($tenant);
        $manager = $this->makeUser($tenant, Role::Manager);

        $this->postJson('/api/v1/devices', [
            'register_id' => $register->id, 'name' => 'Front till', 'platform' => 'android', 'public_key' => $this->publicKey(),
        ], $this->userHeaders($manager, $tenant))
            ->assertCreated()
            ->assertJsonPath('data.register_id', $register->id)
            ->assertJsonPath('data.revoked_at', null)
            ->assertJsonMissingPath('data.public_key');

        $this->assertDatabaseHas('audit_logs', ['action' => 'device.registered', 'tenant_id' => $tenant->id, 'actor_id' => $manager->id]);
    }

    public function test_a_register_has_at_most_one_active_device(): void
    {
        $tenant = $this->makeTenant();
        [, $register] = $this->makeRegister($tenant);
        $owner = $this->makeUser($tenant);
        $this->makeDevice($tenant, $register, $owner);

        $this->postJson('/api/v1/devices', [
            'register_id' => $register->id, 'name' => 'Second', 'platform' => 'ios', 'public_key' => $this->publicKey(),
        ], $this->userHeaders($owner, $tenant))->assertStatus(409)->assertJsonPath('error.code', 'conflict');
    }

    public function test_rejects_keys_that_are_not_ed25519_public_keys(): void
    {
        $tenant = $this->makeTenant();
        [, $register] = $this->makeRegister($tenant);

        $this->postJson('/api/v1/devices', [
            'register_id' => $register->id, 'name' => 'Till', 'platform' => 'web', 'public_key' => 'short',
        ], $this->userHeaders($this->makeUser($tenant), $tenant))->assertStatus(422);
    }

    public function test_device_cannot_register_or_revoke_devices(): void
    {
        $tenant = $this->makeTenant();
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($tenant);

        $this->deleteJson("/api/v1/devices/{$device->id}", [], $this->deviceHeaders($device, $secret))->assertStatus(403);
    }

    public function test_challenge_response_issues_a_device_token(): void
    {
        $tenant = $this->makeTenant();
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($tenant);

        $challenge = $this->postJson('/api/v1/auth/device/challenge', ['device_id' => $device->id])->assertOk()->json('data.challenge');
        $response = $this->postJson('/api/v1/auth/device/token', [
            'device_id' => $device->id, 'challenge' => $challenge, 'signature' => $this->deviceSignature($device, $secret, $challenge),
        ]);

        $response->assertOk()->assertJsonPath('data.device.id', $device->id)
            ->assertJsonStructure(['data' => ['access_token', 'access_expires_at', 'server_time']]);
        $this->getJson('/api/v1/registers', ['Authorization' => 'Bearer '.$response->json('data.access_token')])->assertOk();
        $this->assertNotNull($device->fresh()->last_seen_at);
    }

    public function test_wrong_key_reused_challenge_and_expired_challenge_are_rejected(): void
    {
        $tenant = $this->makeTenant();
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($tenant);
        $otherSecret = sodium_crypto_sign_secretkey(sodium_crypto_sign_keypair());
        $challenge = fn () => $this->postJson('/api/v1/auth/device/challenge', ['device_id' => $device->id])->json('data.challenge');
        $exchange = fn (string $c, string $key) => $this->postJson('/api/v1/auth/device/token', [
            'device_id' => $device->id, 'challenge' => $c, 'signature' => $this->deviceSignature($device, $key, $c),
        ]);

        $exchange($challenge(), $otherSecret)->assertStatus(401);

        $c = $challenge();
        $exchange($c, $secret)->assertOk();
        $exchange($c, $secret)->assertStatus(401); // single use

        $c = $challenge();
        $this->travel(3)->minutes();
        $exchange($c, $secret)->assertStatus(401);

        $this->assertDatabaseHas('audit_logs', ['action' => 'device.auth_failed', 'subject_id' => $device->id]);
    }

    public function test_revocation_cuts_off_the_device_immediately(): void
    {
        $tenant = $this->makeTenant();
        $owner = $this->makeUser($tenant);
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($tenant, by: $owner);
        $deviceHeaders = $this->deviceHeaders($device, $secret);

        $this->deleteJson("/api/v1/devices/{$device->id}", ['reason' => 'stolen'], $this->userHeaders($owner, $tenant))
            ->assertOk()->assertJsonPath('data.id', $device->id);

        // Existing token no longer works…
        $this->getJson('/api/v1/registers', $deviceHeaders)->assertStatus(401);
        // …and the key cannot obtain a new one: the app sees device_revoked and locks.
        $this->postJson('/api/v1/auth/device/challenge', ['device_id' => $device->id])
            ->assertStatus(403)->assertJsonPath('error.code', 'device_revoked');

        $this->assertDatabaseHas('audit_logs', ['action' => 'device.revoked', 'subject_id' => $device->id]);
    }

    public function test_revoked_device_with_a_surviving_token_is_still_refused(): void
    {
        $tenant = $this->makeTenant();
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($tenant);
        $headers = $this->deviceHeaders($device, $secret);
        // Simulate revocation recorded without token cleanup (e.g. a direct DB fix).
        Device::whereKey($device->id)->update(['revoked_at' => now()]);

        $this->getJson('/api/v1/registers', $headers)->assertStatus(403)->assertJsonPath('error.code', 'device_revoked');
    }

    public function test_revoked_register_slot_can_take_a_new_device(): void
    {
        $tenant = $this->makeTenant();
        [, $register] = $this->makeRegister($tenant);
        $owner = $this->makeUser($tenant);
        ['device' => $old] = $this->makeDevice($tenant, $register, $owner);
        $headers = $this->userHeaders($owner, $tenant);

        $this->deleteJson("/api/v1/devices/{$old->id}", [], $headers)->assertOk();
        $this->postJson('/api/v1/devices', [
            'register_id' => $register->id, 'name' => 'Replacement', 'platform' => 'android', 'public_key' => $this->publicKey(),
        ], $headers)->assertCreated();
    }
}
