<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class CustomerFinanceMigrationSafetyTest extends TestCase
{
    public function test_financial_domain_has_database_enforced_idempotency_and_non_destructive_rollback(): void
    {
        $source = file_get_contents(__DIR__.'/../../database/migrations/2026_11_23_000049_create_customer_finance_sepay_domain.php');
        $hardening = file_get_contents(__DIR__.'/../../database/migrations/2026_11_23_000050_harden_sepay_webhook_events.php');
        $this->assertStringContainsString("->string('reference', 64)->unique()", $source);
        $this->assertStringContainsString("->string('provider_transaction_id', 100)->unique()", $source);
        $this->assertStringContainsString('customer_payment_intents_customer_idem_unique', $source);
        $this->assertStringNotContainsString('dropIfExists', $source);
        $this->assertStringContainsString("'processing_history'", $hardening);
        $this->assertStringContainsString("'payload_conflict_count'", $hardening);
        $this->assertStringContainsString('sepay_events_retry_idx', $hardening);
        $this->assertStringNotContainsString('dropColumn', $hardening);
    }

    public function test_sepay_is_fail_closed_by_default(): void
    {
        $source = file_get_contents(__DIR__.'/../../config/sepay.php');
        $this->assertStringContainsString("env('SEPAY_ENABLED', false)", $source);
        $this->assertStringContainsString("env('SEPAY_WEBHOOK_ENABLED', false)", $source);
        $this->assertStringContainsString("env('SEPAY_VERIFIED_ACCOUNTS', '[]')", $source);
    }

    public function test_reconciliation_endpoints_use_existing_admin_permissions(): void
    {
        $source = file_get_contents(__DIR__.'/../../graphql/sepayReconciliation.graphql');
        $this->assertStringContainsString('@guard(with: ["api"])', $source);
        $this->assertStringContainsString('@permission(requires: "payments.read")', $source);
        $this->assertStringContainsString('@permission(requires: "payments.confirm")', $source);
    }

    public function test_customer_pricing_uses_the_authenticated_vip_group(): void
    {
        $source = file_get_contents(__DIR__.'/../../app/Http/Controllers/CustomerFinanceController.php');
        $this->assertStringContainsString('customer?->vip_group', $source);
        $this->assertStringNotContainsString("customer_type' => 'retail'", $source);
    }

    public function test_finance_write_throttle_has_a_bucket_separate_from_status_polling(): void
    {
        $routes = file_get_contents(__DIR__.'/../../routes/web.php');

        $this->assertSame(3, substr_count($routes, "throttle:10,1,customer-finance-write:"));
        $this->assertStringContainsString("Route::get('finance/payment-intents/{reference}'", $routes);
    }

    public function test_customer_payment_intent_history_is_scoped_and_expiration_is_scheduled_safely(): void
    {
        $routes = file_get_contents(__DIR__.'/../../routes/web.php');
        $controller = file_get_contents(__DIR__.'/../../app/Http/Controllers/CustomerFinanceController.php');
        $service = file_get_contents(__DIR__.'/../../app/Services/Payments/CustomerFinanceService.php');
        $kernel = file_get_contents(__DIR__.'/../../app/Console/Kernel.php');

        $this->assertStringContainsString("Route::get('finance/payment-intents',", $routes);
        $this->assertStringContainsString("->where('customer_id', \$this->customerId(\$request))", $controller);
        $this->assertStringContainsString("->where('expires_at', '<=', now())", $service);
        $this->assertStringContainsString('->lockForUpdate()', $service);
        $this->assertStringContainsString("sepay:expire-intents --limit=500", $kernel);
        $this->assertStringContainsString("if (config('sepay.webhook_enabled'))", $kernel);
    }
}
