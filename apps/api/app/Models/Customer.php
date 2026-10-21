<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Someone a sale can be recorded against. Synced to tills (name and phone only). */
#[Fillable(['tenant_id', 'name', 'phone', 'email', 'notes', 'active', 'version'])]
class Customer extends Model
{
    use BelongsToTenant, HasUuids;

    protected static function booted(): void
    {
        static::saving(function (Customer $c) {
            $c->phone_digits = $c->phone === null ? null : (preg_replace('/\D/', '', $c->phone) ?: null);
        });
    }

    protected function casts(): array
    {
        return ['active' => 'boolean', 'version' => 'integer'];
    }
}
