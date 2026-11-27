<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderDepositPolicySnapshot extends Model
{
    protected $guarded = [];
    protected $casts = [
        'qualified_spend_vnd' => 'integer', 'base_amount_vnd' => 'integer', 'deposit_waived' => 'boolean', 'is_exception' => 'boolean',
        'vip_deposit_percent' => 'decimal:2', 'risk_minimum_percent' => 'decimal:2', 'risk_surcharge_percent' => 'decimal:2',
        'additive_percent' => 'decimal:2', 'capital_minimum_percent' => 'decimal:2', 'risk_evidence' => 'array',
        'recommended_percent' => 'decimal:2', 'final_percent' => 'decimal:2', 'assessed_at' => 'datetime', 'approved_at' => 'datetime', 'voucher_issued_at' => 'datetime',
    ];
    public function riskPolicy() { return $this->belongsTo(RiskDepositPolicy::class, 'risk_deposit_policy_id'); }
}
