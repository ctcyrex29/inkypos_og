<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Emails are stored lower-case. Normalising before validation means the
 * "already taken" check sees the same value the database will hold, so
 * Owner@Shop.test cannot slip past it and fail on the unique index.
 */
final class EmailInput
{
    public static function normalise(Request $request, string $field): void
    {
        $value = $request->input($field);
        if (is_string($value)) {
            $request->merge([$field => mb_strtolower(trim($value))]);
        }
    }
}
