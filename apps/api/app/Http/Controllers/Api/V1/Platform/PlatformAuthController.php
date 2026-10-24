<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Audit\Audit;
use App\Auth\Totp;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\PlatformUser;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Sign-in for Inkgenius Technologies staff (the platform portal): password plus
 * a code from an authenticator app. Someone with a temporary password, or
 * without an authenticator yet, gets a token that only reaches the "self"
 * routes below until they finish setting up (PlatformUser::setupPending).
 */
class PlatformAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'max:254'],
            'password' => ['required', 'string', 'max:200'],
            'code' => ['nullable', 'string', 'max:20'],
        ]);

        $user = PlatformUser::where('email', strtolower(trim($data['email'])))->first();
        // Equivalent hashing work for unknown emails, so timing does not reveal which exist.
        $valid = $user ? Hash::check($data['password'], $user->password) : (bool) Hash::make($data['password']) && false;
        if (! $user || ! $valid || ! $user->isActive()) {
            Audit::record('platform.login_failed', metadata: ['email' => strtolower(trim($data['email']))], tenantId: null);

            throw ApiException::unauthenticated('Invalid email or password.');
        }

        if ($user->hasTwoFactor()) {
            if (($data['code'] ?? '') === '') {
                throw new ApiException('two_factor_required', 'Enter the 6-digit code from your authenticator app.', 401);
            }
            $this->acceptCode($user, $data['code'], 'platform.login_failed');
        }

        $expires = now()->addMinutes((int) config('inkypos.tokens.platform_access_minutes'));
        $token = $user->createToken('platform', ['platform'], $expires);
        $user->forceFill(['last_login_at' => now()])->save();
        Audit::record('platform.login', $user, tenantId: null, actor: $user);

        return ApiResponse::ok(['user' => $user->toApi(), 'access_token' => $token->plainTextToken, 'access_expires_at' => $expires->toIso8601String()]);
    }

    public function me(Request $request): JsonResponse
    {
        return ApiResponse::ok($request->user()->toApi());
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return ApiResponse::ok(['revoked' => true]);
    }

    /** POST /platform/me/password — replaces a temporary password; other sessions are signed out. */
    public function changePassword(Request $request): JsonResponse
    {
        /** @var PlatformUser $user */
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['required', 'string', 'max:200'],
            'password' => ['required', 'string', 'min:12', 'max:200', 'different:current_password'],
        ]);
        if (! Hash::check($data['current_password'], $user->password)) {
            Audit::record('platform.password_change_failed', $user, tenantId: null, actor: $user);

            throw ValidationException::withMessages(['current_password' => ['Your current password is not right.']]);
        }

        DB::transaction(function () use ($user, $data) {
            $user->forceFill(['password' => $data['password'], 'password_must_change' => false])->save();
            $user->tokens()->whereKeyNot($user->currentAccessToken()->getKey())->delete();
            Audit::record('platform.password_changed', $user, tenantId: null, actor: $user);
        });

        return ApiResponse::ok($user->refresh()->toApi());
    }

    /**
     * POST /platform/me/two-factor — a new authenticator secret, shown as a QR code
     * and as text. Not in force until confirmed with a code from the app.
     */
    public function setupTwoFactor(Request $request): JsonResponse
    {
        /** @var PlatformUser $user */
        $user = $request->user();
        if ($user->hasTwoFactor()) {
            throw new ApiException('validation_failed', 'Authenticator codes are already on. An administrator can reset them if you lost your phone.', 422);
        }
        $secret = Totp::secret();
        $user->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => null, 'two_factor_last_step' => null])->save();

        return ApiResponse::ok(['secret' => $secret, 'otpauth_url' => Totp::uri($secret, $user->email)]);
    }

    /** POST /platform/me/two-factor/confirm {code} — turns authenticator codes on. */
    public function confirmTwoFactor(Request $request): JsonResponse
    {
        /** @var PlatformUser $user */
        $user = $request->user();
        $data = $request->validate(['code' => ['required', 'string', 'max:20']]);
        if ($user->hasTwoFactor()) {
            throw new ApiException('validation_failed', 'Authenticator codes are already on.', 422);
        }
        if ($user->two_factor_secret === null) {
            throw new ApiException('validation_failed', 'Start the authenticator set-up first.', 422);
        }

        $this->acceptCode($user, $data['code'], 'platform.two_factor_failed');
        DB::transaction(function () use ($user) {
            $user->forceFill(['two_factor_confirmed_at' => now()])->save();
            Audit::record('platform.two_factor_enabled', $user, tenantId: null, actor: $user);
        });

        return ApiResponse::ok($user->refresh()->toApi());
    }

    /** Checks a code and burns its time step, so the same code cannot be used twice. */
    private function acceptCode(PlatformUser $user, string $code, string $failedAction): void
    {
        $step = Totp::verify((string) $user->two_factor_secret, $code, $user->two_factor_last_step);
        if ($step === null) {
            Audit::record($failedAction, $user, ['reason' => 'two_factor_code'], tenantId: null, actor: $user);

            throw ValidationException::withMessages(['code' => ['That code is not right, or was already used. Wait for the next one.']]);
        }
        $user->forceFill(['two_factor_last_step' => $step])->save();
    }
}
