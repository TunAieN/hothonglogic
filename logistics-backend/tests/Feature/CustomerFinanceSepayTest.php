<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAccount;
use App\Models\CustomerBalanceLedger;
use App\Models\CustomerPaymentIntent;
use App\Models\PaymentAccount;
use App\Models\SepayWebhookEvent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class CustomerFinanceSepayTest extends TestCase
{
    use DatabaseTransactions;

    private CustomerAccount $account;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('sepay.enabled', true);
        Config::set('sepay.webhook_secret', 'test-webhook-secret');
        Config::set('sepay.timestamp_tolerance_seconds', 300);
        $customer = Customer::query()->create([
            'code' => 'CUS-FIN-'.bin2hex(random_bytes(3)), 'name' => 'Khách tài chính',
            'email' => bin2hex(random_bytes(4)).'@example.test', 'phone' => '0900000000', 'status' => 'active',
        ]);
        $this->account = CustomerAccount::query()->create([
            'customer_id' => $customer->id, 'email' => $customer->email, 'phone_e164' => '+84900000000',
            'password' => 'VeryStrongPassword!123', 'status' => 'active', 'email_verified_at' => now(),
        ]);
        PaymentAccount::query()->create([
            'bank_name' => 'Ngân hàng QA', 'bank_code' => 'MB', 'account_number' => '123456789',
            'account_holder' => 'VIETTRUNG QA', 'is_default' => true, 'is_active' => true,
        ]);
    }

    public function test_topup_intent_is_idempotent_and_owned_by_authenticated_customer(): void
    {
        $this->authenticate();
        $payload = ['amount_vnd' => 500000, 'idempotency_key' => 'topup-idempotent-1'];
        $first = $this->postJson('/customer-portal/finance/top-up-intents', $payload)->assertCreated()->json('intent.reference');
        $second = $this->postJson('/customer-portal/finance/top-up-intents', $payload)->assertCreated()->json('intent.reference');
        $this->assertSame($first, $second);
        $this->assertSame(1, CustomerPaymentIntent::query()->where('customer_id', $this->account->customer_id)->count());
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
