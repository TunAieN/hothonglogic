<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class VipDepositPolicySafetyTest extends TestCase
{
    public function test_migration_is_additive_preserves_legacy_vip_and_starts_financial_policy_disabled(): void
    {
        $source = file_get_contents(dirname(__DIR__, 2).'/database/migrations/2026_11_25_000051_create_vip_and_order_deposit_policy_domain.php');
        $down = substr($source, strpos($source, 'public function down'));

        foreach (['vip_tiers', 'customer_vip_spend_events', 'customer_vip_histories', 'risk_deposit_policies', 'order_deposit_policy_snapshots'] as $table) {
            $this->assertStringContainsString($table, $source);
        }
        $this->assertStringContainsString("->foreignId('vip_tier_id')->nullable()", $source);
        $this->assertStringContainsString("'deposit_policy_enabled' => false", $source);
        $this->assertStringNotContainsString("dropColumn", $down);
        $this->assertStringNotContainsString("dropIfExists", $down);
        $this->assertStringNotContainsString("DB::table('customers')->update", $source);
    }

    public function test_spend_and_deposit_paths_are_idempotent_and_backend_authorized(): void
    {
        $vip = file_get_contents(dirname(__DIR__, 2).'/app/Services/Customers/CustomerVipService.php');
        $deposit = file_get_contents(dirname(__DIR__, 2).'/app/Services/Orders/OrderDepositPolicyService.php');
        $voucher = file_get_contents(dirname(__DIR__, 2).'/app/Services/Payments/PaymentVoucherService.php');

        $this->assertStringContainsString("vip_spend_source_event_unique", file_get_contents(dirname(__DIR__, 2).'/database/migrations/2026_11_25_000051_create_vip_and_order_deposit_policy_domain.php'));
        $this->assertStringContainsString("'order_completed'", $vip);
        $this->assertStringContainsString("'order_cancelled_adjustment'", $vip);
        $this->assertStringContainsString("deposit_exceptions.approve", $deposit);
        $this->assertStringContainsString("max(\$configuredFloors)", $deposit);
        $this->assertStringContainsString('public function preview(Order $order', $deposit);
        $this->assertStringContainsString('CURRENT_FALLBACK_PERCENT = 70.0', $deposit);
        $this->assertStringContainsString('Tỷ lệ xem trước đã thay đổi', $deposit);
        $this->assertStringContainsString("risk->code === 'low'", $deposit);
        $this->assertStringContainsString('order_deposit_policy_snapshots', $voucher);
        $resolver = file_get_contents(dirname(__DIR__, 2).'/app/GraphQL/Resolvers/PaymentVoucherResolver.php');
        $this->assertStringContainsString('Phải đánh giá rủi ro trước khi phát hành phiếu đặt cọc', $resolver);
        $orderResolver = file_get_contents(dirname(__DIR__, 2).'/app/GraphQL/Resolvers/OrderResolver.php');
        $this->assertStringContainsString('lockForUpdate()->findOrFail', $orderResolver);
    }

    public function test_customer_registration_assigns_vip_inside_account_transaction(): void
    {
        $controller = file_get_contents(dirname(__DIR__, 2).'/app/Http/Controllers/CustomerAuthController.php');
        $resolver = file_get_contents(dirname(__DIR__, 2).'/app/GraphQL/Resolvers/CustomerResolver.php');
        $input = file_get_contents(dirname(__DIR__, 2).'/app/Services/Customers/CustomerInputService.php');

        $this->assertStringContainsString('attributesForNewCustomer', $controller);
        $this->assertStringContainsString('attributesForNewCustomer', $resolver);
        $this->assertStringContainsString("unset(\$sanitized['vip_group']", $input);
    }

    public function test_surcharge_migration_is_separate_and_does_not_activate_vip_policy(): void
    {
        $source = file_get_contents(dirname(__DIR__, 2).'/database/migrations/2026_11_26_000052_add_risk_surcharge_policy.php');

        $this->assertStringContainsString("'low' => 5", $source);
        $this->assertStringContainsString("'special' => 30", $source);
        $this->assertStringContainsString("risk_surcharge_percent", $source);
        $this->assertStringContainsString('risk_deposit_surcharge_unique', $source);
        $this->assertStringNotContainsString("deposit_policy_enabled' => true", $source);
        $this->assertStringNotContainsString("DB::table('customers')", $source);
    }
}
