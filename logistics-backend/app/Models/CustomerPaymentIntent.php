<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerPaymentIntent extends Model
{
    protected $fillable = [
        'customer_id', 'payment_voucher_id', 'payment_account_id', 'payment_transaction_id',
        'ledger_id', 'type', 'provider', 'reference', 'amount_vnd', 'idempotency_key',
        'status', 'expires_at', 'completed_at', 'metadata',
    ];

    protected $casts = [
        'amount_vnd' => 'integer', 'expires_at' => 'datetime', 'completed_at' => 'datetime', 'metadata' => 'array',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function voucher()
    {
        return $this->belongsTo(PaymentVoucher::class, 'payment_voucher_id');
    }

    public function paymentAccount()
    {
        return $this->belongsTo(PaymentAccount::class);
    }

    public function transaction()
    {
        return $this->belongsTo(PaymentTransaction::class, 'payment_transaction_id');
    }

    public function ledger()
    {
        return $this->belongsTo(CustomerBalanceLedger::class, 'ledger_id');
    }
}
