<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentTransaction extends Model
{
    public const STATUS_CONFIRMED = 'confirmed';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'transaction_code',
        'payment_voucher_id',
        'amount',
        'payment_method',
        'bank_name',
        'bank_transaction_code',
        'received_at',
        'confirmed_by',
        'status',
        'note',
        'proof_image_path',
    ];

    protected $casts = [
        'amount' => 'float',
        'received_at' => 'datetime',
    ];

    public function voucher()
    {
        return $this->belongsTo(PaymentVoucher::class, 'payment_voucher_id');
    }

    public function invoice()
    {
        return $this->hasOne(Invoice::class);
    }
}
