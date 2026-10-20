<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * A tender type the business accepts. Recording a payment never implies it
 * was processed: methods that need outside confirmation start as
 * pending_confirmation.
 */
#[Fillable(['tenant_id', 'code', 'name', 'kind', 'currencies', 'initial_status', 'requires_reference', 'gives_change', 'active', 'position', 'version'])]
class PaymentMethod extends Model
{
    use BelongsToTenant, HasUuids;

    public const KINDS = ['cash', 'mobile_money', 'card', 'transfer'];

    protected function casts(): array
    {
        return [
            'currencies' => 'array',
            'requires_reference' => 'boolean',
            'gives_change' => 'boolean',
            'active' => 'boolean',
            'position' => 'integer',
            'version' => 'integer',
        ];
    }
}
