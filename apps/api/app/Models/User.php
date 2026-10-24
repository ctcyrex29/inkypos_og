<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/** A person. Identity is global; access to a business is through a Membership. */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasUuids, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'password_must_change' => 'boolean',
        ];
    }

    /** @return HasMany<Membership, $this> */
    public function memberships(): HasMany
    {
        return $this->hasMany(Membership::class);
    }

    /** @return array{id: string, name: string, email: string, must_change_password: bool} */
    public function toApi(): array
    {
        // must_change_password: signed in with a temporary password; the business is closed until it is replaced.
        return ['id' => $this->id, 'name' => $this->name, 'email' => $this->email, 'must_change_password' => (bool) $this->password_must_change];
    }

    /** @return list<array{tenant_id: string, tenant_name: string, role: string}> */
    public function membershipsForApi(): array
    {
        return $this->memberships()->with('tenant')->get()
            ->map(fn (Membership $m) => [
                'tenant_id' => $m->tenant_id,
                'tenant_name' => $m->tenant->name,
                // pending: waiting for Inkgenius Technologies to activate it; suspended: switched off.
                'tenant_status' => $m->tenant->status,
                'business_type' => $m->tenant->business_type ?? 'retail',
                'role' => $m->role->value,
                'active' => $m->isActive(),
            ])->values()->all();
    }
}
