<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    protected $fillable = [
        'payment_voucher_id',
        'invoice_type',
        'order_id',
        'payment_transaction_id',
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

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function paymentTransaction()
    {
        return $this->belongsTo(PaymentTransaction::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function confirmer()
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function issuer()
    {
        return $this->belongsTo(User::class, 'issued_by');
    }

    public function items()
    {
        return $this->hasMany(InvoiceItem::class);
    }
}
