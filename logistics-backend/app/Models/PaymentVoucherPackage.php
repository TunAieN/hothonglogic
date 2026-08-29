<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentVoucherPackage extends Model
{
    protected $fillable = [
        'payment_voucher_id',
        'vn_package_id',
        'order_id',
        'actual_weight',
        'volumetric_weight',
        'chargeable_weight',
        'price_per_kg',
        'shipping_rate_id',
        'shipping_rate_detail_id',
        'unit_price',
        'price_type',
        'rate_description',
        'shipping_fee',
        'total_amount',
    ];

    protected $casts = [
        'actual_weight' => 'float',
        'volumetric_weight' => 'float',
        'chargeable_weight' => 'float',
        'price_per_kg' => 'float',
        'unit_price' => 'float',
        'shipping_fee' => 'float',
        'total_amount' => 'float',
    ];

    protected static function booted(): void
    {
        static::saving(function (PaymentVoucherPackage $package) {
            $package->normalizeAmountFields();
        });
    }

    public function normalizeAmountFields(): void
    {
        $priceType = in_array($this->price_type, ['per_kg', 'fixed'], true) ? $this->price_type : 'per_kg';
        $unitPrice = (float) ($this->unit_price ?: $this->price_per_kg ?: 0);
        $chargeableWeight = (float) ($this->chargeable_weight ?? 0);
        $shippingFee = $priceType === 'fixed' ? $unitPrice : $chargeableWeight * $unitPrice;

        $this->price_type = $priceType;
        $this->unit_price = round($unitPrice, 0);
        $this->price_per_kg = round($unitPrice, 0);
        $this->shipping_fee = round($shippingFee, 0);
        $this->total_amount = round($shippingFee, 0);
    }

    public function voucher()
    {
        return $this->belongsTo(PaymentVoucher::class, 'payment_voucher_id');
    }

    public function shippingRate()
    {
        return $this->belongsTo(ShippingRate::class, 'shipping_rate_id');
    }

    public function shippingRateDetail()
    {
        return $this->belongsTo(ShippingRateDetail::class, 'shipping_rate_detail_id');
    }

    public function vnPackage()
    {
        return $this->belongsTo(VnPackage::class, 'vn_package_id');
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
