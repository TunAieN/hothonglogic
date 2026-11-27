<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskDepositPolicy extends Model
{
    protected $fillable = ['code', 'name', 'priority', 'minimum_deposit_percent', 'surcharge_percent', 'requires_manager_approval', 'is_active', 'updated_by'];
    protected $casts = ['minimum_deposit_percent' => 'decimal:2', 'surcharge_percent' => 'decimal:2', 'requires_manager_approval' => 'boolean', 'is_active' => 'boolean'];
}
