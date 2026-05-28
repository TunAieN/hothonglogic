<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderTrackingItem extends Model
{
    protected $fillable = [
        'order_tracking_id',
        'order_item_id',
        'quantity',
    ];

    public function orderTracking()
    {
        return $this->belongsTo(OrderTracking::class);
    }

    public function orderItem()
    {
        return $this->belongsTo(OrderItem::class);
    }
}
