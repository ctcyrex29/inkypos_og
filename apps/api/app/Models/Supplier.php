<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Back office only; tills never receive suppliers. */
#[Fillable(['tenant_id', 'name', 'contact_person', 'phone', 'email', 'address', 'active'])]
class Supplier extends Model
{
    use BelongsToTenant, HasUuids;

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }
}
