<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShippingRate extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_INACTIVE = 'inactive';

    protected $fillable = [
        'name',
        'customer_type',
        'route_type',
        'warehouse_id',
        'valid_from',
        'valid_to',
        'effective_from',
        'effective_to',
        'status',
        'note',
        'created_by',
    ];

    protected $casts = [
        'valid_from' => 'date',
        'valid_to' => 'date',
        'effective_from' => 'date',
        'effective_to' => 'date',
    ];

    public function details()
    {
        return $this->hasMany(ShippingRateDetail::class, 'rate_id');
    }

    public function warehouse()
    {
        return $this->belongsTo(VnWarehouse::class, 'warehouse_id');
    }
}
