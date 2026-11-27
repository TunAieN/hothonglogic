<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

class Customer extends Model
{
    protected $appends = ['orders_count', 'next_vip_tier_name', 'next_vip_threshold_vnd', 'vip_progress_percent'];

    protected $fillable = [
        'code',
        'name',
        'vip_group',
        'vip_tier_id',
        'vip_qualified_spend_vnd',
        'phone',
        'email',
        'province',
        'district',
        'ward',
        'address',
        'note',
        'status',
    ];

    public function getVipQualifiedSpendVndAttribute(mixed $value): int
    {
        return (int) ($value ?? 0);
    }

    public function getNextVipTierNameAttribute(): ?string
    {
        return $this->nextVipTier()?->name;
    }

    public function getNextVipThresholdVndAttribute(): ?int
    {
        return $this->nextVipTier()?->minimum_spend_vnd;
    }

    public function getVipProgressPercentAttribute(): int
    {
        if (! Schema::hasTable('vip_tiers')) return 0;
        $current = $this->vipTier;
        $next = $this->nextVipTier();
        if (! $current || ! $next) return $next ? 0 : 100;
        $band = max(1, (int) $next->minimum_spend_vnd - (int) $current->minimum_spend_vnd);

        return (int) min(100, max(0, round(((int) $this->vip_qualified_spend_vnd - (int) $current->minimum_spend_vnd) / $band * 100)));
    }

    private function nextVipTier(): ?VipTier
    {
        if (! Schema::hasTable('vip_tiers')) return null;
        $current = $this->vipTier;
        if (! $current) return null;

        return VipTier::query()->where('is_active', true)->where('priority', '>', $current->priority)->orderBy('priority')->first();
    }

    public function getOrdersCountAttribute(): int
    {
        if (array_key_exists('orders_count', $this->attributes) && $this->attributes['orders_count'] !== null) {
            return (int) $this->attributes['orders_count'];
        }

        return $this->orders()->count() ?? 0;
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    public function paymentVouchers()
    {
        return $this->hasMany(PaymentVoucher::class);
    }

    public function addresses()
    {
        return $this->hasMany(CustomerAddress::class);
    }

    public function deliveryRequests()
    {
        return $this->hasMany(DeliveryRequest::class);
    }

    public function balanceLedgers()
    {
        return $this->hasMany(CustomerBalanceLedger::class);
    }

    public function account()
    {
        return $this->hasOne(CustomerAccount::class);
    }

    public function vipTier()
    {
        return $this->belongsTo(VipTier::class);
    }

    public function vipSpendEvents()
    {
        return $this->hasMany(CustomerVipSpendEvent::class);
    }

    public function vipHistories()
    {
        return $this->hasMany(CustomerVipHistory::class)->latest();
    }

    public function scopeWithOrdersCount($query)
    {
        return $query->withCount('orders');
    }
}
