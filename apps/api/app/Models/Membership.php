<?php

namespace App\Models;

use App\Auth\Permission;
use App\Auth\Role;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['tenant_id', 'user_id', 'role', 'pin_algorithm', 'pin_iterations', 'pin_salt', 'pin_hash', 'pin_set_at', 'deactivated_at', 'version'])]
#[Hidden(['pin_salt', 'pin_hash'])]
class Membership extends Model
{
    use HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'role' => Role::class,
            'pin_iterations' => 'integer',
            'pin_set_at' => 'datetime',
            'deactivated_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function can(Permission $permission): bool
    {
        return $this->role->can($permission);
    }

    public function isActive(): bool
    {
        return $this->deactivated_at === null;
    }

    public function hasPin(): bool
    {
        return $this->pin_hash !== null;
    }

    /** @return BelongsTo<Tenant, $this> */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
