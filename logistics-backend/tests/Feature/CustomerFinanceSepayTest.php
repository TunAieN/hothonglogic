<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAccount;
use App\Models\CustomerBalanceLedger;
use App\Models\CustomerPaymentIntent;
use App\Models\PaymentAccount;
use App\Models\PaymentVoucher;
use App\Models\SepayWebhookEvent;
use App\Services\Payments\SepayWebhookService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class CustomerFinanceSepayTest extends TestCase
{
    use DatabaseTransactions;

    private CustomerAccount $account;

    private PaymentAccount $paymentAccount;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('sepay.enabled', true);
        Config::set('sepay.webhook_enabled', true);
        Config::set('sepay.deposit_auto_confirmation_enabled', true);
        Config::set('sepay.direct_voucher_payment_enabled', true);
        Config::set('sepay.webhook_secret', 'test-webhook-secret');
        Config::set('sepay.timestamp_tolerance_seconds', 300);
        Config::set('sepay.qr_base_url', 'https://img.vietqr.io/image');
        $customer = Customer::query()->create([
            'code' => 'CUS-FIN-'.bin2hex(random_bytes(3)), 'name' => 'Khách tài chính',
            'email' => bin2hex(random_bytes(4)).'@example.test', 'phone' => '0900000000', 'status' => 'active',
        ]);
        $this->account = CustomerAccount::query()->create([
            'customer_id' => $customer->id, 'email' => $customer->email, 'phone_e164' => '+84900000000',
            'password' => 'VeryStrongPassword!123', 'status' => 'active', 'email_verified_at' => now(),
        ]);
        $this->paymentAccount = PaymentAccount::query()->create([
            'bank_name' => 'Ngân hàng QA', 'bank_code' => 'MB', 'account_number' => '123456789',
            'account_holder' => 'VIETTRUNG QA', 'is_default' => true, 'is_active' => true,
        ]);
        Config::set('sepay.verified_accounts', [[
            'enabled' => true, 'payment_account_id' => $this->paymentAccount->id,
            'sepay_account_id' => 'qa-sepay-account-1', 'bank_code' => 'MB', 'account_number' => '123456789',
        ]]);
    }

    public function test_topup_intent_is_idempotent_and_owned_by_authenticated_customer(): void
    {
        $this->authenticate();
        $payload = ['amount_vnd' => 500000, 'idempotency_key' => 'topup-idempotent-1'];
        $firstResponse = $this->postJson('/customer-portal/finance/top-up-intents', $payload)->assertCreated();
        $first = $firstResponse->json('intent.reference');
        $this->assertSame(
            'https://img.vietqr.io/image/MB-123456789-compact2.svg?amount=500000&addInfo='.rawurlencode($first).'&accountName=VIETTRUNG%20QA',
            $firstResponse->json('intent.qr_url'),
        );
        $this->assertSame('VIETTRUNG QA', $firstResponse->json('intent.bank.account_holder'));
        $second = $this->postJson('/customer-portal/finance/top-up-intents', $payload)->assertCreated()->json('intent.reference');
        $this->assertSame($first, $second);
        $this->assertSame(1, CustomerPaymentIntent::query()->where('customer_id', $this->account->customer_id)->count());
        $this->assertSame(0, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_changing_topup_amount_uses_a_distinct_intent_without_touching_ledger(): void
    {
        $this->authenticate();
        $first = $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 10000, 'idempotency_key' => 'topup-amount-10000',
        ])->assertCreated()->json('intent');
        $second = $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 100000, 'idempotency_key' => 'topup-amount-100000',
        ])->assertCreated()->json('intent');

        $this->assertNotSame($first['reference'], $second['reference']);
        $this->assertSame(10000, $first['amount_vnd']);
        $this->assertSame(100000, $second['amount_vnd']);
        $this->assertSame(0, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_wallet_checkout_pays_multiple_vouchers_atomically_and_is_idempotent(): void
    {
        $this->authenticate();
        CustomerBalanceLedger::query()->create([
            'customer_id' => $this->account->customer_id,
            'type' => 'credit', 'amount' => '400000.00', 'balance_after' => '400000.00',
            'description' => 'Số dư fixture checkout cô lập',
        ]);
        $vouchers = collect([200000, 150000])->map(fn (int $amount, int $index) => PaymentVoucher::query()->create([
            'voucher_code' => 'PV-BATCH-'.bin2hex(random_bytes(3)).'-'.$index,
            'customer_id' => $this->account->customer_id,
            'voucher_type' => $index === 0 ? 'deposit' : 'shipping',
            'status' => PaymentVoucher::STATUS_WAITING_PAYMENT,
            'subtotal' => $amount, 'discount_amount' => 0,
            'total_amount' => $amount, 'paid_amount' => 0,
        ]));
        $payload = ['voucher_ids' => $vouchers->pluck('id')->all(), 'idempotency_key' => 'wallet-batch-1'];

        $first = $this->postJson('/customer-portal/finance/payment-vouchers/wallet-checkout', $payload)
            ->assertOk()->assertJsonCount(2, 'intents');
        $this->assertSame(['completed', 'completed'], $first->json('intents.*.status'));
        $this->assertSame(50000, (int) CustomerBalanceLedger::query()
            ->where('customer_id', $this->account->customer_id)->latest('id')->value('balance_after'));

        $this->postJson('/customer-portal/finance/payment-vouchers/wallet-checkout', $payload)
            ->assertOk()->assertJsonCount(2, 'intents');
        $this->assertSame(3, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_valid_signed_incoming_webhook_credits_once_and_duplicate_is_idempotent(): void
    {
        $this->authenticate();
        $reference = $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 250000, 'idempotency_key' => 'topup-webhook-1',
        ])->assertCreated()->json('intent.reference');
        $payload = $this->payload('provider-1001', $reference, 250000);

        $this->signedWebhook($payload)->assertOk()->assertJsonPath('success', true)->assertJsonPath('event_status', 'processed');
        $this->signedWebhook($payload)->assertOk()->assertJsonPath('event_status', 'processed');

        $this->assertSame(1, SepayWebhookEvent::query()->where('provider_transaction_id', 'provider-1001')->count());
        $this->assertSame(1, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
        $this->assertSame(250000, (int) CustomerBalanceLedger::query()->latest('id')->value('balance_after'));
    }

    public function test_amount_mismatch_requires_reconciliation_and_does_not_credit(): void
    {
        $this->authenticate();
        $reference = $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 300000, 'idempotency_key' => 'topup-mismatch-1',
        ])->assertCreated()->json('intent.reference');

        $this->signedWebhook($this->payload('provider-1002', $reference, 299000))
            ->assertOk()->assertJsonPath('event_status', 'reconciliation_needed');
        $this->assertDatabaseHas('sepay_webhook_events', ['provider_transaction_id' => 'provider-1002', 'reconciliation_reason' => 'amount_mismatch']);
        $this->assertSame(0, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_wrong_receiving_account_requires_reconciliation_and_does_not_credit(): void
    {
        $this->authenticate();
        $reference = $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 310000, 'idempotency_key' => 'topup-wrong-account-1',
        ])->assertCreated()->json('intent.reference');
        $payload = $this->payload('provider-wrong-account', $reference, 310000);
        $payload['accountNumber'] = '999999999';

        $this->signedWebhook($payload)
            ->assertOk()->assertJsonPath('event_status', 'reconciliation_needed');
        $this->assertDatabaseHas('sepay_webhook_events', [
            'provider_transaction_id' => 'provider-wrong-account',
            'reconciliation_reason' => 'receiving_account_not_verified',
        ]);
        $this->assertSame(0, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_unknown_reference_requires_reconciliation_and_does_not_credit(): void
    {
        $reference = 'VT'.str_repeat('C', 24);

        $this->signedWebhook($this->payload('provider-unknown-reference', $reference, 320000))
            ->assertOk()->assertJsonPath('event_status', 'reconciliation_needed');
        $this->assertDatabaseHas('sepay_webhook_events', [
            'provider_transaction_id' => 'provider-unknown-reference',
            'reconciliation_reason' => 'intent_not_found',
        ]);
        $this->assertSame(0, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_invalid_signature_and_expired_timestamp_are_rejected_without_persistence(): void
    {
        $payload = $this->payload('provider-1003', 'VT'.str_repeat('A', 24), 100000);
        $raw = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $this->call('POST', '/api/webhooks/sepay', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_X_SEPAY_TIMESTAMP' => (string) now()->timestamp,
            'HTTP_X_SEPAY_SIGNATURE' => 'sha256=invalid',
        ], $raw)->assertUnauthorized();
        $this->assertSame(0, SepayWebhookEvent::query()->count());
    }

    public function test_unverified_payment_account_cannot_issue_real_qr(): void
    {
        Config::set('sepay.verified_accounts', []);
        $this->authenticate();

        $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 100000, 'idempotency_key' => 'unverified-account',
        ])->assertServiceUnavailable();
        $this->assertSame(0, CustomerPaymentIntent::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_same_provider_id_with_changed_payload_is_reconciled_without_double_credit(): void
    {
        $this->authenticate();
        $reference = $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 410000, 'idempotency_key' => 'payload-conflict',
        ])->assertCreated()->json('intent.reference');
        $this->signedWebhook($this->payload('provider-conflict', $reference, 410000))->assertOk();
        $this->signedWebhook($this->payload('provider-conflict', $reference, 420000))
            ->assertOk()->assertJsonPath('event_status', 'reconciliation_needed');

        $this->assertDatabaseHas('sepay_webhook_events', [
            'provider_transaction_id' => 'provider-conflict',
            'reconciliation_reason' => 'provider_payload_conflict',
            'payload_conflict_count' => 1,
        ]);
        $this->assertSame(1, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_cancelled_or_expired_qr_payment_is_retained_for_reconciliation(): void
    {
        $this->authenticate();
        $cancelledReference = $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 120000, 'idempotency_key' => 'cancelled-late',
        ])->assertCreated()->json('intent.reference');
        CustomerPaymentIntent::query()->where('reference', $cancelledReference)->update(['status' => 'cancelled']);
        $this->signedWebhook($this->payload('provider-cancelled', $cancelledReference, 120000))
            ->assertOk()->assertJsonPath('event_status', 'reconciliation_needed');

        $expiredReference = $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 130000, 'idempotency_key' => 'expired-late',
        ])->assertCreated()->json('intent.reference');
        CustomerPaymentIntent::query()->where('reference', $expiredReference)->update(['expires_at' => now()->subMinute()]);
        $payload = $this->payload('provider-expired', $expiredReference, 130000);
        $payload['transactionDate'] = now()->subMinutes(2)->format('Y-m-d H:i:s');
        $this->signedWebhook($payload)->assertOk()->assertJsonPath('event_status', 'reconciliation_needed');

        $this->assertDatabaseHas('sepay_webhook_events', ['provider_transaction_id' => 'provider-cancelled', 'reconciliation_reason' => 'intent_cancelled']);
        $this->assertDatabaseHas('sepay_webhook_events', ['provider_transaction_id' => 'provider-expired', 'reconciliation_reason' => 'expired_intent_payment_before_expiry']);
        $this->assertSame(0, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_event_survives_processing_exception_and_retry_does_not_double_credit(): void
    {
        $this->authenticate();
        $reference = $this->postJson('/customer-portal/finance/top-up-intents', [
            'amount_vnd' => 220000, 'idempotency_key' => 'retry-after-error',
        ])->assertCreated()->json('intent.reference');
        $corrupt = CustomerBalanceLedger::query()->create([
            'customer_id' => $this->account->customer_id, 'type' => 'adjustment', 'amount' => '-1.00',
            'balance_after' => '-1.00', 'description' => 'Fixture phát hiện số dư âm',
        ]);
        $this->signedWebhook($this->payload('provider-retry', $reference, 220000))
            ->assertOk()->assertJsonPath('event_status', 'retryable_failed');
        $event = SepayWebhookEvent::query()->where('provider_transaction_id', 'provider-retry')->firstOrFail();
        $this->assertSame('retryable_failed', $event->status);

        $corrupt->update(['amount' => '0.00', 'balance_after' => '0.00']);
        app(SepayWebhookService::class)->processEvent((int) $event->id, true);
        app(SepayWebhookService::class)->processEvent((int) $event->id, true);

        $this->assertSame('processed', $event->fresh()->status);
        $this->assertSame(220000, (int) CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->latest('id')->value('balance_after'));
        $this->assertSame(2, CustomerBalanceLedger::query()->where('customer_id', $this->account->customer_id)->count());
    }

    public function test_financial_write_guard_rejects_webhook_before_event_is_accepted(): void
    {
        Config::set('business.financial_writes_enabled', false);
        $payload = $this->payload('provider-locked', 'VT'.str_repeat('B', 24), 100000);

        $this->signedWebhook($payload)->assertStatus(423);
        $this->assertSame(0, SepayWebhookEvent::query()->where('provider_transaction_id', 'provider-locked')->count());
    }

    private function authenticate(): void
    {
        $this->actingAs($this->account, 'customer')->withSession([
            'customer_password_fingerprint' => hash('sha256', $this->account->password),
        ]);
    }

    private function payload(string $id, string $reference, int $amount): array
    {
        return [
            'id' => $id, 'gateway' => 'MB', 'transactionDate' => now()->format('Y-m-d H:i:s'),
            'accountNumber' => '123456789', 'code' => $reference, 'content' => $reference,
            'transferType' => 'in', 'transferAmount' => $amount, 'referenceCode' => 'REF-'.$id,
        ];
    }

    private function signedWebhook(array $payload)
    {
        $raw = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $timestamp = (string) now()->timestamp;
        $signature = 'sha256='.hash_hmac('sha256', $timestamp.'.'.$raw, 'test-webhook-secret');

        return $this->call('POST', '/api/webhooks/sepay', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_X_SEPAY_TIMESTAMP' => $timestamp,
            'HTTP_X_SEPAY_SIGNATURE' => $signature,
        ], $raw);
    }
}
