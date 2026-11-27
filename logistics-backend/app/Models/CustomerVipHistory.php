<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerVipHistory extends Model
{
    protected $fillable = ['customer_id', 'from_vip_tier_id', 'to_vip_tier_id', 'change_type', 'qualified_spend_vnd', 'reason', 'changed_by'];
    protected $casts = ['qualified_spend_vnd' => 'integer'];
    public function fromTier() { return $this->belongsTo(VipTier::class, 'from_vip_tier_id'); }
    public function toTier() { return $this->belongsTo(VipTier::class, 'to_vip_tier_id'); }
}
