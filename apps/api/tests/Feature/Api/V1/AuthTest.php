<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Models\AuditLog;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private function signup(string $email = 'owner@shop.test'): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/v1/auth/signup', [
            'business_name' => 'Mbare Hardware',
            'name' => 'Tendai',
            'email' => $email,
            'password' => 'a long enough password',
            'device_name' => 'Pixel 9',
        ]);
    }

    public function test_signup_creates_business_owner_and_trial(): void
    {
        $response = $this->signup()->assertCreated()
            ->assertJsonPath('data.user.email', 'owner@shop.test')
            ->assertJsonPath('data.memberships.0.role', 'owner')
            ->assertJsonPath('data.memberships.0.tenant_name', 'Mbare Hardware');

        $tenant = Tenant::findOrFail($response->json('data.memberships.0.tenant_id'));
        $subscription = app(TenantContext::class)->run($tenant, fn () => Subscription::first());
        $this->assertSame('trialing', $subscription->status);
        $this->assertTrue($subscription->current_period_ends_at->between(now()->addDays(13), now()->addDays(15)));
        $this->assertDatabaseHas('audit_logs', ['action' => 'tenant.created', 'tenant_id' => $tenant->id]);
    }

    public function test_signup_rejects_duplicate_email_and_weak_password(): void
    {
        $this->signup()->assertCreated();
        $this->signup()->assertStatus(422)->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['details' => ['email']]]);

        $this->postJson('/api/v1/auth/signup', [
            'business_name' => 'X Ltd', 'name' => 'X', 'email' => 'x@shop.test', 'password' => 'short', 'device_name' => 'd',
        ])->assertStatus(422)->assertJsonStructure(['error' => ['details' => ['password']]]);
    }

    public function test_login_returns_session_and_rejects_bad_credentials_uniformly(): void
    {
        $tenant = $this->makeTenant();
        $user = $this->makeUser($tenant, Role::Manager);

        $this->postJson('/api/v1/auth/login', ['email' => strtoupper($user->email), 'password' => 'correct horse battery', 'device_name' => 'till'])
            ->assertOk()
            ->assertJsonPath('data.memberships.0.role', 'manager')
            ->assertJsonStructure(['data' => ['tokens' => ['access_token', 'access_expires_at', 'refresh_token', 'refresh_expires_at']]]);

        $wrongPassword = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'nope', 'device_name' => 'till']);
        $unknownUser = $this->postJson('/api/v1/auth/login', ['email' => 'ghost@shop.test', 'password' => 'nope', 'device_name' => 'till']);

        $wrongPassword->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
        $this->assertSame($wrongPassword->json('error.message'), $unknownUser->json('error.message'));
        $this->assertSame(2, AuditLog::where('action', 'auth.login_failed')->count());
    }

    public function test_refresh_rotates_tokens_and_invalidates_the_old_access_token(): void
    {
        $tokens = $this->signup()->json('data.tokens');

        $new = $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $tokens['refresh_token']])->assertOk()->json('data.tokens');

        $this->assertNotSame($tokens['refresh_token'], $new['refresh_token']);
        $this->getJson('/api/v1/me', ['Authorization' => 'Bearer '.$tokens['access_token']])->assertStatus(401);
        $this->getJson('/api/v1/me', ['Authorization' => 'Bearer '.$new['access_token']])->assertOk();
    }

    public function test_reusing_a_refresh_token_revokes_the_whole_family(): void
    {
        $original = $this->signup()->json('data.tokens');
        $second = $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $original['refresh_token']])->json('data.tokens');

        // An attacker replays the first refresh token.
        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $original['refresh_token']])
            ->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');

        // The legitimate holder's newer tokens are now dead too.
        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $second['refresh_token']])->assertStatus(401);
        $this->getJson('/api/v1/me', ['Authorization' => 'Bearer '.$second['access_token']])->assertStatus(401);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.refresh_token_reused']);
    }

    public function test_refresh_rejects_garbage_and_expired_tokens(): void
    {
        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => 'not-a-token'])->assertStatus(401);

        $tokens = $this->signup()->json('data.tokens');
        $this->travel(31)->days();
        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $tokens['refresh_token']])->assertStatus(401);
    }

    public function test_access_tokens_expire(): void
    {
        $tokens = $this->signup()->json('data.tokens');
        $this->travel(16)->minutes();
        $this->getJson('/api/v1/me', ['Authorization' => 'Bearer '.$tokens['access_token']])->assertStatus(401);
    }

    public function test_logout_revokes_access_and_refresh_tokens(): void
    {
        $tokens = $this->signup()->json('data.tokens');
        $auth = ['Authorization' => 'Bearer '.$tokens['access_token']];

        $this->postJson('/api/v1/auth/logout', [], $auth)->assertOk()->assertJsonPath('data.revoked', true);

        $this->getJson('/api/v1/me', $auth)->assertStatus(401);
        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $tokens['refresh_token']])->assertStatus(401);
    }

    public function test_login_is_rate_limited(): void
    {
        foreach (range(1, 10) as $_) {
            $this->postJson('/api/v1/auth/login', ['email' => 'x@shop.test', 'password' => 'nope', 'device_name' => 'd'])->assertStatus(401);
        }
        $this->postJson('/api/v1/auth/login', ['email' => 'x@shop.test', 'password' => 'nope', 'device_name' => 'd'])
            ->assertStatus(429)->assertJsonPath('error.code', 'rate_limited');
    }
}
