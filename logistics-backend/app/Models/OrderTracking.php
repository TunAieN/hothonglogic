<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderTracking extends Model
{
    protected $fillable = [
        'order_id',
        'tracking_number',
        'carrier',
        'declared_value',
        'dispatched_at',
        'note',
        'status',
    ];

    protected $casts = [
        'declared_value' => 'float',
        'dispatched_at' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function trackingItems()
    {
        return $this->hasMany(OrderTrackingItem::class, 'order_tracking_id');
    }

    public function packages()
    {
        return $this->hasMany(CnPackage::class, 'order_tracking_id');
    }
}
