<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentVoucherSurcharge extends Model
{
    protected $fillable = [
        'payment_voucher_id',
        'payment_voucher_package_id',
        'vn_package_id',
        'surcharge_type',
        'amount',
        'note',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    public function voucher()
    {
        return $this->belongsTo(PaymentVoucher::class, 'payment_voucher_id');
    }
}
