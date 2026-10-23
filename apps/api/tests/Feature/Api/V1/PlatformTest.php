<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Models\PlatformUser;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

/** Inkgenius Technologies staff and the platform portal API. */
class PlatformTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    /** @var array<string, PlatformUser> */
    private array $staff = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['administrator', 'support', 'technician', 'accounts'] as $role) {
            $this->staff[$role] = PlatformUser::create(['name' => ucfirst($role), 'email' => "{$role}@inkgenius.test", 'password' => 'correct horse battery', 'role' => $role]);
        }
    }

    /** @return array<string, string> */
    private function as(string $role): array
    {
        $token = $this->postJson('/api/v1/platform/auth/login', ['email' => "{$role}@inkgenius.test", 'password' => 'correct horse battery'])
            ->assertOk()->json('data.access_token');

        return ['Authorization' => "Bearer {$token}"];
    }

    private function signup(string $email = 'm@shop.test', string $type = 'retail'): string
    {
        return $this->postJson('/api/v1/auth/signup', [
            'business_name' => 'Mbare Hardware', 'name' => 'Tendai', 'email' => $email, 'password' => 'a long enough password', 'device_name' => 'x', 'business_type' => $type,
        ])->assertCreated()->json('data.memberships.0.tenant_id');
    }

    public function test_staff_sign_in_and_see_what_their_role_allows(): void
    {
        $this->postJson('/api/v1/platform/auth/login', ['email' => 'support@inkgenius.test', 'password' => 'wrong'])->assertStatus(401);

        $me = $this->getJson('/api/v1/platform/me', $this->as('accounts'))->assertOk()->json('data');
        $this->assertSame(['accounts', 'Accounts Department'], [$me['role'], $me['role_label']]);
        $this->assertContains('subscriptions.manage', $me['permissions']);
        $this->assertNotContains('devices.manage', $me['permissions']);
        $this->assertNotNull($this->staff['accounts']->refresh()->last_login_at);
    }

    public function test_a_signed_up_business_waits_until_accounts_or_an_administrator_activates_it(): void
    {
        $tenantId = $this->signup();
        $pending = $this->getJson('/api/v1/platform/businesses?status=pending', $this->as('support'))->assertOk()->json('data');
        $this->assertSame([$tenantId], array_column($pending, 'id'));

        $this->postJson("/api/v1/platform/businesses/{$tenantId}/activate", [], $this->as('support'))->assertStatus(403);
        $this->postJson("/api/v1/platform/businesses/{$tenantId}/activate", [], $this->as('technician'))->assertStatus(403);
        $this->postJson("/api/v1/platform/businesses/{$tenantId}/activate", [], $this->as('accounts'))->assertOk()->assertJsonPath('data.status', 'active');

        $tenant = Tenant::findOrFail($tenantId);
        $this->assertSame($this->staff['accounts']->id, $tenant->activated_by);
        $this->assertDatabaseHas('audit_logs', ['action' => 'platform.business_activated', 'tenant_id' => $tenantId, 'actor_type' => 'platform']);

        $this->postJson("/api/v1/platform/businesses/{$tenantId}/suspend", ['reason' => 'Unpaid invoice'], $this->as('administrator'))
            ->assertOk()->assertJsonPath('data.status', 'suspended')->assertJsonPath('data.status_reason', 'Unpaid invoice');
    }

    public function test_inkgenius_can_create_a_business_directly_with_a_temporary_manager_password(): void
    {
        $this->postJson('/api/v1/platform/businesses', ['business_name' => 'X', 'business_type' => 'both', 'manager_name' => 'M', 'manager_email' => 'new@shop.test'], $this->as('support'))
            ->assertStatus(403);

        $created = $this->postJson('/api/v1/platform/businesses', [
            'business_name' => 'Kwa Mai', 'business_type' => 'both', 'manager_name' => 'Rudo', 'manager_email' => 'rudo@shop.test',
        ], $this->as('administrator'))->assertCreated()->json('data');

        $this->assertSame(['active', 'both'], [$created['business']['status'], $created['business']['business_type']]);
        $this->postJson('/api/v1/auth/login', ['email' => 'rudo@shop.test', 'password' => $created['temporary_password'], 'device_name' => 'x'])
            ->assertOk()->assertJsonPath('data.memberships.0.role', 'manager')->assertJsonPath('data.memberships.0.tenant_status', 'active');
    }

    public function test_business_details_staff_and_subscription(): void
    {
        $tenant = $this->makeTenant('Shop', 'growth', 'active');
        $manager = $this->makeUser($tenant, Role::Manager);
        $this->makeUser($tenant, Role::Cashier);
        ['device' => $device] = $this->makeDevice($tenant, by: $manager);

        $this->postJson("/api/v1/platform/businesses/{$tenant->id}/suspend", ['reason' => 'Checking the activity log'], $this->as('administrator'))->assertOk();
        $this->assertSame([], $this->getJson("/api/v1/platform/businesses/{$tenant->id}", $this->as('accounts'))->json('data.activity'), 'Accounts does not see the activity log');
        $detail = $this->getJson("/api/v1/platform/businesses/{$tenant->id}", $this->as('technician'))->assertOk()->json('data');
        $this->assertEqualsCanonicalizing(['manager', 'cashier'], array_column($detail['staff'], 'role'));
        $this->assertSame([$device->id], array_column($detail['tills'], 'id'));
        $this->assertSame('growth', $detail['subscription']['plan']);
        $this->assertNotEmpty($detail['activity']);

        $this->patchJson("/api/v1/platform/businesses/{$tenant->id}/subscription", ['plan' => 'starter'], $this->as('technician'))->assertStatus(403);
        $this->patchJson("/api/v1/platform/businesses/{$tenant->id}/subscription", ['plan' => 'starter', 'status' => 'active', 'current_period_ends_at' => now()->addMonth()->toDateString()], $this->as('accounts'))
            ->assertOk()->assertJsonPath('data.subscription.plan', 'starter')->assertJsonPath('data.subscription.status', 'active');
    }

    public function test_support_resets_a_managers_password_and_technicians_revoke_tills(): void
    {
        $tenant = $this->makeTenant('Shop', 'growth', 'active');
        $manager = $this->makeUser($tenant, Role::Manager);
        $cashier = $this->makeUser($tenant, Role::Cashier);
        ['device' => $device] = $this->makeDevice($tenant, by: $manager);
        $old = $this->userHeaders($manager, $tenant);

        $this->postJson("/api/v1/platform/businesses/{$tenant->id}/staff/{$manager->id}/reset-password", [], $this->as('technician'))->assertStatus(403);
        $this->postJson("/api/v1/platform/businesses/{$tenant->id}/staff/{$cashier->id}/reset-password", [], $this->as('support'))->assertStatus(404);
        $password = $this->postJson("/api/v1/platform/businesses/{$tenant->id}/staff/{$manager->id}/reset-password", [], $this->as('support'))->assertOk()->json('data.temporary_password');
        $this->getJson('/api/v1/branches', $old)->assertStatus(401);
        $this->postJson('/api/v1/auth/login', ['email' => $manager->email, 'password' => $password, 'device_name' => 'x'])->assertOk();

        $this->postJson("/api/v1/platform/businesses/{$tenant->id}/tills/{$device->id}/revoke", ['reason' => 'Stolen'], $this->as('support'))->assertStatus(403);
        $this->postJson("/api/v1/platform/businesses/{$tenant->id}/tills/{$device->id}/revoke", ['reason' => 'Stolen'], $this->as('technician'))
            ->assertOk()->assertJsonPath('data.revoked_at', fn ($v) => $v !== null);
    }

    public function test_business_tokens_and_platform_tokens_never_cross_over(): void
    {
        $tenant = $this->makeTenant('Shop', 'growth', 'active');
        $manager = $this->makeUser($tenant, Role::Manager);
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($tenant, by: $manager);

        $this->getJson('/api/v1/platform/businesses', $this->userHeaders($manager, $tenant))->assertStatus(403);
        $this->getJson('/api/v1/platform/businesses', $this->deviceHeaders($device, $secret))->assertStatus(403);
        $this->getJson('/api/v1/branches', [...$this->as('administrator'), 'X-Tenant-Id' => $tenant->id])->assertStatus(401);
        // A business user with the same email as Inkgenius staff is still just a business user.
        User::create(['name' => 'Same', 'email' => 'administrator@inkgenius.test', 'password' => 'x']);
        $this->postJson('/api/v1/auth/login', ['email' => 'administrator@inkgenius.test', 'password' => 'correct horse battery', 'device_name' => 'x'])->assertStatus(401);
    }

    public function test_only_administrators_manage_inkgenius_staff_and_one_always_remains(): void
    {
        $this->getJson('/api/v1/platform/users', $this->as('support'))->assertStatus(403);
        $admin = $this->as('administrator');

        $created = $this->postJson('/api/v1/platform/users', ['name' => 'New', 'email' => 'new@inkgenius.test', 'role' => 'technician'], $admin)->assertCreated()->json('data');
        $this->postJson('/api/v1/platform/auth/login', ['email' => 'new@inkgenius.test', 'password' => $created['temporary_password']])->assertOk();

        $self = $this->staff['administrator']->id;
        $this->patchJson("/api/v1/platform/users/{$self}", ['role' => 'support'], $admin)->assertStatus(422);
        $this->patchJson("/api/v1/platform/users/{$self}", ['active' => false], $admin)->assertStatus(422);

        $support = $this->as('support');
        $this->patchJson("/api/v1/platform/users/{$this->staff['support']->id}", ['active' => false], $admin)->assertOk()->assertJsonPath('data.active', false);
        $this->getJson('/api/v1/platform/businesses', $support)->assertStatus(401);
        $this->postJson('/api/v1/platform/auth/login', ['email' => 'support@inkgenius.test', 'password' => 'correct horse battery'])->assertStatus(401);
    }

    public function test_the_first_administrator_comes_from_the_command_line(): void
    {
        $this->artisan('inkypos:platform-admin', ['email' => 'Boss@Inkgenius.test', 'name' => 'Boss'])->assertSuccessful();
        $this->assertSame('administrator', PlatformUser::where('email', 'boss@inkgenius.test')->firstOrFail()->role->value);
        $this->artisan('inkypos:platform-admin', ['email' => 'boss@inkgenius.test', 'name' => 'Boss'])->assertFailed();
    }

    public function test_every_platform_route_requires_a_platform_permission(): void
    {
        $routes = collect(app('router')->getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with((string) $r->getName(), 'api.v1.platform.'));
        $this->assertNotEmpty($routes);
        foreach ($routes as $route) {
            if ($route->getName() === 'api.v1.platform.auth.login') {
                continue;
            }
            $this->assertNotEmpty(array_filter($route->gatherMiddleware(), fn ($m) => str_starts_with($m, 'platform:')), $route->getName().' has no platform permission');
        }
        $this->assertSame(0, DB::table('personal_access_tokens')->where('tokenable_type', PlatformUser::class)->count(), 'no tokens issued yet');
        app(TenantContext::class)->clear();
    }
}
