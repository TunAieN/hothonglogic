<?php

namespace App\Models;

use App\Domain\Payments\Enums\PaymentVoucherStatus;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

class PaymentVoucher extends Model
{
    public const STATUS_DRAFT = PaymentVoucherStatus::DRAFT->value;

    public const STATUS_WAITING_PAYMENT = PaymentVoucherStatus::WAITING_PAYMENT->value;

    public const STATUS_PARTIAL_PAID = PaymentVoucherStatus::PARTIAL_PAID->value;

    public const STATUS_PAID = PaymentVoucherStatus::PAID->value;

    public const STATUS_CANCELLED = PaymentVoucherStatus::CANCELLED->value;

    public const ACTIVE_STATUSES = [
        PaymentVoucherStatus::DRAFT->value,
        PaymentVoucherStatus::WAITING_PAYMENT->value,
        PaymentVoucherStatus::PARTIAL_PAID->value,
    ];

    protected $fillable = [
        'voucher_code',
        'request_uuid',
        'voucher_type',
        'customer_id',
        'order_id',
        'vn_warehouse_id',
        'created_by',
        'payment_method_expected',
        'payment_account_id',
        'bank_name_snapshot',
        'bank_code_snapshot',
        'bank_account_number_snapshot',
        'bank_account_holder_snapshot',
        'bank_branch_name_snapshot',
        'exchange_rate',
        'currency',
        'transfer_content',
        'status',
        'subtotal',
        'discount_amount',
        'total_amount',
        'paid_amount',
        'note',
        'cancelled_reason',
        'cancelled_by',
        'cancelled_at',
        'expires_at',
    ];

    protected $casts = [
        'exchange_rate' => 'decimal:4',
        'total_amount' => 'float',
        'paid_amount' => 'float',
        'subtotal' => 'float',
        'discount_amount' => 'float',
        'cancelled_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function getBaseAmountCnyAttribute(mixed $legacyValue): float
    {
        $metadataValue = $this->compatibilityMetadataValue('amount_cny');

        return (float) ($metadataValue ?? $legacyValue ?? 0);
    }

    public function getBaseAmountVndAttribute(mixed $legacyValue): int
    {
        $items = $this->compatibilityItems();
        $orderAmount = $items->where('item_type', 'order_amount')->sum('amount');
        $metadataValue = $this->compatibilityMetadataValue('base_amount_vnd');

        return (int) round((float) ($orderAmount ?: $metadataValue ?? $legacyValue ?? 0));
    }

    public function getDepositPercentAttribute(mixed $legacyValue): ?float
    {
        $value = $this->compatibilityMetadataValue('deposit_percent') ?? $legacyValue;

        return $value === null ? null : (float) $value;
    }

    public function getDepositAppliedAttribute(mixed $legacyValue): float
    {
        return $this->adjustmentAmount(PaymentVoucherItem::TYPE_DEPOSIT_APPLIED, $legacyValue);
    }

    public function getCustomerCreditAppliedAttribute(mixed $legacyValue): float
    {
        return $this->adjustmentAmount(PaymentVoucherItem::TYPE_CUSTOMER_CREDIT, $legacyValue);
    }

    public function getRemainingAmountAttribute(mixed $legacyValue): float
    {
        return (float) max(0, (int) round((float) $this->total_amount) - (int) round((float) $this->paid_amount));
    }

    public function getPaymentMethodAttribute(mixed $legacyValue): ?string
    {
        $transaction = $this->confirmedTransactionsForCompatibility()->sortByDesc('id')->first();

        return $transaction?->payment_method ?? $legacyValue ?? $this->payment_method_expected;
    }

    public function getPaidAtAttribute(mixed $legacyValue): mixed
    {
        if ($this->status !== self::STATUS_PAID) {
            return null;
        }

        return $this->confirmedTransactionsForCompatibility()->max('received_at') ?? $legacyValue;
    }

    public function componentSubtotal(): int
    {
        return (int) round((float) $this->compatibilityItems()
            ->reject(fn (PaymentVoucherItem $item) => in_array($item->item_type, PaymentVoucherItem::ADJUSTMENT_TYPES, true))
            ->sum('amount'));
    }

    public function itemDiscountTotal(): int
    {
        return (int) round(abs((float) $this->compatibilityItems()
            ->whereIn('item_type', PaymentVoucherItem::ADJUSTMENT_TYPES)
            ->sum('amount')));
    }

    private function adjustmentAmount(string $type, mixed $legacyValue): float
    {
        $items = $this->compatibilityItems()->where('item_type', $type);
        if ($items->isEmpty()) {
            return (float) round((float) ($legacyValue ?? 0));
        }

        return (float) round(abs((float) $items->sum('amount')));
    }

    private function compatibilityMetadataValue(string $key): mixed
    {
        foreach ($this->compatibilityItems() as $item) {
            $metadata = is_array($item->metadata) ? $item->metadata : [];
            if (array_key_exists($key, $metadata)) {
                return $metadata[$key];
            }
        }

        return null;
    }

    private function compatibilityItems(): Collection
    {
        return $this->relationLoaded('items') ? $this->items : $this->items()->get();
    }

    private function confirmedTransactionsForCompatibility(): Collection
    {
        $transactions = $this->relationLoaded('transactions') ? $this->transactions : $this->transactions()->get();

        return $transactions->where('status', PaymentTransaction::STATUS_CONFIRMED);
    }

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

    public function items()
    {
        return $this->hasMany(PaymentVoucherItem::class);
    }

    public function deliveryRequest()
    {
        return $this->hasOne(DeliveryRequest::class);
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
