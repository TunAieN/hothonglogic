<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerNotification extends Model
{
    protected $fillable = [
        'customer_id', 'order_id', 'payment_voucher_id', 'sent_by', 'type', 'channel',
        'status', 'title', 'body', 'action_url', 'idempotency_key', 'sent_at', 'read_at',
        'failure_code', 'failure_message', 'metadata',
    ];

    protected $casts = [
        'sent_at' => 'datetime', 'read_at' => 'datetime', 'metadata' => 'array',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function voucher()
    {
        return $this->belongsTo(PaymentVoucher::class, 'payment_voucher_id');
    }

    public function sender()
    {
        return $this->belongsTo(User::class, 'sent_by');
    }
}
