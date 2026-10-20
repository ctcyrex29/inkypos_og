<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** One independent business. */
#[Fillable(['name', 'status', 'base_currency', 'rounding', 'tax_rounding'])]
class Tenant extends Model
{
    use HasFactory, HasUuids;

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /** @return HasOne<Subscription, $this> */
    public function subscription(): HasOne
    {
        return $this->hasOne(Subscription::class);
    }
}
