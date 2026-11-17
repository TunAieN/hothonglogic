<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductLookupRequest extends Model
{
    protected $fillable = ['customer_id', 'claimed_by', 'platform', 'source_url', 'status', 'product_data', 'staff_note', 'claimed_at', 'completed_at'];

    protected $casts = ['product_data' => 'array', 'claimed_at' => 'datetime', 'completed_at' => 'datetime'];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function staff()
    {
        return $this->belongsTo(User::class, 'claimed_by');
    }
}
