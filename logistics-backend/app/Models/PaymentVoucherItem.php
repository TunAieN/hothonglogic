<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentVoucherItem extends Model
{
    protected $fillable = ['payment_voucher_id', 'item_type', 'description', 'quantity', 'unit_price', 'amount', 'reference_type', 'reference_id', 'metadata'];

    protected $casts = ['quantity' => 'float', 'unit_price' => 'float', 'amount' => 'float', 'metadata' => 'array'];

    public function voucher()
    {
        return $this->belongsTo(PaymentVoucher::class, 'payment_voucher_id');
    }
}
