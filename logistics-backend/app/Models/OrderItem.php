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
        'quantity',
        'note',
        'product_image'
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
