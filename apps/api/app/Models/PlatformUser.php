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
#[Hidden(['password', 'two_factor_secret'])]
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
            'password_must_change' => 'boolean',
            'two_factor_secret' => 'encrypted',
            'two_factor_confirmed_at' => 'datetime',
            'two_factor_last_step' => 'integer',
        ];
    }

    public function isActive(): bool
    {
        return $this->deactivated_at === null;
    }

    public function hasTwoFactor(): bool
    {
        return $this->two_factor_confirmed_at !== null && $this->two_factor_secret !== null;
    }

    /** Signed in, but must set a new password or turn on authenticator codes before doing anything else. */
    public function setupPending(): ?string
    {
        return match (true) {
            (bool) $this->password_must_change => 'password_change_required',
            config('inkypos.platform.require_two_factor') && ! $this->hasTwoFactor() => 'two_factor_setup_required',
            default => null,
        };
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
            'two_factor_enabled' => $this->hasTwoFactor(),
            // password_change_required | two_factor_setup_required | null
            'setup_required' => $this->setupPending(),
            'permissions' => array_values(array_map(fn (PlatformPermission $p) => $p->value, array_filter(PlatformPermission::cases(), fn ($p) => $this->role->can($p)))),
        ];
    }
}
