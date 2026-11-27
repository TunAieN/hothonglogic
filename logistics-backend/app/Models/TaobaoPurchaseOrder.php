<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaobaoPurchaseOrder extends Model
{
    protected $fillable = ['order_id', 'platform', 'external_order_code', 'shop_id', 'shop_name', 'purchased_at', 'note', 'shop_exception_reason', 'status', 'created_by', 'updated_by', 'confirmed_by', 'confirmed_at'];

    protected $casts = ['purchased_at' => 'datetime', 'confirmed_at' => 'datetime'];

    public function order() { return $this->belongsTo(Order::class); }
    public function items() { return $this->hasMany(TaobaoPurchaseOrderItem::class); }
    public function trackings() { return $this->belongsToMany(OrderTracking::class, 'taobao_purchase_order_trackings')->withPivot('linked_by')->withTimestamps(); }
}
