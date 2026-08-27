<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CnBatch extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_EXPORTING = 'exporting';

    public const STATUS_ARRIVED_VN = 'arrived_vn';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_CANCELLED = 'cancelled';

    public const VALID_STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_EXPORTING,
        self::STATUS_ARRIVED_VN,
        self::STATUS_COMPLETED,
        self::STATUS_CANCELLED,
    ];

    protected $fillable = [
        'batch_code',
        'warehouse_id',
        'destination_warehouse_name',
        'total_packages',
        'status',
        'shipping_type',
        'packaging_type',
        'transport_container_count',
        'departed_at',
        'expected_arrival_at',
        'arrived_at',
        'total_weight',
        'actual_batch_weight',
        'package_material_weight',
        'actual_length',
        'actual_width',
        'actual_height',
        'actual_volume',
        'carrier_name',
        'transport_code',
        'route_name',
        'vehicle_plate',
        'driver_name',
        'driver_phone',
        'freight_cost',
        'handed_over_by',
        'handed_over_at',
        'dispatch_snapshot',
        'dispatch_note',
        'note',
    ];

    protected $casts = [
        'total_packages' => 'integer',
        'transport_container_count' => 'integer',
        'total_weight' => 'float',
        'actual_batch_weight' => 'float',
        'package_material_weight' => 'float',
        'actual_length' => 'float',
        'actual_width' => 'float',
        'actual_height' => 'float',
        'actual_volume' => 'float',
        'freight_cost' => 'float',
        'departed_at' => 'datetime',
        'expected_arrival_at' => 'datetime',
        'arrived_at' => 'datetime',
        'handed_over_at' => 'datetime',
        'dispatch_snapshot' => 'array',
    ];

    public function warehouse()
    {
        return $this->belongsTo(CnWarehouse::class, 'warehouse_id');
    }

    public function batchPackages()
    {
        return $this->hasMany(CnBatchPackage::class, 'cn_batch_id');
    }

    public function packages()
    {
        return $this->belongsToMany(CnPackage::class, 'cn_batch_packages', 'cn_batch_id', 'cn_package_id')
            ->withTimestamps();
    }

    public function vnBatchReceipt()
    {
        return $this->hasOne(VnBatchReceipt::class, 'cn_batch_id');
    }

    public function vnPackages()
    {
        return $this->hasMany(VnPackage::class, 'cn_batch_id');
    }
}
