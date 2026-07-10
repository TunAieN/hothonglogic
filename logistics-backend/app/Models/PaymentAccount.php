<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentAccount extends Model
{
    protected $fillable = [
        'bank_name',
        'bank_code',
        'account_number',
        'account_holder',
        'branch_name',
        'is_default',
        'is_active',
        'note',
    ];

    protected $casts = [
        'is_default' => 'bool',
        'is_active' => 'bool',
    ];
}
