<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Sale-currency units per one unit of the quote currency. Append-only: a new
 * rate is a new version, so every sale can name the exact rate it used.
 *
 * @property Carbon $effective_at
 */
#[Fillable(['tenant_id', 'base_currency', 'quote_currency', 'rate', 'version', 'effective_at', 'set_by_user_id'])]
class ExchangeRate extends Model
{
    use BelongsToTenant, HasUuids;

    protected function casts(): array
    {
        return ['version' => 'integer', 'effective_at' => 'datetime'];
    }
}
