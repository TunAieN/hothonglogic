<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShippingTaskOrder extends Model
{
    protected $fillable = [
        'shipping_task_id',
        'order_id',
        'package_count',
        'total_weight',
        'total_value',
    ];

    protected $casts = [
        'package_count' => 'integer',
        'total_weight' => 'float',
        'total_value' => 'float',
    ];

    public function task()
    {
        return $this->belongsTo(ShippingTask::class, 'shipping_task_id');
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
