<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class DepositPaymentAutomationSafetyTest extends TestCase
{
    public function test_migration_is_additive_and_preserves_financial_history(): void
    {
        $source = file_get_contents(__DIR__.'/../../database/migrations/2026_11_26_000053_add_deposit_payment_automation_domain.php');

        self::assertStringContainsString("Schema::create('customer_notifications'", $source);
        self::assertStringContainsString("Schema::table('payment_transactions'", $source);
        self::assertStringContainsString('payment_transactions_provider_tx_unique', $source);
        self::assertDoesNotMatchRegularExpression('/\b(drop|truncate|delete)\b/i', $source);
    }

    public function test_deposit_auto_confirmation_has_a_separate_fail_closed_flag(): void
    {
        $config = file_get_contents(__DIR__.'/../../config/sepay.php');
        $webhook = file_get_contents(__DIR__.'/../../app/Services/Payments/SepayWebhookService.php');

        self::assertStringContainsString("SEPAY_DEPOSIT_AUTO_CONFIRMATION_ENABLED', false", $config);
        self::assertStringContainsString("deposit_auto_confirmation_enabled') !== true", $webhook);
        self::assertStringContainsString("'deposit_auto_confirmation_disabled'", $webhook);
    }

    public function test_direct_voucher_payment_has_a_separate_fail_closed_flag(): void
    {
        $config = file_get_contents(__DIR__.'/../../config/sepay.php');
        $controller = file_get_contents(__DIR__.'/../../app/Http/Controllers/CustomerFinanceController.php');
        $webhook = file_get_contents(__DIR__.'/../../app/Services/Payments/SepayWebhookService.php');

        self::assertStringContainsString("SEPAY_DIRECT_VOUCHER_PAYMENT_ENABLED', false", $config);
        self::assertStringContainsString("direct_voucher_payment_enabled') === true", $controller);
        self::assertStringContainsString("direct_voucher_payment_enabled') !== true", $webhook);
        self::assertStringContainsString("'direct_voucher_payment_disabled'", $webhook);
    }

    public function test_only_exact_verified_deposit_payments_reach_financial_confirmation(): void
    {
        $source = file_get_contents(__DIR__.'/../../app/Services/Payments/SepayWebhookService.php');

        foreach (['not_incoming', 'invalid_amount', 'reference_not_found', 'intent_not_found',
            'receiving_account_not_verified', 'amount_mismatch', 'intent_cancelled', 'intent_expired'] as $reason) {
            self::assertStringContainsString($reason, $source);
        }
        self::assertStringContainsString("'sepay_auto'", $source);
        self::assertStringContainsString("'verified_account_number'", $source);
        self::assertStringContainsString("'verified_reference'", $source);
    }

    public function test_reconciliation_never_credits_wallet_or_confirms_a_voucher(): void
    {
        $source = file_get_contents(__DIR__.'/../../app/Services/Payments/SepayWebhookService.php');
        preg_match('/private function reconcile\(.*?\n    }/s', $source, $matches);
        $method = $matches[0] ?? '';

        self::assertNotSame('', $method);
        self::assertStringNotContainsString('ledger->credit', $method);
        self::assertStringNotContainsString('confirmExactCustomerPayment', $method);
        self::assertStringContainsString('voucherNeedsReview', $method);
    }

    public function test_manual_fallback_requires_evidence_and_is_not_the_default_source(): void
    {
        $source = file_get_contents(__DIR__.'/../../app/Services/Payments/PaymentVoucherService.php');

        self::assertStringContainsString("mb_strlen(\$manualReason) < 10", $source);
        self::assertStringContainsString("'confirm_deposit_payment_manual'", $source);
        self::assertStringContainsString("'confirm_deposit_payment_auto'", $source);
    }

    public function test_notifications_are_idempotent_and_reminders_are_rate_limited(): void
    {
        $source = file_get_contents(__DIR__.'/../../app/Services/Payments/CustomerNotificationService.php');

        self::assertStringContainsString("'deposit-requested:'", $source);
        self::assertStringContainsString("'deposit-paid:'", $source);
        self::assertStringContainsString('firstOrCreate', $source);
        self::assertStringContainsString('deposit_reminder_cooldown_minutes', $source);
        self::assertStringContainsString('deposit_reminder_daily_limit', $source);
    }

    public function test_graphql_automation_returns_datetime_objects_instead_of_rest_iso_strings(): void
    {
        $source = file_get_contents(__DIR__.'/../../app/GraphQL/Resolvers/PaymentVoucherResolver.php');

        self::assertStringContainsString("'expires_at' => \$intent->expires_at", $source);
        self::assertStringContainsString("'created_at' => \$intent->created_at", $source);
        self::assertStringContainsString("'completed_at' => \$intent->completed_at", $source);
    }
}
