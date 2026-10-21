<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Auth\Role;
use App\Catalogue\Catalogue;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Staff\StaffPin;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Till sign-in for the people in a business: PINs and deactivation. Staff are
 * addressed by user id; every change is recorded in the change feed so tills
 * pick it up (docs/ARCHITECTURE.md §7).
 */
class StaffController extends Controller
{
    public function __construct(
        private readonly Catalogue $catalogue,
    ) {}

    /** Resolved on every use: controllers, services and middleware can outlive a request (route caching, Octane). */
    private function context(): TenantContext
    {
        return app(TenantContext::class);
    }

    public function index(): JsonResponse
    {
        $staff = Membership::with('user')->where('tenant_id', $this->context()->id())->get()
            ->sortBy(fn (Membership $m) => mb_strtolower($m->user->name))
            ->map(fn (Membership $m) => $this->toApi($m));

        return ApiResponse::ok($staff->values());
    }

    public function setPin(Request $request, string $user): JsonResponse
    {
        $membership = $this->editable($user);
        $data = $request->validate(['pin' => ['required', 'string']]);
        if ($weakness = StaffPin::weakness($data['pin'])) {
            throw new ApiException('validation_failed', $weakness, 422);
        }

        $this->change($membership, 'staff.pin_set', [...StaffPin::make($data['pin']), 'pin_set_at' => now()]);

        return ApiResponse::ok($this->toApi($membership));
    }

    public function clearPin(string $user): JsonResponse
    {
        $membership = $this->editable($user);
        $this->change($membership, 'staff.pin_cleared', ['pin_algorithm' => null, 'pin_iterations' => null, 'pin_salt' => null, 'pin_hash' => null, 'pin_set_at' => null]);

        return ApiResponse::ok($this->toApi($membership));
    }

    public function update(Request $request, string $user): JsonResponse
    {
        $membership = $this->editable($user);
        $data = $request->validate(['active' => ['required', 'boolean']]);
        if (! $data['active'] && $membership->id === $this->context()->membership()?->id) {
            throw new ApiException('validation_failed', 'You cannot deactivate yourself.', 422);
        }
        if ($data['active'] !== $membership->isActive()) {
            $this->change($membership, $data['active'] ? 'staff.reactivated' : 'staff.deactivated', ['deactivated_at' => $data['active'] ? null : now()]);
        }

        return ApiResponse::ok($this->toApi($membership));
    }

    /** The membership behind a user id in this business; managers may not change owners. */
    private function editable(string $userId): Membership
    {
        $membership = Str::isUuid($userId) ? $this->catalogue->staffMembership($userId) : null;
        if (! $membership) {
            throw new ApiException('not_found', 'Resource not found.', 404);
        }
        if ($membership->role === Role::Owner && $this->context()->membership()?->role !== Role::Owner) {
            throw ApiException::forbidden('Only an owner can change an owner.');
        }

        return $membership;
    }

    /** @param array<string, mixed> $attributes */
    private function change(Membership $membership, string $action, array $attributes): void
    {
        DB::transaction(function () use ($membership, $action, $attributes) {
            $membership->fill($attributes);
            $membership->version++;
            $membership->save();
            $this->catalogue->record('staff', $membership->user_id);
            Audit::record($action, $membership, ['user_id' => $membership->user_id]);
        });
    }

    /** @return array<string, mixed> */
    private function toApi(Membership $m): array
    {
        return [
            'id' => $m->user_id,
            'name' => $m->user->name,
            'email' => $m->user->email,
            'role' => $m->role->value,
            'active' => $m->isActive(),
            'has_pin' => $m->hasPin(),
            'pin_set_at' => $m->pin_set_at?->toIso8601String(),
            'version' => $m->version,
        ];
    }
}
