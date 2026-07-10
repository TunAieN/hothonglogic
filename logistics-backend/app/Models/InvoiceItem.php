<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoiceItem extends Model
{
    protected $fillable = [
        'invoice_id',
        'vn_package_id',
        'weight',
        'volume',
        'shipping_fee',
        'payment_voucher_package_id',
        'item_type',
        'description',
        'quantity',
        'unit_price',
        'amount',
        'metadata',
    ];

    protected $casts = [
        'weight' => 'float',
        'volume' => 'float',
        'shipping_fee' => 'float',
        'quantity' => 'float',
        'unit_price' => 'float',
        'amount' => 'float',
        'metadata' => 'array',
    ];
}
