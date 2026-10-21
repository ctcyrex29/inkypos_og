<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Goods received from a supplier. Immutable once recorded. */
#[Fillable(['tenant_id', 'branch_id', 'supplier_id', 'reference', 'received_at', 'total_cost_minor', 'notes', 'recorded_by_user_id'])]
class Purchase extends Model
{
    use BelongsToTenant, HasUuids;

    protected function casts(): array
    {
        return ['received_at' => 'datetime', 'total_cost_minor' => 'integer'];
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }
}
