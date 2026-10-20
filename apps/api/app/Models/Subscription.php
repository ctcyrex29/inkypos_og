<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property Carbon $current_period_ends_at
 */
#[Fillable(['tenant_id', 'plan_id', 'status', 'current_period_ends_at'])]
class Subscription extends Model
{
    use BelongsToTenant, HasFactory, HasUuids;

    /** Statuses in which the business may trade. `past_due` trades with a warning. */
    public const ENTITLED = ['trialing', 'active', 'past_due'];

    protected function casts(): array
    {
        return ['current_period_ends_at' => 'datetime'];
    }

    /** @return BelongsTo<Plan, $this> */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function isEntitled(?Carbon $at = null): bool
    {
        return in_array($this->status, self::ENTITLED, true)
            && $this->current_period_ends_at->isAfter($at ?? now());
    }
}
