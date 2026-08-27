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
        'cn_weight_snapshot',
        'actual_weight',
        'weight_difference',
        'actual_length',
        'actual_width',
        'actual_height',
        'actual_volume',
        'physical_condition',
        'requires_item_inspection',
        'item_inspection_status',
        'exception_reason',
        'error_resolution_status',
        'resolution_note',
        'resolution_action',
        'resolution_result',
        'expected_completion_at',
        'resolved_by',
        'error_detected_at',
        'error_resolved_at',
        'extra_fee',
        'wooden_fee',
        'other_fee',
        'order_code_snapshot',
        'customer_name_snapshot',
        'inspection_status',
        'payment_status',
        'payment_voucher_id',
        'payment_locked_at',
        'delivery_status',
        'note',
        'handled_by',
        'scanned_at',
        'received_at',
    ];

    protected $casts = [
        'actual_weight' => 'float',
        'cn_weight_snapshot' => 'float',
        'weight_difference' => 'float',
        'actual_length' => 'float',
        'actual_width' => 'float',
        'actual_height' => 'float',
        'actual_volume' => 'float',
        'extra_fee' => 'float',
        'wooden_fee' => 'float',
        'other_fee' => 'float',
        'requires_item_inspection' => 'boolean',
        'scanned_at' => 'datetime',
        'received_at' => 'datetime',
        'error_detected_at' => 'datetime',
        'error_resolved_at' => 'datetime',
        'expected_completion_at' => 'datetime',
        'payment_locked_at' => 'datetime',
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

    public function paymentVoucher()
    {
        return $this->belongsTo(PaymentVoucher::class, 'payment_voucher_id');
    }

    public function paymentVoucherPackage()
    {
        return $this->hasOne(PaymentVoucherPackage::class, 'vn_package_id')->latestOfMany();
    }
    public function handler()
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

    public function resolver()
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function inspectedItems()
    {
        return $this->hasMany(VnPackageItem::class, 'vn_package_id');
    }

    public function evidences()
    {
        return $this->hasMany(VnPackageEvidence::class, 'vn_package_id')->orderBy('id');
    }

    public function exportItem()
    {
        return $this->hasOne(ExportItem::class, 'vn_package_id');
    }
}
