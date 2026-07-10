<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShippingRateDetail extends Model
{
    protected $fillable = [
        'rate_id',
        'shipping_rate_id',
        'weight_from',
        'weight_to',
        'min_weight',
        'max_weight',
        'price_per_kg',
        'price',
        'price_type',
        'description',
        'sort_order',
    ];

    protected $casts = [
        'weight_from' => 'float',
        'weight_to' => 'float',
        'min_weight' => 'float',
        'max_weight' => 'float',
        'price_per_kg' => 'float',
        'price' => 'float',
        'sort_order' => 'integer',
    ];

    public function rate()
    {
        return $this->belongsTo(ShippingRate::class, 'rate_id');
    }
}
