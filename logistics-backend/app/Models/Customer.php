<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $appends = ['orders_count'];

    protected $fillable = [
        'code',
        'name',
        'vip_group',
        'phone',
        'email',
        'province',
        'district',
        'ward',
        'address',
        'note',
        'status',
    ];

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

    public function scopeWithOrdersCount($query)
    {
        return $query->withCount('orders');
    }
}
