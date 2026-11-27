<?php

namespace Tests\Unit;

use App\Models\RiskDepositPolicy;
use App\Services\Orders\OrderDepositPolicyService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

class OrderDepositPolicyBreakdownTest extends TestCase
{
    public function test_disabled_vip_and_unconfigured_risk_keep_current_seventy_percent_fallback(): void
    {
        $tier = (object) [
            'deposit_policy_enabled' => false,
            'base_deposit_percent' => 80,
            'credit_limit_vnd' => null,
        ];

        $breakdown = $this->resolve($tier, $this->risk(null, 5), 1_000_000);

        $this->assertNull($breakdown['vip_floor']);
        $this->assertNull($breakdown['risk_floor']);
        $this->assertSame([], $breakdown['configured_floors']);
        $this->assertSame(70.0, $breakdown['recommended']);
    }

    public function test_all_sixteen_vip_and_risk_combinations_use_additive_percentage_points(): void
    {
        $tiers = ['bronze' => 60, 'silver' => 50, 'gold' => 40, 'platinum' => 30];
        $risks = ['low' => 5, 'medium' => 10, 'high' => 20, 'special' => 30];
        $expected = [
            'bronze' => [65, 70, 80, 90],
            'silver' => [55, 60, 70, 80],
            'gold' => [45, 50, 60, 70],
            'platinum' => [35, 40, 50, 60],
        ];

        foreach ($tiers as $tierCode => $base) {
            foreach (array_values($risks) as $riskIndex => $surcharge) {
                $tier = (object) ['deposit_policy_enabled' => true, 'base_deposit_percent' => $base, 'credit_limit_vnd' => null];
                $breakdown = $this->resolve($tier, $this->risk(null, $surcharge), 1_000_000);

                $this->assertSame((float) $expected[$tierCode][$riskIndex], $breakdown['recommended'], $tierCode.' + '.$surcharge);
            }
        }
    }

    public function test_absolute_floor_can_raise_but_not_lower_additive_result(): void
    {
        $tier = (object) ['deposit_policy_enabled' => true, 'base_deposit_percent' => 40, 'credit_limit_vnd' => null];

        $this->assertSame(60.0, $this->resolve($tier, $this->risk(55, 20), 1_000_000)['recommended']);
        $this->assertSame(75.0, $this->resolve($tier, $this->risk(75, 20), 1_000_000)['recommended']);
    }

    public function test_additive_result_is_capped_at_one_hundred_percent(): void
    {
        $tier = (object) ['deposit_policy_enabled' => true, 'base_deposit_percent' => 90, 'credit_limit_vnd' => null];

        $breakdown = $this->resolve($tier, $this->risk(null, 30), 1_000_000);

        $this->assertSame(100.0, $breakdown['additive_percent']);
        $this->assertSame(100.0, $breakdown['recommended']);
    }

    public function test_enabled_policy_without_surcharge_is_rejected_as_incomplete_configuration(): void
    {
        $tier = (object) ['deposit_policy_enabled' => true, 'base_deposit_percent' => 60, 'credit_limit_vnd' => null];

        $this->assertFalse($this->resolve($tier, $this->risk(null, null), 1_000_000)['policy_configuration_valid']);
    }

    public function test_capital_floor_is_only_calculated_for_a_positive_order_value(): void
    {
        $tier = (object) [
            'deposit_policy_enabled' => false,
            'base_deposit_percent' => 80,
            'credit_limit_vnd' => 250_000,
        ];

        $this->assertNull($this->resolve($tier, null, 0)['capital_floor']);
        $this->assertSame(75.0, $this->resolve($tier, null, 1_000_000)['capital_floor']);
    }

    private function resolve(mixed $tier, ?RiskDepositPolicy $risk, int $baseAmountVnd): array
    {
        $reflection = new ReflectionClass(OrderDepositPolicyService::class);
        $service = $reflection->newInstanceWithoutConstructor();
        $method = $reflection->getMethod('resolveBreakdown');

        return $method->invoke($service, $tier, $risk, $baseAmountVnd);
    }

    private function risk(?float $floor, ?float $surcharge = null): RiskDepositPolicy
    {
        $risk = new RiskDepositPolicy();
        $risk->minimum_deposit_percent = $floor;
        $risk->surcharge_percent = $surcharge;

        return $risk;
    }
}
