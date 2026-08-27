<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VnBatchReceipt extends Model
{
    public const STATUS_DRAFT = 'draft';

    public const STATUS_CHECKING = 'checking';

    public const STATUS_MATCHED = 'matched';

    public const STATUS_MISMATCHED = 'mismatched';

    public const STATUS_CONFIRMED = 'confirmed';

    public const STATUS_CANCELLED = 'cancelled';

    public const ACTIVE_STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_CHECKING,
        self::STATUS_MATCHED,
        self::STATUS_MISMATCHED,
    ];

    protected $fillable = [
        'cn_batch_id',
        'vn_warehouse_id',
        'batch_code',
        'actual_container_count',
        'actual_batch_weight',
        'package_material_weight',
        'actual_length',
        'actual_width',
        'actual_height',
        'actual_volume',
        'outer_condition',
        'batch_weight_difference',
        'requires_resolution',
        'wooden_fee',
        'other_fee',
        'status',
        'total_expected_packages',
        'total_received_packages',
        'total_inspected_packages',
        'total_missing_packages',
        'total_extra_packages',
        'total_damaged_packages',
        'note',
        'handled_by',
        'received_at',
        'confirmed_at',
    ];

    protected $casts = [
        'actual_batch_weight' => 'float',
        'actual_container_count' => 'integer',
        'package_material_weight' => 'float',
        'actual_length' => 'float',
        'actual_width' => 'float',
        'actual_height' => 'float',
        'actual_volume' => 'float',
        'batch_weight_difference' => 'float',
        'requires_resolution' => 'boolean',
        'wooden_fee' => 'float',
        'other_fee' => 'float',
        'total_expected_packages' => 'integer',
        'total_received_packages' => 'integer',
        'total_inspected_packages' => 'integer',
        'total_missing_packages' => 'integer',
        'total_extra_packages' => 'integer',
        'total_damaged_packages' => 'integer',
        'confirmed_at' => 'datetime',
        'received_at' => 'datetime',
    ];

    public function batch()
    {
        return $this->belongsTo(CnBatch::class, 'cn_batch_id');
    }

    public function warehouse()
    {
        return $this->belongsTo(VnWarehouse::class, 'vn_warehouse_id');
    }

    public function packages()
    {
        return $this->hasMany(VnPackage::class, 'vn_batch_receipt_id');
    }

    public function handler()
    {
        return $this->belongsTo(User::class, 'handled_by');
    }
}
