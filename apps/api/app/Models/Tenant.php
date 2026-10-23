<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * One independent business: a shop, a restaurant, or both. Its status is set
 * by Inkgenius Technologies: pending (signed up, waiting), active, suspended.
 */
#[Fillable(['name', 'status', 'base_currency', 'rounding', 'tax_rounding', 'timezone', 'business_type', 'status_reason'])]
class Tenant extends Model
{
    use HasFactory, HasUuids;

    public const STATUSES = ['pending', 'active', 'suspended'];

    public const BUSINESS_TYPES = ['retail', 'restaurant', 'both'];

    protected function casts(): array
    {
        return ['activated_at' => 'datetime'];
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    /** @return HasOne<Subscription, $this> */
    public function subscription(): HasOne
    {
        return $this->hasOne(Subscription::class);
    }
}
