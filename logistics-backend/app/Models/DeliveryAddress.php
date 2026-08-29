<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryAddress extends Model
{
    protected $fillable = ['delivery_request_id', 'source_customer_address_id', 'receiver_name', 'receiver_phone', 'province_code', 'province_name', 'district_code', 'district_name', 'ward_code', 'ward_name', 'address_line', 'full_address'];

    public function deliveryRequest() { return $this->belongsTo(DeliveryRequest::class); }
    public function sourceCustomerAddress() { return $this->belongsTo(CustomerAddress::class, 'source_customer_address_id'); }
}
