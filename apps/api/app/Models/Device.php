<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\HasApiTokens;

/**
 * A registered till. Authenticates with an Ed25519 key that never leaves the
 * device. Not tenant-scoped by trait because it is resolved during
 * authentication; controllers always constrain it by the context tenant.
 *
 * @property Carbon $created_at
 * @property Carbon|null $last_seen_at
 * @property Carbon|null $revoked_at
 */
#[Fillable(['tenant_id', 'branch_id', 'register_id', 'name', 'platform', 'public_key', 'registered_by_user_id'])]
#[Hidden(['public_key'])]
class Device extends Model
{
    use HasApiTokens, HasFactory, HasUuids;

    protected function casts(): array
    {
        return ['last_seen_at' => 'datetime', 'revoked_at' => 'datetime'];
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    /** @return BelongsTo<Tenant, $this> */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** @return array<string, string|null> */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'branch_id' => $this->branch_id,
            'register_id' => $this->register_id,
            'name' => $this->name,
            'platform' => $this->platform,
            'registered_at' => $this->created_at->toIso8601String(),
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'revoked_at' => $this->revoked_at?->toIso8601String(),
        ];
    }
}
