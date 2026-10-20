<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\Register;
use App\Support\ApiResponse;
use App\Support\Base64Url;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DeviceController extends Controller
{
    /** Resolved on every use: controllers, services and middleware can outlive a request (route caching, Octane). */
    private function context(): TenantContext
    {
        return app(TenantContext::class);
    }

    public function index(): JsonResponse
    {
        return ApiResponse::ok(
            Device::where('tenant_id', $this->context()->id())->orderByDesc('created_at')->get()->map->toApi()->values()
        );
    }

    /** A manager, signed in on the till itself, registers it against one register. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'register_id' => ['required', 'uuid'],
            'name' => ['required', 'string', 'max:100'],
            'platform' => ['required', Rule::in(['android', 'ios', 'web', 'windows', 'macos'])],
            'public_key' => ['required', 'string', 'regex:/^[A-Za-z0-9_-]{43}$/'],
        ]);
        $key = Base64Url::decode($data['public_key']);
        if ($key === null || strlen($key) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) {
            throw new ApiException('validation_failed', 'public_key must be a base64url Ed25519 public key.', 422);
        }

        $subscription = $this->context()->tenant()->subscription()->first();
        if (! $subscription?->isEntitled()) {
            throw ApiException::subscriptionInactive();
        }

        $device = DB::transaction(function () use ($data, $request) {
            // Tenant-scoped lookup: another tenant's register is simply not found (404).
            $register = Register::whereKey($data['register_id'])->lockForUpdate()->firstOrFail();
            if (Device::where('register_id', $register->id)->whereNull('revoked_at')->exists()) {
                throw ApiException::conflict('This register already has an active device. Revoke it first.');
            }

            $device = Device::create([
                'tenant_id' => $register->tenant_id,
                'branch_id' => $register->branch_id,
                'register_id' => $register->id,
                'name' => $data['name'],
                'platform' => $data['platform'],
                'public_key' => $data['public_key'],
                'registered_by_user_id' => $request->user()->id,
            ]);
            Audit::record('device.registered', $device, ['register_id' => $register->id, 'platform' => $data['platform']]);

            return $device;
        });

        return ApiResponse::ok($device->toApi(), 201);
    }

    /** Revocation is immediate: tokens are deleted and the key can no longer obtain new ones. */
    public function destroy(Request $request, string $device): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:255']]);

        $model = DB::transaction(function () use ($device, $data, $request) {
            $model = Device::where('tenant_id', $this->context()->id())->whereKey($device)->lockForUpdate()->firstOrFail();
            if (! $model->isRevoked()) {
                $model->forceFill([
                    'revoked_at' => now(),
                    'revoked_by_user_id' => $request->user()->id,
                    'revocation_reason' => $data['reason'] ?? null,
                ])->save();
                $model->tokens()->delete();
                Audit::record('device.revoked', $model, ['reason' => $data['reason'] ?? null]);
            }

            return $model;
        });

        return ApiResponse::ok($model->toApi());
    }
}
