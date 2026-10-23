<?php

namespace App\Models;

use App\Platform\PlatformPermission;
use App\Platform\PlatformRole;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * A member of Inkgenius Technologies staff. Not a business user: signs in to
 * the platform portal only, with tokens that tenant routes refuse.
 */
#[Fillable(['name', 'email', 'password', 'role', 'deactivated_at', 'last_login_at'])]
#[Hidden(['password'])]
class PlatformUser extends Authenticatable
{
    use HasApiTokens, HasUuids;

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'role' => PlatformRole::class,
            'deactivated_at' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }

    public function isActive(): bool
    {
        return $this->deactivated_at === null;
    }

    public function allows(PlatformPermission $permission): bool
    {
        return $this->isActive() && $this->role->can($permission);
    }

    /** @return array<string, mixed> */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'active' => $this->isActive(),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'permissions' => array_values(array_map(fn (PlatformPermission $p) => $p->value, array_filter(PlatformPermission::cases(), fn ($p) => $this->role->can($p)))),
        ];
    }
}
