<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
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
        'status'
    ];

    public function getOrdersCountAttribute(): int
    {
        if (array_key_exists('orders_count', $this->attributes) && $this->attributes['orders_count'] !== null) {
            return (int) $this->attributes['orders_count'];
        }

        return $this->orders()->count() ?? 0;
    }

    function orders()
    {
        return $this->hasMany(Order::class);
    }
      public function scopeWithOrdersCount($query)
    {
        return $query->withCount('orders');
    }
}
    
