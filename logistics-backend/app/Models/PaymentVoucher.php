<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentVoucher extends Model
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_WAITING_PAYMENT = 'waiting_payment';
    public const STATUS_PARTIAL_PAID = 'partial_paid';
    public const STATUS_PAID = 'paid';
    public const STATUS_CANCELLED = 'cancelled';

    public const ACTIVE_STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_WAITING_PAYMENT,
        self::STATUS_PARTIAL_PAID,
    ];

    protected $fillable = [
        'voucher_code',
        'request_uuid',
        'voucher_type',
        'customer_id',
        'order_id',
        'vn_warehouse_id',
        'created_by',
        'receiver_type',
        'delivery_address',
        'payment_method_expected',
        'payment_account_id',
        'bank_name_snapshot',
        'bank_code_snapshot',
        'bank_account_number_snapshot',
        'bank_account_holder_snapshot',
        'bank_branch_name_snapshot',
        'base_amount_cny',
        'exchange_rate',
        'base_amount_vnd',
        'deposit_percent',
        'currency',
        'transfer_content',
        'status',
        'shipping_fee_total',
        'domestic_shipping_fee',
        'surcharge_total',
        'total_amount',
        'deposit_applied',
        'customer_credit_applied',
        'paid_amount',
        'remaining_amount',
        'note',
        'cancelled_reason',
        'cancelled_by',
        'cancelled_at',
        'expires_at',
    ];

    protected $casts = [
        'base_amount_cny' => 'float',
        'exchange_rate' => 'float',
        'base_amount_vnd' => 'integer',
        'deposit_percent' => 'float',
        'shipping_fee_total' => 'float',
        'domestic_shipping_fee' => 'float',
        'surcharge_total' => 'float',
        'total_amount' => 'float',
        'deposit_applied' => 'float',
        'customer_credit_applied' => 'float',
        'paid_amount' => 'float',
        'remaining_amount' => 'float',
        'cancelled_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function warehouse()
    {
        return $this->belongsTo(VnWarehouse::class, 'vn_warehouse_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function paymentAccount()
    {
        return $this->belongsTo(PaymentAccount::class, 'payment_account_id');
    }

    public function packages()
    {
        return $this->hasMany(PaymentVoucherPackage::class);
    }

    public function surcharges()
    {
        return $this->hasMany(PaymentVoucherSurcharge::class);
    }

    public function transactions()
    {
        return $this->hasMany(PaymentTransaction::class);
    }

    public function invoice()
    {
        return $this->hasOne(Invoice::class);
    }
}
