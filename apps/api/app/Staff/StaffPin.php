<?php

namespace App\Staff;

use App\Support\Base64Url;

/**
 * Till sign-in PINs. Tills verify offline, so the hash must be reproducible in
 * pure JavaScript: PBKDF2-HMAC-SHA256 over the PIN's digits with a random
 * per-membership salt. Mirrored by packages/core/src/staff/pin.ts and checked
 * against the shared vectors in packages/core/test-vectors/staff-pin.v1.json.
 *
 * A 4–6 digit PIN has at most a million values, so the hash slows guessing
 * but cannot stop it for someone holding a till's database; the till's
 * lockout and the PIN being separate from the account password are what
 * matter. See docs/ARCHITECTURE.md §7.
 */
final class StaffPin
{
    public const ALGORITHM = 'pbkdf2-sha256';

    public const MIN_ITERATIONS = 10_000;

    public const MAX_ITERATIONS = 1_000_000;

    public const PATTERN = '/^\d{4,6}$/';

    /** @return array{pin_algorithm: string, pin_iterations: int, pin_salt: string, pin_hash: string} */
    public static function make(string $pin, ?int $iterations = null, ?string $salt = null): array
    {
        $iterations ??= (int) config('inkypos.staff_pin.iterations');
        $iterations = max(self::MIN_ITERATIONS, min(self::MAX_ITERATIONS, $iterations));
        $salt ??= random_bytes(16);

        return [
            'pin_algorithm' => self::ALGORITHM,
            'pin_iterations' => $iterations,
            'pin_salt' => Base64Url::encode($salt),
            'pin_hash' => Base64Url::encode(self::derive($pin, $salt, $iterations)),
        ];
    }

    public static function derive(string $pin, string $salt, int $iterations): string
    {
        return hash_pbkdf2('sha256', $pin, $salt, $iterations, 32, true);
    }

    /** Why a PIN is refused, or null when it is acceptable. */
    public static function weakness(string $pin): ?string
    {
        if (preg_match(self::PATTERN, $pin) !== 1) {
            return 'The PIN must be 4 to 6 digits.';
        }
        if (count(array_unique(str_split($pin))) === 1) {
            return 'The PIN cannot repeat one digit.';
        }
        if (str_contains('0123456789', $pin) || str_contains('9876543210', $pin)) {
            return 'The PIN cannot be a run of consecutive digits.';
        }

        return null;
    }
}
