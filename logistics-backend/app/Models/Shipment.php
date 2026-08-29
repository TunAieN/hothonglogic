<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Shipment extends Model
{
    use SoftDeletes;

    public const STATUS_PENDING = 'pending';

    public const STATUS_CREATED = 'created';

    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = ['delivery_request_id', 'carrier_code', 'service_code', 'carrier_order_id', 'tracking_number', 'shipping_fee', 'cod_amount', 'weight', 'length', 'width', 'height', 'status', 'label_url', 'raw_response'];

    protected $casts = ['shipping_fee' => 'float', 'cod_amount' => 'float', 'weight' => 'float', 'length' => 'float', 'width' => 'float', 'height' => 'float', 'raw_response' => 'array'];

    public function deliveryRequest()
    {
        return $this->belongsTo(DeliveryRequest::class);
    }

    public function trackingEvents()
    {
        return $this->hasMany(ShipmentTrackingEvent::class);
    }
}
