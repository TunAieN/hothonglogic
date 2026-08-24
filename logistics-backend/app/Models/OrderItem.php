<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    protected $fillable = [
        'order_id',
        'product_name',
        'product_link',
        'price_cny',
        'exchange_rate',
        'unit_price_vnd',
        'quantity',
        'subtotal_cny',
        'subtotal_vnd',
        'note',
        'product_image',
        'seller',
        'shop_id',
        'shop_name',
        'size',
        'color',
    ];

    protected $casts = [
        'price_cny' => 'decimal:2',
        'exchange_rate' => 'decimal:4',
        'unit_price_vnd' => 'integer',
        'quantity' => 'integer',
        'subtotal_cny' => 'decimal:2',
        'subtotal_vnd' => 'integer',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function packageItems()
    {
        return $this->hasMany(CnPackageItem::class);
    }

    public function trackingItems()
    {
        return $this->hasMany(OrderTrackingItem::class);
    }
}
