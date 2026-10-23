<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Auth\Role;
use App\Catalogue\Catalogue;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\User;
use App\Staff\StaffPin;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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

    /**
     * POST /staff — someone who only works the tills: a name, a role and usually a
     * PIN, but no email or password, so they can never sign in to the back office.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:1', 'max:120'],
            'role' => ['sometimes', Rule::in([Role::Cashier->value, Role::Manager->value])],
            'pin' => ['sometimes', 'nullable', 'string'],
        ]);
        $role = Role::from($data['role'] ?? Role::Cashier->value);
        if ($role === Role::Manager && $this->context()->membership()?->role !== Role::Owner) {
            throw ApiException::forbidden('Only an owner can add a manager.');
        }
        $pin = $data['pin'] ?? null;
        if ($pin !== null && ($weakness = StaffPin::weakness($pin))) {
            throw new ApiException('validation_failed', $weakness, 422);
        }

        $membership = DB::transaction(function () use ($data, $role, $pin) {
            $user = User::create(['name' => trim($data['name']), 'email' => null, 'password' => null]);
            $membership = Membership::create([
                'tenant_id' => $this->context()->id(),
                'user_id' => $user->id,
                'role' => $role,
                'version' => 1,
                ...($pin !== null ? [...StaffPin::make($pin), 'pin_set_at' => now()] : []),
            ]);
            $this->catalogue->record('staff', $user->id);
            Audit::record('staff.created', $membership, ['user_id' => $user->id, 'role' => $role->value, 'till_only' => true]);

            return $membership->load('user');
        });

        return ApiResponse::ok($this->toApi($membership), 201);
    }

    public function update(Request $request, string $user): JsonResponse
    {
        $membership = $this->editable($user);
        $data = $request->validate([
            'active' => ['sometimes', 'boolean'],
            'name' => ['sometimes', 'string', 'min:1', 'max:120'],
        ]);
        if (array_key_exists('name', $data)) {
            // People with a login own their name; only till-only staff are renamed here.
            if ($membership->user->email !== null) {
                throw new ApiException('validation_failed', 'Only till-only staff can be renamed here.', 422);
            }
            DB::transaction(function () use ($membership, $data) {
                $membership->user->update(['name' => trim($data['name'])]);
                $this->change($membership, 'staff.renamed', []);
            });
        }
        if (array_key_exists('active', $data)) {
            if (! $data['active'] && $membership->id === $this->context()->membership()?->id) {
                throw new ApiException('validation_failed', 'You cannot deactivate yourself.', 422);
            }
            if ($data['active'] !== $membership->isActive()) {
                $this->change($membership, $data['active'] ? 'staff.reactivated' : 'staff.deactivated', ['deactivated_at' => $data['active'] ? null : now()]);
            }
        }

        return ApiResponse::ok($this->toApi($membership->refresh()->load('user')));
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
            // No email: works the tills only and can never sign in to the back office.
            'till_only' => $m->user->email === null,
            'role' => $m->role->value,
            'active' => $m->isActive(),
            'has_pin' => $m->hasPin(),
            'pin_set_at' => $m->pin_set_at?->toIso8601String(),
            'version' => $m->version,
        ];
    }
}
