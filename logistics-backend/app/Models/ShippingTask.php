<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShippingTask extends Model
{
    public const STATUS_CREATED = 'created';

    public const STATUS_PREPARING = 'preparing';

    public const STATUS_IN_TRANSIT = 'in_transit';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'task_code',
        'delivery_staff_id',
        'vn_warehouse_id',
        'carrier_code',
        'carrier_name',
        'scheduled_delivery_date',
        'service_type',
        'delivery_method',
        'estimated_shipping_fee',
        'cod_amount',
        'status',
        'note',
        'transport_note',
        'created_by',
    ];

    protected $casts = [
        'scheduled_delivery_date' => 'date',
        'estimated_shipping_fee' => 'float',
        'cod_amount' => 'float',
    ];

    public function taskOrders()
    {
        return $this->hasMany(ShippingTaskOrder::class);
    }

    public function orders()
    {
        return $this->belongsToMany(Order::class, 'shipping_task_orders')
            ->withPivot(['package_count', 'total_weight', 'total_value'])
            ->withTimestamps();
    }

    public function exportSlip()
    {
        return $this->hasOne(ExportSlip::class);
    }

    public function deliveryRequests()
    {
        return $this->hasMany(DeliveryRequest::class);
    }

    public function deliveryStaff()
    {
        return $this->belongsTo(User::class, 'delivery_staff_id');
    }

    public function warehouse()
    {
        return $this->belongsTo(VnWarehouse::class, 'vn_warehouse_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
