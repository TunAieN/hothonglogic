<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExchangeRate extends Model
{
    protected $fillable = [
        'from_currency',
        'to_currency',
        'rate',
        'effective_from',
        'effective_to',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'rate' => 'decimal:4',
        'effective_from' => 'datetime',
        'effective_to' => 'datetime',
        'is_active' => 'boolean',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
