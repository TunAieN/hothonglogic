<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CnPackageItem extends Model
{
    protected $fillable = [
        'cn_package_id',
        'order_item_id',
        'quantity',
    ];

    public function package()
    {
        return $this->belongsTo(CnPackage::class, 'cn_package_id');
    }

    public function orderItem()
    {
        return $this->belongsTo(OrderItem::class);
    }
}
