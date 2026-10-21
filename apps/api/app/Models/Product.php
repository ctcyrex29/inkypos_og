<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Prices are in the tenant's base currency, as integer minor units. */
#[Fillable(['tenant_id', 'sku', 'name', 'unit_price_minor', 'unit', 'tax_code', 'tax_rate_bp', 'tax_inclusive', 'active', 'version', 'category_id', 'cost_minor', 'reorder_level_milli', 'option_groups', 'track_stock'])]
class Product extends Model
{
    use BelongsToTenant, HasUuids;

    public const UNITS = ['each', 'kg', 'l'];

    protected function casts(): array
    {
        return [
            'unit_price_minor' => 'integer',
            'tax_rate_bp' => 'integer',
            'tax_inclusive' => 'boolean',
            'active' => 'boolean',
            'version' => 'integer',
            'cost_minor' => 'integer',
            'reorder_level_milli' => 'integer',
            'option_groups' => 'array',
            'track_stock' => 'boolean',
        ];
    }
}
