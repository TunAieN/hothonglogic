<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExportSlip extends Model
{
    protected $table = 'exports';

    protected $fillable = [
        'export_code',
        'shipping_task_id',
        'invoice_id',
        'customer_id',
        'delivery_address',
        'delivery_staff_id',
        'created_by',
        'scheduled_delivery_date',
        'status',
        'note',
    ];

    protected $casts = [
        'scheduled_delivery_date' => 'date',
    ];

    public function task()
    {
        return $this->belongsTo(ShippingTask::class, 'shipping_task_id');
    }

    public function items()
    {
        return $this->hasMany(ExportItem::class, 'export_id');
    }

    public function deliveryStaff()
    {
        return $this->belongsTo(User::class, 'delivery_staff_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
