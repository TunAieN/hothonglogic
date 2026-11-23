<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerBalanceLedger;
use App\Models\CustomerPaymentIntent;
use App\Models\PaymentAccount;
use App\Models\SepayWebhookEvent;
use App\Services\Payments\SepayWebhookService;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CustomerFinanceConcurrencyTest extends TestCase
{
    /** @var array<int, array{customer: Customer, account: PaymentAccount, intents: array, events: array}> */
    private array $fixtures = [];

    protected function tearDown(): void
    {
        if ($this->fixtures !== []) {
            DB::reconnect();
            foreach (array_reverse($this->fixtures) as $fixture) {
                SepayWebhookEvent::query()->whereIn('id', $fixture['events'])->delete();
                CustomerPaymentIntent::query()->whereIn('id', $fixture['intents'])->delete();
                CustomerBalanceLedger::query()->where('customer_id', $fixture['customer']->id)->delete();
                $fixture['account']->delete();
                $fixture['customer']->delete();
            }
        }

        parent::tearDown();
    }

    public function test_two_workers_processing_the_same_event_credit_only_once(): void
    {
        $this->requireForkingMysqlQa();
        $fixture = $this->fixture([180000]);

        $this->runConcurrently([$fixture['events'][0], $fixture['events'][0]]);

        $this->assertSame('processed', SepayWebhookEvent::query()->findOrFail($fixture['events'][0])->status);
        $this->assertSame(1, CustomerBalanceLedger::query()->where('customer_id', $fixture['customer']->id)->count());
        $this->assertSame(180000, (int) CustomerBalanceLedger::query()->where('customer_id', $fixture['customer']->id)->value('balance_after'));
    }

    public function test_two_different_webhooks_for_one_customer_keep_a_serial_ledger_balance(): void
    {
        $this->requireForkingMysqlQa();
        $fixture = $this->fixture([125000, 275000]);

        $this->runConcurrently($fixture['events']);

        $rows = CustomerBalanceLedger::query()->where('customer_id', $fixture['customer']->id)
            ->orderBy('id')->get(['amount', 'balance_after']);
        $this->assertCount(2, $rows);
        $this->assertSame(400000, (int) $rows->last()->balance_after);
        $this->assertSame(
            400000,
            $rows->sum(fn (CustomerBalanceLedger $row) => (int) $row->amount),
        );
        $this->assertSame(2, SepayWebhookEvent::query()->whereIn('id', $fixture['events'])->where('status', 'processed')->count());
    }

    private function requireForkingMysqlQa(): void
    {
        if (PHP_OS_FAMILY === 'Windows' || ! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Concurrency test requires pcntl on the Linux MySQL QA runner.');
        }
        $this->assertApprovedMysqlTestConnection();
    }

    /** @return array{customer: Customer, account: PaymentAccount, intents: array<int, int>, events: array<int, int>} */
    private function fixture(array $amounts): array
    {
        $suffix = bin2hex(random_bytes(6));
        $customer = Customer::query()->create([
            'code' => 'CON-'.$suffix,
            'name' => 'Concurrency QA',
            'email' => 'con-'.$suffix.'@example.test',
            'phone' => '09'.substr(preg_replace('/\D/', '', $suffix), 0, 8),
            'status' => 'active',
        ]);
        $account = PaymentAccount::query()->create([
            'bank_name' => 'MySQL QA Bank',
            'bank_code' => 'MB',
            'account_number' => 'QA'.$suffix,
            'account_holder' => 'VIETTRUNG QA',
            'is_default' => false,
            'is_active' => true,
        ]);
        config(['sepay.verified_accounts' => [[
            'enabled' => true,
            'payment_account_id' => $account->id,
            'sepay_account_id' => 'qa-'.$suffix,
            'bank_code' => 'MB',
            'account_number' => $account->account_number,
        ]]]);

        $intentIds = [];
        $eventIds = [];
        foreach ($amounts as $index => $amount) {
            $reference = 'VT'.strtoupper(bin2hex(random_bytes(12)));
            $intent = CustomerPaymentIntent::query()->create([
                'customer_id' => $customer->id,
                'payment_account_id' => $account->id,
                'type' => 'wallet_topup',
                'provider' => 'sepay',
                'reference' => $reference,
                'amount_vnd' => $amount,
                'idempotency_key' => 'concurrency-'.$suffix.'-'.$index,
                'status' => 'pending',
                'expires_at' => now()->addHour(),
            ]);
            $event = SepayWebhookEvent::query()->create([
                'provider_transaction_id' => 'provider-'.$suffix.'-'.$index,
                'payload_hash' => hash('sha256', $suffix.'-'.$index),
                'transfer_type' => 'in',
                'bank_code' => 'MB',
                'account_number' => $account->account_number,
                'amount_vnd' => $amount,
                'reference' => $reference,
                'status' => 'received',
                'occurred_at' => now(),
                'payload' => ['fixture' => 'mysql-concurrency'],
                'processing_history' => [['at' => now()->toIso8601String(), 'status' => 'received']],
            ]);
            $intentIds[] = (int) $intent->id;
            $eventIds[] = (int) $event->id;
        }

        $fixture = ['customer' => $customer, 'account' => $account, 'intents' => $intentIds, 'events' => $eventIds];
        $this->fixtures[] = $fixture;

        return $fixture;
    }

    private function runConcurrently(array $eventIds): void
    {
        DB::disconnect();
        $children = [];
        foreach ($eventIds as $eventId) {
            $pid = pcntl_fork();
            if ($pid === -1) {
                $this->fail('Không thể tạo worker concurrency.');
            }
            if ($pid === 0) {
                try {
                    DB::reconnect();
                    app(SepayWebhookService::class)->processEvent((int) $eventId, true);
                    exit(0);
                } catch (\Throwable) {
                    exit(1);
                }
            }
            $children[] = $pid;
        }

        foreach ($children as $pid) {
            pcntl_waitpid($pid, $status);
            $this->assertTrue(pcntl_wifexited($status) && pcntl_wexitstatus($status) === 0, 'Worker concurrency thất bại.');
        }
        DB::reconnect();
    }
}
