<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class PaymentVoucherMigrationSafetyTest extends TestCase
{
    public function test_payment_voucher_migration_is_non_destructive_on_rollback(): void
    {
        $migration = file_get_contents(dirname(__DIR__, 2).'/database/migrations/2026_06_30_000019_create_payment_voucher_domain.php');
        $downBody = $this->extractMethodBody($migration, 'down');

        $this->assertStringNotContainsString('dropIfExists', $downBody);
        $this->assertStringNotContainsString('dropColumn', $downBody);
        $this->assertStringNotContainsString('DROP COLUMN', $downBody);
        $this->assertStringNotContainsString('Schema::drop', $downBody);
    }

    public function test_payment_voucher_migration_declares_expected_tables_and_columns(): void
    {
        $migration = file_get_contents(dirname(__DIR__, 2).'/database/migrations/2026_06_30_000019_create_payment_voucher_domain.php');

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

    public function test_normalization_migrations_are_additive_and_non_destructive(): void
    {
        foreach ([
            '2026_08_28_000041_add_delivery_quote_details_to_payment_vouchers.php',
            '2026_08_28_000042_normalize_payment_delivery_shipping_domains.php',
            '2026_08_28_000043_reconcile_legacy_payment_voucher_items.php',
        ] as $file) {
            $migration = file_get_contents(dirname(__DIR__, 2).'/database/migrations/'.$file);
            $downBody = $this->extractMethodBody($migration, 'down');
            $this->assertStringNotContainsString('dropIfExists', $downBody, $file);
            $this->assertStringNotContainsString('dropColumn', $downBody, $file);
            $this->assertStringNotContainsString('Schema::drop', $downBody, $file);
        }
    }

    public function test_domain_normalization_declares_expected_tables_and_safe_foreign_keys(): void
    {
        $migration = file_get_contents(dirname(__DIR__, 2).'/database/migrations/2026_08_28_000042_normalize_payment_delivery_shipping_domains.php');
        foreach (['payment_voucher_items', 'customer_addresses', 'delivery_requests', 'delivery_addresses', 'shipments', 'shipment_tracking_events'] as $table) {
            $this->assertStringContainsString($table, $migration);
        }
        $this->assertStringContainsString('restrictOnDelete', $migration);
        $this->assertStringContainsString('nullOnDelete', $migration);
        $this->assertStringNotContainsString('cascadeOnDelete', $migration);
    }

    public function test_final_cleanup_has_preflight_and_removes_duplicate_sources(): void
    {
        $migration = file_get_contents(dirname(__DIR__, 2).'/database/migrations/2026_08_28_000044_cleanup_legacy_payment_voucher_columns.php');

        $this->assertStringContainsString('assertReadyForCleanup', $migration);
        $this->assertStringContainsString("Schema::drop('payment_voucher_surcharges')", $migration);
        foreach (['receiver_type', 'delivery_address', 'shipping_carrier', 'shipping_fee_total', 'domestic_shipping_fee', 'surcharge_total'] as $column) {
            $this->assertStringContainsString("'{$column}'", $migration);
        }
    }

    public function test_application_no_longer_depends_on_payment_voucher_legacy_fields(): void
    {
        $root = dirname(__DIR__, 2);
        $paymentVoucherModel = file_get_contents($root.'/app/Models/PaymentVoucher.php');
        $paymentService = file_get_contents($root.'/app/Services/Payments/PaymentVoucherService.php');
        $paymentSchema = file_get_contents($root.'/graphql/payments.graphql');
        $frontend = implode("\n", array_map('file_get_contents', glob($root.'/../admin-panel/src/pages/payment-vouchers/*.{ts,tsx}', GLOB_BRACE)));

        foreach (['receiver_type', 'delivery_province', 'delivery_district', 'delivery_ward', 'delivery_address_line', 'shipping_carrier', 'shipping_fee_total', 'domestic_shipping_fee', 'surcharge_total'] as $legacyField) {
            $this->assertStringNotContainsString($legacyField, $paymentVoucherModel, $legacyField.' remains in PaymentVoucher model');
            $this->assertStringNotContainsString($legacyField, $paymentService, $legacyField.' remains in PaymentVoucherService');
            $this->assertStringNotContainsString($legacyField, $paymentSchema, $legacyField.' remains in payment GraphQL schema');
            $this->assertStringNotContainsString($legacyField, $frontend, $legacyField.' remains in payment frontend');
        }
        $this->assertStringNotContainsString('local_delivery', $paymentService.$paymentSchema.$frontend);
        $this->assertStringNotContainsString('PaymentVoucherSurcharge', $paymentVoucherModel.$paymentService.$paymentSchema.$frontend);
    }

    private function extractMethodBody(string $source, string $method): string
    {
        $start = strpos($source, 'function '.$method);
        $this->assertNotFalse($start);

        return substr($source, $start);
    }
}
