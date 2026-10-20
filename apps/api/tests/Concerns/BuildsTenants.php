<?php

namespace Tests\Concerns;

use App\Auth\Role;
use App\Auth\TokenIssuer;
use App\Billing\PlanCatalog;
use App\Models\Branch;
use App\Models\Device;
use App\Models\Membership;
use App\Models\Register;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Base64Url;
use App\Tenancy\TenantContext;
use Illuminate\Support\Str;

/** Builds tenants, staff and devices directly, so each test states only what it is about. */
trait BuildsTenants
{
    protected function makeTenant(string $name = 'Shop', string $plan = 'starter', string $status = 'trialing'): Tenant
    {
        $tenant = Tenant::create(['name' => $name, 'status' => 'active']);
        app(TenantContext::class)->run($tenant, fn () => Subscription::create([
            'plan_id' => app(PlanCatalog::class)->get($plan)->id,
            'status' => $status,
            'current_period_ends_at' => now()->addDays(14),
        ]));

        return $tenant;
    }

    protected function makeUser(Tenant $tenant, Role $role = Role::Owner): User
    {
        $user = User::create(['name' => ucfirst($role->value), 'email' => Str::lower(Str::random(8)).'@example.test', 'password' => 'correct horse battery']);
        Membership::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'role' => $role]);

        return $user;
    }

    /** @return array<string, string> */
    protected function userHeaders(User $user, ?Tenant $tenant = null): array
    {
        $token = app(TokenIssuer::class)->issue($user, 'test')['access_token'];

        return array_filter(['Authorization' => "Bearer {$token}", 'X-Tenant-Id' => $tenant?->id]);
    }

    /** @return array{0: Branch, 1: Register} */
    protected function makeRegister(Tenant $tenant, string $code = 'R1'): array
    {
        return app(TenantContext::class)->run($tenant, function () use ($code) {
            $branch = Branch::firstOrCreate(['code' => 'MAIN'], ['name' => 'Main']);
            $register = Register::create(['branch_id' => $branch->id, 'name' => "Till {$code}", 'code' => $code]);

            return [$branch, $register];
        });
    }

    /** @return array{device: Device, secret: string} */
    protected function makeDevice(Tenant $tenant, ?Register $register = null, ?User $by = null): array
    {
        $register ??= $this->makeRegister($tenant, 'D'.Str::random(4))[1];
        $pair = sodium_crypto_sign_keypair();
        $device = Device::create([
            'tenant_id' => $tenant->id,
            'branch_id' => $register->branch_id,
            'register_id' => $register->id,
            'name' => 'Till',
            'platform' => 'android',
            'public_key' => Base64Url::encode(sodium_crypto_sign_publickey($pair)),
            'registered_by_user_id' => ($by ?? $this->makeUser($tenant))->id,
        ]);

        return ['device' => $device, 'secret' => sodium_crypto_sign_secretkey($pair)];
    }

    protected function deviceSignature(Device $device, string $secret, string $challenge): string
    {
        $message = "inkypos-device-auth:v1:{$device->id}:{$challenge}";

        return Base64Url::encode(sodium_crypto_sign_detached($message, $secret));
    }

    /** Full challenge-response; returns Authorization headers for the device. */
    protected function deviceHeaders(Device $device, string $secret): array
    {
        $challenge = $this->postJson('/api/v1/auth/device/challenge', ['device_id' => $device->id])->json('data.challenge');
        $token = $this->postJson('/api/v1/auth/device/token', [
            'device_id' => $device->id,
            'challenge' => $challenge,
            'signature' => $this->deviceSignature($device, $secret, $challenge),
        ])->assertOk()->json('data.access_token');

        return ['Authorization' => "Bearer {$token}"];
    }
}
