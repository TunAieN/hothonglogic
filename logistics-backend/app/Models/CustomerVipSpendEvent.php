<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerVipSpendEvent extends Model
{
    protected $fillable = ['customer_id', 'source_type', 'source_id', 'event_type', 'amount_vnd', 'occurred_at', 'metadata', 'created_by'];
    protected $casts = ['amount_vnd' => 'integer', 'occurred_at' => 'datetime', 'metadata' => 'array'];
}
