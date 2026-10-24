<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Auth\Totp;
use App\Http\ApiExceptionRenderer;
use App\Models\PlatformUser;
use Exception;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

/** Fixes from the October 2026 security review (docs/SECURITY.md). */
class SecurityHardeningTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private function signup(string $email): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/v1/auth/signup', ['business_name' => 'Shop', 'name' => 'Tendai', 'email' => $email, 'password' => 'a long enough password', 'device_name' => 'x']);
    }

    public function test_an_email_in_different_capitals_is_already_taken_not_a_server_error(): void
    {
        $this->signup('owner@shop.test')->assertCreated();
        $this->signup('  Owner@Shop.TEST ')->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->postJson('/api/v1/auth/login', ['email' => 'OWNER@shop.test', 'password' => 'a long enough password', 'device_name' => 'x'])->assertOk();
    }

    public function test_database_errors_never_reach_the_caller_even_in_debug_mode(): void
    {
        config(['app.debug' => true]);
        $e = new QueryException('sqlite', 'insert into users (password) values (?)', ['$2y$12$secret-hash'], new Exception('UNIQUE constraint failed'));
        $body = app(ApiExceptionRenderer::class)->render($e, Request::create('/api/v1/x'))->getContent();

        $this->assertStringNotContainsString('secret-hash', $body);
        $this->assertStringNotContainsString('insert into', $body);
        $this->assertStringContainsString('An unexpected error occurred.', $body);
    }

    public function test_password_guessing_is_limited_per_account_whatever_the_address(): void
    {
        config(['inkypos.rate_limits.per_account_per_minute' => 5]);
        foreach (range(1, 5) as $i) {
            $this->withServerVariables(['REMOTE_ADDR' => "203.0.113.{$i}"])
                ->postJson('/api/v1/auth/login', ['email' => 'victim@shop.test', 'password' => "guess {$i}", 'device_name' => 'x'])->assertStatus(401);
        }
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.9'])
            ->postJson('/api/v1/auth/login', ['email' => 'Victim@shop.test', 'password' => 'guess 6', 'device_name' => 'x'])->assertStatus(429);
        // Someone else signing in is not affected.
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.9'])
            ->postJson('/api/v1/auth/login', ['email' => 'other@shop.test', 'password' => 'x', 'device_name' => 'x'])->assertStatus(401);
    }

    public function test_the_real_visitor_address_is_used_only_behind_a_trusted_proxy(): void
    {
        $login = fn () => $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])
            ->withHeader('X-Forwarded-For', '203.0.113.50')
            ->postJson('/api/v1/auth/login', ['email' => 'nobody@shop.test', 'password' => 'x', 'device_name' => 'x']);

        $login()->assertStatus(401);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login_failed', 'ip' => '10.0.0.1']);

        config(['trustedproxy.proxies' => '10.0.0.1']);
        $login()->assertStatus(401);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login_failed', 'ip' => '203.0.113.50']);
    }

    public function test_browsers_may_call_the_api_only_from_the_configured_web_apps(): void
    {
        config(['cors.allowed_origins' => ['https://app.inkypos.test']]);
        $preflight = fn (string $origin) => $this->call('OPTIONS', '/api/v1/auth/login', server: [
            'HTTP_ORIGIN' => $origin, 'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
        ]);

        $this->assertSame('https://app.inkypos.test', $preflight('https://app.inkypos.test')->headers->get('Access-Control-Allow-Origin'));
        // Another site is never named (nor "*"), so its browser refuses to pass on the response.
        $this->assertNotContains($preflight('https://evil.example')->headers->get('Access-Control-Allow-Origin'), ['https://evil.example', '*']);
    }

    public function test_a_temporary_password_from_inkgenius_must_be_replaced_before_anything_else(): void
    {
        $admin = PlatformUser::create(['name' => 'A', 'email' => 'a@inkgenius.test', 'password' => 'correct horse battery', 'role' => 'administrator']);
        $platform = ['Authorization' => 'Bearer '.$this->postJson('/api/v1/platform/auth/login', ['email' => $admin->email, 'password' => 'correct horse battery'])->json('data.access_token')];
        $created = $this->postJson('/api/v1/platform/businesses', ['business_name' => 'Kwa Mai', 'business_type' => 'retail', 'manager_name' => 'Rudo', 'manager_email' => 'Rudo@Shop.test'], $platform)
            ->assertCreated()->json('data');

        $session = $this->postJson('/api/v1/auth/login', ['email' => 'rudo@shop.test', 'password' => $created['temporary_password'], 'device_name' => 'web'])
            ->assertOk()->assertJsonPath('data.user.must_change_password', true)->json('data');
        $other = $this->postJson('/api/v1/auth/login', ['email' => 'rudo@shop.test', 'password' => $created['temporary_password'], 'device_name' => 'phone'])->json('data');
        $headers = ['Authorization' => 'Bearer '.$session['tokens']['access_token'], 'X-Tenant-Id' => $created['business']['id']];

        $this->getJson('/api/v1/branches', $headers)->assertStatus(403)->assertJsonPath('error.code', 'password_change_required');
        $this->postJson('/api/v1/me/password', ['current_password' => 'wrong', 'password' => 'my own long password'], $headers)
            ->assertStatus(422)->assertJsonValidationErrors(['current_password'], 'error.details');
        $this->postJson('/api/v1/me/password', ['current_password' => $created['temporary_password'], 'password' => $created['temporary_password']], $headers)->assertStatus(422);
        $this->postJson('/api/v1/me/password', ['current_password' => $created['temporary_password'], 'password' => 'my own long password'], $headers)
            ->assertOk()->assertJsonPath('data.user.must_change_password', false);

        $this->getJson('/api/v1/branches', $headers)->assertOk();
        // Every other session ends: the phone signed in with the temporary password must sign in again.
        $this->getJson('/api/v1/me', ['Authorization' => 'Bearer '.$other['tokens']['access_token']])->assertStatus(401);
        $this->postJson('/api/v1/auth/refresh', ['refresh_token' => $other['tokens']['refresh_token']])->assertStatus(401);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.password_changed']);
    }

    public function test_anyone_signed_in_can_change_their_own_password(): void
    {
        $tenant = $this->makeTenant('Shop', 'growth', 'active');
        $manager = $this->makeUser($tenant, Role::Manager);
        $headers = $this->userHeaders($manager, $tenant);

        $this->postJson('/api/v1/me/password', ['current_password' => 'correct horse battery', 'password' => 'short'], $headers)->assertStatus(422);
        $this->postJson('/api/v1/me/password', ['current_password' => 'correct horse battery', 'password' => 'a brand new password'], $headers)->assertOk();
        $this->postJson('/api/v1/auth/login', ['email' => $manager->email, 'password' => 'a brand new password', 'device_name' => 'x'])->assertOk();
    }

    public function test_inkgenius_staff_must_set_up_and_then_use_authenticator_codes(): void
    {
        config(['inkypos.platform.require_two_factor' => true]);
        $staff = PlatformUser::create(['name' => 'S', 'email' => 's@inkgenius.test', 'password' => 'correct horse battery', 'role' => 'support']);
        $login = fn (array $extra = []) => $this->postJson('/api/v1/platform/auth/login', ['email' => 's@inkgenius.test', 'password' => 'correct horse battery', ...$extra]);

        $session = $login()->assertOk()->assertJsonPath('data.user.setup_required', 'two_factor_setup_required')->json('data');
        $headers = ['Authorization' => "Bearer {$session['access_token']}"];
        $this->getJson('/api/v1/platform/businesses', $headers)->assertStatus(403)->assertJsonPath('error.code', 'two_factor_setup_required');
        $this->getJson('/api/v1/platform/me', $headers)->assertOk();

        $setup = $this->postJson('/api/v1/platform/me/two-factor', [], $headers)->assertOk()->json('data');
        $this->assertStringStartsWith('otpauth://totp/', $setup['otpauth_url']);
        $this->postJson('/api/v1/platform/me/two-factor/confirm', ['code' => '000000'], $headers)->assertStatus(422);
        $step = Totp::step();
        $this->postJson('/api/v1/platform/me/two-factor/confirm', ['code' => Totp::code($setup['secret'], $step)], $headers)
            ->assertOk()->assertJsonPath('data.two_factor_enabled', true)->assertJsonPath('data.setup_required', null);
        $this->getJson('/api/v1/platform/businesses', $headers)->assertOk();
        $this->assertNotSame($setup['secret'], PlatformUser::find($staff->id)->getRawOriginal('two_factor_secret'), 'stored encrypted');

        $login()->assertStatus(401)->assertJsonPath('error.code', 'two_factor_required');
        $login(['code' => Totp::code($setup['secret'], $step)])->assertStatus(422); // the same code twice
        $login(['code' => Totp::code($setup['secret'], $step + 1)])->assertOk();
        $this->postJson('/api/v1/platform/auth/login', ['email' => 's@inkgenius.test', 'password' => 'wrong', 'code' => Totp::code($setup['secret'], $step + 1)])->assertStatus(401);
    }

    public function test_an_administrator_resets_authenticator_codes_for_a_lost_phone(): void
    {
        $admin = PlatformUser::create(['name' => 'A', 'email' => 'a@inkgenius.test', 'password' => 'correct horse battery', 'role' => 'administrator']);
        $staff = PlatformUser::create(['name' => 'T', 'email' => 't@inkgenius.test', 'password' => 'correct horse battery', 'role' => 'technician']);
        $staff->forceFill(['two_factor_secret' => Totp::secret(), 'two_factor_confirmed_at' => now()])->save();
        $headers = ['Authorization' => 'Bearer '.$this->postJson('/api/v1/platform/auth/login', ['email' => $admin->email, 'password' => 'correct horse battery'])->json('data.access_token')];

        $this->postJson("/api/v1/platform/users/{$staff->id}/reset-two-factor", [], $headers)->assertOk()->assertJsonPath('data.two_factor_enabled', false);
        $this->postJson('/api/v1/platform/auth/login', ['email' => 't@inkgenius.test', 'password' => 'correct horse battery'])->assertOk();
    }

    public function test_new_inkgenius_staff_replace_their_temporary_password_first(): void
    {
        $admin = PlatformUser::create(['name' => 'A', 'email' => 'a@inkgenius.test', 'password' => 'correct horse battery', 'role' => 'administrator']);
        $headers = ['Authorization' => 'Bearer '.$this->postJson('/api/v1/platform/auth/login', ['email' => $admin->email, 'password' => 'correct horse battery'])->json('data.access_token')];
        $temporary = $this->postJson('/api/v1/platform/users', ['name' => 'N', 'email' => 'N@Inkgenius.test', 'role' => 'support'], $headers)->assertCreated()->json('data.temporary_password');

        $token = $this->postJson('/api/v1/platform/auth/login', ['email' => 'n@inkgenius.test', 'password' => $temporary])
            ->assertOk()->assertJsonPath('data.user.setup_required', 'password_change_required')->json('data.access_token');
        $mine = ['Authorization' => "Bearer {$token}"];
        $this->getJson('/api/v1/platform/businesses', $mine)->assertStatus(403)->assertJsonPath('error.code', 'password_change_required');
        $this->postJson('/api/v1/platform/me/password', ['current_password' => $temporary, 'password' => 'short pass'], $mine)->assertStatus(422);
        $this->postJson('/api/v1/platform/me/password', ['current_password' => $temporary, 'password' => 'a long new password'], $mine)->assertOk()->assertJsonPath('data.setup_required', null);
        $this->getJson('/api/v1/platform/businesses', $mine)->assertOk();
    }

    public function test_authenticator_codes_match_the_rfc_6238_test_vector(): void
    {
        // RFC 6238 appendix B: secret "12345678901234567890", T = 59 s → 94287082 (8 digits), so 287082 for 6.
        $secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
        $this->assertSame('287082', Totp::code($secret, Totp::step(59)));
        $this->assertSame(1, Totp::verify($secret, '287 082', time: 59));
        $this->assertNull(Totp::verify($secret, '287082', lastUsed: 1, time: 59));
        $this->assertSame(32, strlen(Totp::secret()));
    }
}
