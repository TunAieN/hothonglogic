<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentVoucherItem extends Model
{
    public const TYPE_DEPOSIT_APPLIED = 'deposit_applied';

    public const TYPE_CUSTOMER_CREDIT = 'customer_credit';

    public const ADJUSTMENT_TYPES = [self::TYPE_DEPOSIT_APPLIED, self::TYPE_CUSTOMER_CREDIT];

    protected $fillable = ['payment_voucher_id', 'item_type', 'description', 'quantity', 'unit_price', 'amount', 'reference_type', 'reference_id', 'metadata'];

    protected $casts = ['quantity' => 'float', 'unit_price' => 'float', 'amount' => 'float', 'metadata' => 'array'];

    public function voucher()
    {
        return $this->belongsTo(PaymentVoucher::class, 'payment_voucher_id');
    }
}
