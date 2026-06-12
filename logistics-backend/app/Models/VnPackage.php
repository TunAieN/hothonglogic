<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VnPackage extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_INSPECTED = 'inspected';
    public const STATUS_DAMAGED = 'damaged';
    public const STATUS_MISSING = 'missing';
    public const STATUS_EXTRA = 'extra';
    public const STATUS_MISMATCHED = 'mismatched';

    public const VALID_INSPECTION_STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_INSPECTED,
        self::STATUS_DAMAGED,
        self::STATUS_MISSING,
        self::STATUS_EXTRA,
        self::STATUS_MISMATCHED,
    ];

    protected $fillable = [
        'vn_batch_receipt_id',
        'cn_batch_id',
        'cn_package_id',
        'tracking_number_snapshot',
        'actual_weight',
        'actual_length',
        'actual_width',
        'actual_height',
        'actual_volume',
        'extra_fee',
        'wooden_fee',
        'other_fee',
        'order_code_snapshot',
        'customer_name_snapshot',
        'inspection_status',
        'note',
        'handled_by',
        'scanned_at',
        'received_at',
    ];

    protected $casts = [
        'actual_weight' => 'float',
        'actual_length' => 'float',
        'actual_width' => 'float',
        'actual_height' => 'float',
        'actual_volume' => 'float',
        'extra_fee' => 'float',
        'wooden_fee' => 'float',
        'other_fee' => 'float',
        'scanned_at' => 'datetime',
        'received_at' => 'datetime',
    ];

    public function receipt()
    {
        return $this->belongsTo(VnBatchReceipt::class, 'vn_batch_receipt_id');
    }

    public function cnBatch()
    {
        return $this->belongsTo(CnBatch::class, 'cn_batch_id');
    }

    public function cnPackage()
    {
        return $this->belongsTo(CnPackage::class, 'cn_package_id');
    }

    public function handler()
    {
        return $this->belongsTo(User::class, 'handled_by');
    }
}
