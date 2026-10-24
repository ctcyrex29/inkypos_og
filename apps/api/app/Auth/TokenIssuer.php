<?php

namespace App\Auth;

use App\Audit\Audit;
use App\Http\ApiException;
use App\Models\RefreshToken;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Short-lived Sanctum access tokens plus rotating refresh tokens.
 *
 * Each refresh token is single-use. Presenting one that was already used means
 * it was copied, so the whole family (every token descended from that login)
 * is revoked and the user must sign in again.
 */
final class TokenIssuer
{
    /** @return array{access_token: string, access_expires_at: string, refresh_token: string, refresh_expires_at: string} */
    public function issue(User $user, string $deviceName, ?string $familyId = null): array
    {
        $accessExpires = now()->addMinutes((int) config('inkypos.tokens.user_access_minutes'));
        $access = $user->createToken('user:'.$deviceName, ['user'], $accessExpires);

        $secret = Str::random(64);
        $refresh = RefreshToken::create([
            'user_id' => $user->id,
            'family_id' => $familyId ?? (string) Str::uuid7(),
            'token_hash' => hash('sha256', $secret),
            'access_token_id' => $access->accessToken->getKey(),
            'device_name' => $deviceName,
            'expires_at' => now()->addDays((int) config('inkypos.tokens.refresh_days')),
        ]);

        return [
            'access_token' => $access->plainTextToken,
            'access_expires_at' => $accessExpires->toIso8601String(),
            'refresh_token' => $refresh->id.'.'.$secret,
            'refresh_expires_at' => $refresh->expires_at->toIso8601String(),
        ];
    }

    /** @return array{access_token: string, access_expires_at: string, refresh_token: string, refresh_expires_at: string} */
    public function refresh(string $presented): array
    {
        [$id, $secret] = array_pad(explode('.', $presented, 2), 2, '');
        $token = Str::isUuid($id) ? RefreshToken::with('user')->find($id) : null;

        if (! $token || ! hash_equals($token->token_hash, hash('sha256', $secret))) {
            throw ApiException::unauthenticated('Invalid refresh token.');
        }

        if ($token->revoked_at !== null) {
            throw ApiException::unauthenticated('Refresh token revoked; please sign in again.');
        }
        if ($token->expires_at->isPast()) {
            throw ApiException::unauthenticated('Refresh token expired.');
        }

        // Claim atomically so two concurrent refreshes cannot both succeed.
        $claimed = RefreshToken::whereKey($token->id)
            ->whereNull('used_at')->whereNull('revoked_at')
            ->update(['used_at' => now()]);

        if ($claimed === 0) {
            // Not inside a transaction: the revocation must survive the exception below.
            $this->revokeFamily($token->family_id);
            Audit::record('auth.refresh_token_reused', $token->user, ['family_id' => $token->family_id], actor: $token->user);

            throw ApiException::unauthenticated('Refresh token already used; please sign in again.');
        }

        return DB::transaction(function () use ($token) {
            PersonalAccessToken::whereKey($token->access_token_id)->delete();

            return $this->issue($token->user, $token->device_name, $token->family_id);
        });
    }

    public function revokeFamily(string $familyId): void
    {
        $tokens = RefreshToken::where('family_id', $familyId);
        PersonalAccessToken::whereIn('id', (clone $tokens)->whereNotNull('access_token_id')->pluck('access_token_id'))->delete();
        $tokens->whereNull('revoked_at')->update(['revoked_at' => now()]);
    }

    /** Signs the user out everywhere except the session that holds $keep (after a password change). */
    public function revokeOtherSessions(User $user, PersonalAccessToken $keep): void
    {
        $keepFamily = RefreshToken::where('access_token_id', $keep->getKey())->value('family_id');
        RefreshToken::where('user_id', $user->id)->when($keepFamily, fn ($q) => $q->where('family_id', '!=', $keepFamily))
            ->distinct()->pluck('family_id')->each(fn (string $family) => $this->revokeFamily($family));
        $user->tokens()->whereKeyNot($keep->getKey())->delete();
    }

    public function revokeForAccessToken(PersonalAccessToken $accessToken): void
    {
        $familyId = RefreshToken::where('access_token_id', $accessToken->getKey())->value('family_id');
        if ($familyId) {
            $this->revokeFamily($familyId);
        }
        $accessToken->delete();
    }
}
