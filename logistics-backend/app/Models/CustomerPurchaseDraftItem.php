<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerPurchaseDraftItem extends Model
{
    protected $fillable = ['source', 'product_link', 'product_name', 'variant', 'price_cny', 'quantity', 'note', 'product_image', 'seller', 'shop_id', 'shop_name', 'size', 'color'];

    protected $casts = ['price_cny' => 'decimal:2', 'quantity' => 'integer'];

    public function draft()
    {
        return $this->belongsTo(CustomerPurchaseDraft::class, 'customer_purchase_draft_id');
    }
}
