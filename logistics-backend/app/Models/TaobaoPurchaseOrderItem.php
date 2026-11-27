<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaobaoPurchaseOrderItem extends Model
{
    protected $fillable = ['taobao_purchase_order_id', 'order_item_id', 'quantity'];
    protected $casts = ['quantity' => 'integer'];
    public function purchaseOrder() { return $this->belongsTo(TaobaoPurchaseOrder::class, 'taobao_purchase_order_id'); }
    public function orderItem() { return $this->belongsTo(OrderItem::class); }
}
