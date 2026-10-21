<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** A product grouping shown on the till for browsing. */
#[Fillable(['tenant_id', 'name', 'position', 'active', 'version'])]
class Category extends Model
{
    use BelongsToTenant, HasUuids;

    protected function casts(): array
    {
        return ['position' => 'integer', 'active' => 'boolean', 'version' => 'integer'];
    }
}
