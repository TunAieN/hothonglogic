<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VnPackageItem extends Model
{
    protected $fillable = [
        'vn_package_id',
        'order_item_id',
        'product_name_snapshot',
        'variant_snapshot',
        'expected_quantity',
        'received_quantity',
        'condition_status',
        'note',
    ];

    protected $casts = [
        'expected_quantity' => 'integer',
        'received_quantity' => 'integer',
    ];

    public function package()
    {
        return $this->belongsTo(VnPackage::class, 'vn_package_id');
    }

    public function orderItem()
    {
        return $this->belongsTo(OrderItem::class);
    }
}
