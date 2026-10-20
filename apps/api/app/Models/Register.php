<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** A till position in a branch. At most one active (non-revoked) device at a time. */
#[Fillable(['tenant_id', 'branch_id', 'name', 'code'])]
class Register extends Model
{
    use BelongsToTenant, HasFactory, HasUuids;

    /** @return BelongsTo<Branch, $this> */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /** @return HasOne<Device, $this> */
    public function activeDevice(): HasOne
    {
        return $this->hasOne(Device::class)->whereNull('revoked_at');
    }

    /** @return array{id: string, branch_id: string, name: string, code: string, active_device_id: string|null} */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'branch_id' => $this->branch_id,
            'name' => $this->name,
            'code' => $this->code,
            'active_device_id' => $this->activeDevice?->id,
        ];
    }
}
