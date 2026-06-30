<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CnPackage extends Model
{
    protected $fillable = [
        'warehouse_id',
        'order_id',
        'order_tracking_id',
        'receiver_name',
        'tracking_number',
        'declared_value',
        'carrier',
        'weight',
        'actual_length',
        'actual_width',
        'actual_height',
        'volume',
        'volumetric_weight',
        'chargeable_weight',
        'note',
        'status',
        'package_condition',
        'created_by',
        'received_at',
    ];

    protected $casts = [
        'declared_value' => 'float',
        'weight' => 'float',
        'actual_length' => 'float',
        'actual_width' => 'float',
        'actual_height' => 'float',
        'volume' => 'float',
        'volumetric_weight' => 'float',
        'chargeable_weight' => 'float',
        'received_at' => 'datetime',
    ];

    public function warehouse()
    {
        return $this->belongsTo(CnWarehouse::class, 'warehouse_id');
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function orderTracking()
    {
        return $this->belongsTo(OrderTracking::class, 'order_tracking_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function batchPackages()
    {
        return $this->hasMany(CnBatchPackage::class, 'cn_package_id');
    }

    public function currentBatchPackage()
    {
        return $this->hasOne(CnBatchPackage::class, 'cn_package_id');
    }

    public function batches()
    {
        return $this->belongsToMany(CnBatch::class, 'cn_batch_packages', 'cn_package_id', 'cn_batch_id')
            ->withTimestamps();
    }

    public function packageItems()
    {
        return $this->hasMany(CnPackageItem::class, 'cn_package_id');
    }

    public function vnPackages()
    {
        return $this->hasMany(VnPackage::class, 'cn_package_id');
    }
}
