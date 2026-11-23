<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class CustomerFinanceMigrationSafetyTest extends TestCase
{
    public function test_financial_domain_has_database_enforced_idempotency_and_non_destructive_rollback(): void
    {
        $source = file_get_contents(__DIR__.'/../../database/migrations/2026_11_23_000049_create_customer_finance_sepay_domain.php');
        $this->assertStringContainsString("->string('reference', 64)->unique()", $source);
        $this->assertStringContainsString("->string('provider_transaction_id', 100)->unique()", $source);
        $this->assertStringContainsString('customer_payment_intents_customer_idem_unique', $source);
        $this->assertStringNotContainsString('dropIfExists', $source);
    }

    public function test_sepay_is_fail_closed_by_default(): void
    {
        $source = file_get_contents(__DIR__.'/../../config/sepay.php');
        $this->assertStringContainsString("env('SEPAY_ENABLED', false)", $source);
    }
}
