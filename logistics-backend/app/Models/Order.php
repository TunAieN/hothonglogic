<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $fillable = [
        'order_code',
        'customer_id',
        'note',
        'status',
        'total_amount', // Legacy CNY total kept for backwards compatibility. Use product_total_cny/product_total_vnd for new payment logic.
        'exchange_rate',
        'product_total_cny',
        'product_total_vnd',
        'currency', // Display currency for product snapshot fields only; total_amount is always legacy CNY.
        'exchange_rate_locked_at',
        'deposit_percent',
        'deposit_amount_vnd',
        'deposit_paid_amount_vnd',
        'deposit_remaining_amount_vnd',
        'deposit_status',
        'deposit_transfer_content',
        'deposit_requested_at',
        'deposit_paid_at',
        'deposit_confirmed_by',
        'deposit_manual_transaction_code',
        'deposit_note',
        'created_by',
        'account_manager_id',
    ];

    protected $casts = [
        'total_amount' => 'decimal:2',
        'exchange_rate' => 'decimal:4',
        'product_total_cny' => 'decimal:2',
        'product_total_vnd' => 'integer',
        'exchange_rate_locked_at' => 'datetime',
        'deposit_percent' => 'decimal:2',
        'deposit_amount_vnd' => 'integer',
        'deposit_paid_amount_vnd' => 'integer',
        'deposit_remaining_amount_vnd' => 'integer',
        'deposit_requested_at' => 'datetime',
        'deposit_paid_at' => 'datetime',
    ];

    public function items()
    {
        return $this->hasMany(OrderItem::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function accountManager()
    {
        return $this->belongsTo(User::class, 'account_manager_id');
    }

    public function cnPackages()
    {
        return $this->hasMany(CnPackage::class);
    }

    public function paymentVouchers()
    {
        return $this->hasMany(PaymentVoucher::class);
    }

    public function depositVoucher()
    {
        return $this->hasOne(PaymentVoucher::class)
            ->where('voucher_type', 'deposit')
            ->whereIn('status', [
                PaymentVoucher::STATUS_WAITING_PAYMENT,
                PaymentVoucher::STATUS_PARTIAL_PAID,
                PaymentVoucher::STATUS_PAID,
            ])
            ->whereNull('cancelled_at')
            ->latestOfMany();
    }

    public function invoices()
    {
        return $this->hasMany(Invoice::class);
    }

    public function orderTrackings()
    {
        return $this->hasMany(OrderTracking::class);
    }

    public function shippingTasks()
    {
        return $this->belongsToMany(ShippingTask::class, 'shipping_task_orders')
            ->withPivot(['package_count', 'total_weight', 'total_value'])
            ->withTimestamps();
    }
}
