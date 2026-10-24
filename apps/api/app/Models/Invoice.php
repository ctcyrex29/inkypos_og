<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Invoice extends Model
{
    protected $fillable = [
        'business_id',
        'invoice_number',
        'amount_minor',
        'currency',
        'status',
        'issued_at',
        'due_at',
        'paid_at',
        'sent_at',
        'description',
        'items',
        'metadata',
    ];

    protected $casts = [
        'items' => 'json',
        'metadata' => 'json',
        'issued_at' => 'datetime',
        'due_at' => 'datetime',
        'paid_at' => 'datetime',
        'sent_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function business(): BelongsTo
    {
        return $this->belongsTo(Business::class);
    }
}
