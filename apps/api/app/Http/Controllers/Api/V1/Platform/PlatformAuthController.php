<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Audit\Audit;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\PlatformUser;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/** Sign-in for Inkgenius Technologies staff (the platform portal). */
class PlatformAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'max:254'],
            'password' => ['required', 'string', 'max:200'],
        ]);

        $user = PlatformUser::where('email', strtolower($data['email']))->first();
        // Equivalent hashing work for unknown emails, so timing does not reveal which exist.
        $valid = $user ? Hash::check($data['password'], $user->password) : (bool) Hash::make($data['password']) && false;
        if (! $user || ! $valid || ! $user->isActive()) {
            Audit::record('platform.login_failed', metadata: ['email' => strtolower($data['email'])], tenantId: null);

            throw ApiException::unauthenticated('Invalid email or password.');
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
}
