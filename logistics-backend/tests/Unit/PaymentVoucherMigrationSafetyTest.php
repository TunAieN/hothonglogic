<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class PaymentVoucherMigrationSafetyTest extends TestCase
{
    public function test_payment_voucher_migration_is_non_destructive_on_rollback(): void
    {
        $migration = file_get_contents(dirname(__DIR__, 2) . '/database/migrations/2026_06_30_000019_create_payment_voucher_domain.php');
        $downBody = $this->extractMethodBody($migration, 'down');

        $this->assertStringNotContainsString('dropIfExists', $downBody);
        $this->assertStringNotContainsString('dropColumn', $downBody);
        $this->assertStringNotContainsString('DROP COLUMN', $downBody);
        $this->assertStringNotContainsString('Schema::drop', $downBody);
    }

    public function test_payment_voucher_migration_declares_expected_tables_and_columns(): void
    {
        $migration = file_get_contents(dirname(__DIR__, 2) . '/database/migrations/2026_06_30_000019_create_payment_voucher_domain.php');

        foreach ([
            'payment_vouchers',
            'payment_voucher_packages',
            'payment_voucher_surcharges',
            'payment_transactions',
            'customer_balance_ledgers',
            'audit_logs',
            'shipping_rates',
            'shipping_rate_details',
        ] as $table) {
            $this->assertStringContainsString($table, $migration);
        }

        foreach ([
            'payment_status',
            'payment_voucher_id',
            'payment_locked_at',
            'delivery_status',
        ] as $column) {
            $this->assertStringContainsString($column, $migration);
        }
    }

    private function extractMethodBody(string $source, string $method): string
    {
        $start = strpos($source, 'function ' . $method);
        $this->assertNotFalse($start);

        return substr($source, $start);
    }
}
