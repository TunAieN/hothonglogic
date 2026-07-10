<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerBalanceLedger extends Model
{
    protected $fillable = [
        'customer_id',
        'payment_voucher_id',
        'transaction_id',
        'type',
        'amount',
        'balance_after',
        'description',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'float',
        'balance_after' => 'float',
    ];
}
