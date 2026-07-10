<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    protected $fillable = [
        'payment_voucher_id',
        'invoice_code',
        'customer_id',
        'created_by',
        'confirmed_by',
        'confirmed_at',
        'issued_by',
        'issued_at',
        'total_amount',
        'paid_amount',
        'status',
        'note',
    ];

    protected $casts = [
        'confirmed_at' => 'datetime',
        'issued_at' => 'datetime',
        'total_amount' => 'float',
        'paid_amount' => 'float',
    ];

    public function voucher()
    {
        return $this->belongsTo(PaymentVoucher::class, 'payment_voucher_id');
    }

    public function items()
    {
        return $this->hasMany(InvoiceItem::class);
    }
}
