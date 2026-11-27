<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VipTier extends Model
{
    protected $fillable = ['code', 'name', 'priority', 'minimum_spend_vnd', 'base_deposit_percent', 'credit_limit_vnd', 'deposit_policy_enabled', 'is_default', 'is_active', 'updated_by'];

    protected $casts = [
        'minimum_spend_vnd' => 'integer', 'base_deposit_percent' => 'decimal:2', 'credit_limit_vnd' => 'integer',
        'deposit_policy_enabled' => 'boolean', 'is_default' => 'boolean', 'is_active' => 'boolean',
    ];

    public function customers() { return $this->hasMany(Customer::class); }
}
