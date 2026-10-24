<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Audit\Audit;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\PlatformUser;
use App\Platform\PlatformRole;
use App\Support\ApiResponse;
use App\Support\EmailInput;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Inkgenius Technologies staff accounts (administrators only). */
class PlatformUserController extends Controller
{
    public function index(): JsonResponse
    {
        return ApiResponse::ok(PlatformUser::orderBy('name')->get()->map->toApi()->values());
    }

    /** New staff get a temporary password, shown once, to pass on securely. */
    public function store(Request $request): JsonResponse
    {
        EmailInput::normalise($request, 'email');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:254', 'unique:platform_users,email'],
            'role' => ['required', Rule::enum(PlatformRole::class)],
        ]);
        $password = Str::password(14, symbols: false);
        $user = PlatformUser::create([...$data, 'password' => $password]);
        $user->forceFill(['password_must_change' => true])->save();
        Audit::record('platform.user_created', $user, ['role' => $data['role']], tenantId: null);

        return ApiResponse::ok(['user' => $user->toApi(), 'temporary_password' => $password], 201);
    }

    public function update(Request $request, string $user): JsonResponse
    {
        $target = $this->find($user);
        $data = $request->validate([
            'role' => ['sometimes', Rule::enum(PlatformRole::class)],
            'active' => ['sometimes', 'boolean'],
            'name' => ['sometimes', 'string', 'max:120'],
        ]);
        $self = $target->is($request->user());
        $demoting = isset($data['role']) && $data['role'] !== PlatformRole::Administrator->value;
        $deactivating = ($data['active'] ?? true) === false;
        if ($self && ($demoting || $deactivating)) {
            throw new ApiException('validation_failed', 'You cannot remove your own administrator access.', 422);
        }
        if ($target->role === PlatformRole::Administrator && ($demoting || $deactivating) && $this->otherActiveAdministrators($target) === 0) {
            throw new ApiException('validation_failed', 'There must always be at least one active administrator.', 422);
        }

        DB::transaction(function () use ($target, $data) {
            $target->fill([
                ...(isset($data['role']) ? ['role' => $data['role']] : []),
                ...(isset($data['name']) ? ['name' => $data['name']] : []),
                ...(array_key_exists('active', $data) ? ['deactivated_at' => $data['active'] ? null : now()] : []),
            ])->save();
            if (($data['active'] ?? true) === false) {
                $target->tokens()->delete();
            }
            Audit::record('platform.user_updated', $target, ['changed' => array_keys($data)], tenantId: null);
        });

        return ApiResponse::ok($target->refresh()->toApi());
    }

    public function resetPassword(Request $request, string $user): JsonResponse
    {
        $target = $this->find($user);
        $password = Str::password(14, symbols: false);
        DB::transaction(function () use ($target, $password) {
            $target->forceFill(['password' => $password, 'password_must_change' => true])->save();
            $target->tokens()->delete();
            Audit::record('platform.user_password_reset', $target, tenantId: null);
        });

        return ApiResponse::ok(['temporary_password' => $password]);
    }

    /** POST /platform/users/{user}/reset-two-factor — lost phone: they set up a new authenticator at their next sign-in. */
    public function resetTwoFactor(Request $request, string $user): JsonResponse
    {
        $target = $this->find($user);
        DB::transaction(function () use ($target) {
            $target->forceFill(['two_factor_secret' => null, 'two_factor_confirmed_at' => null, 'two_factor_last_step' => null])->save();
            $target->tokens()->delete();
            Audit::record('platform.user_two_factor_reset', $target, tenantId: null);
        });

        return ApiResponse::ok($target->refresh()->toApi());
    }

    private function otherActiveAdministrators(PlatformUser $except): int
    {
        return PlatformUser::where('role', PlatformRole::Administrator->value)->whereNull('deactivated_at')->whereKeyNot($except->id)->count();
    }

    private function find(string $id): PlatformUser
    {
        return (Str::isUuid($id) ? PlatformUser::find($id) : null) ?? throw new ApiException('not_found', 'No Inkgenius staff member by that id.', 404);
    }
}
