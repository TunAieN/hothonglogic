<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerPurchaseDraft extends Model
{
    protected $fillable = ['customer_id', 'submitted_order_id', 'kind', 'status', 'title', 'note', 'idempotency_key', 'submitted_at'];

    protected $casts = ['submitted_at' => 'datetime'];

    public function items()
    {
        return $this->hasMany(CustomerPurchaseDraftItem::class);
    }

    public function submittedOrder()
    {
        return $this->belongsTo(Order::class, 'submitted_order_id');
    }
}
