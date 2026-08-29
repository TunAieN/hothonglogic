<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerAddress extends Model
{
    protected $fillable = ['customer_id', 'label', 'receiver_name', 'receiver_phone', 'province_code', 'province_name', 'district_code', 'district_name', 'ward_code', 'ward_name', 'address_line', 'full_address', 'is_default'];
    protected $casts = ['is_default' => 'boolean'];

    public function customer() { return $this->belongsTo(Customer::class); }
    public function deliveryAddressSnapshots() { return $this->hasMany(DeliveryAddress::class, 'source_customer_address_id'); }
}
