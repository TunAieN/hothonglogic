<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShipmentTrackingEvent extends Model
{
    protected $fillable = ['shipment_id', 'carrier_status', 'internal_status', 'description', 'location', 'occurred_at', 'raw_payload'];

    protected $casts = ['occurred_at' => 'datetime', 'raw_payload' => 'array'];

    public function shipment()
    {
        return $this->belongsTo(Shipment::class);
    }
}
