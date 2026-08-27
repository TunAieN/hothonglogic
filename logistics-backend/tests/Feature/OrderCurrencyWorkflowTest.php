<?php

namespace Tests\Feature;

use App\GraphQL\Resolvers\OrderResolver;
use App\Models\Customer;
use App\Models\ExchangeRate;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PaymentAccount;
use App\Models\PaymentVoucher;
use App\Services\Payments\PaymentVoucherService;
use App\Models\Role;
use App\Models\User;
use App\Services\Orders\OrderPricingService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class OrderCurrencyWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    public function test_locks_order_with_active_exchange_rate(): void
    {
        $service = app(OrderPricingService::class);
        $order = $this->createOrderWithItems([
            ['price_cny' => '49.26', 'quantity' => 2],
            ['price_cny' => '17.10', 'quantity' => 1],
        ]);
        $this->createExchangeRate('3600');

        $locked = $service->lockExchangeRateForOrder($order);

        $this->assertSame('3600.0000', (string) $locked->exchange_rate);
        $this->assertNotNull($locked->exchange_rate_locked_at);
        $this->assertSame('115.62', (string) $locked->product_total_cny);
        $this->assertSame(416232, (int) $locked->product_total_vnd);
        $this->assertSame('VND', $locked->currency);
        $this->assertSame('0.00', (string) $locked->total_amount);
        $this->assertSame(354672, (int) $locked->items[0]->subtotal_vnd);
        $this->assertSame(61560, (int) $locked->items[1]->subtotal_vnd);
    }

    public function test_lock_without_active_exchange_rate_fails(): void
    {
        ExchangeRate::query()->update(['is_active' => false]);
        $order = $this->createOrderWithItems([['price_cny' => '49.26', 'quantity' => 1]]);

        $this->expectException(HttpException::class);
        app(OrderPricingService::class)->lockExchangeRateForOrder($order);
    }

    public function test_unlocked_order_writes_product_total_cny_without_legacy_total_amount(): void
    {
        $order = $this->createOrderWithItems([['price_cny' => '49.26', 'quantity' => 1]]);

        $this->assertSame('0.00', (string) $order->total_amount);
        $this->assertSame('49.26', (string) $order->product_total_cny);
        $this->assertSame(0, (int) $order->product_total_vnd);
        $this->assertNull($order->exchange_rate);
        $this->assertNull($order->exchange_rate_locked_at);
        $this->assertSame('CNY', $order->currency);
        $this->assertSame('0.00', (string) $order->items[0]->subtotal_cny);
        $this->assertSame(0, (int) $order->items[0]->subtotal_vnd);
    }

    public function test_backfill_updates_snapshots_without_changing_legacy_total_amount(): void
    {
        $order = $this->createOrderWithItems([['price_cny' => '49.26', 'quantity' => 1]]);
        $order->forceFill([
            'total_amount' => '49.26',
            'product_total_cny' => 0,
            'product_total_vnd' => 0,
            'exchange_rate' => null,
            'exchange_rate_locked_at' => null,
        ])->save();
        $legacyTotal = (string) $order->fresh()->total_amount;

        $this->artisan('orders:backfill-currency', [
            '--exchange-rate' => '3600',
            '--order-id' => [$order->id],
            '--apply' => true,
        ])->assertExitCode(0);

        $backfilled = $order->fresh('items');
        $this->assertSame($legacyTotal, (string) $backfilled->total_amount);
        $this->assertSame('49.26', (string) $backfilled->product_total_cny);
        $this->assertSame(177336, (int) $backfilled->product_total_vnd);
        $this->assertSame('3600.0000', (string) $backfilled->exchange_rate);
        $this->assertNotNull($backfilled->exchange_rate_locked_at);
        $this->assertSame('CNY', $backfilled->currency);
        $this->assertSame('49.26', (string) $backfilled->items[0]->subtotal_cny);
        $this->assertSame(177336, (int) $backfilled->items[0]->subtotal_vnd);
    }

    public function test_locking_multiple_times_keeps_original_snapshot(): void
    {
        $service = app(OrderPricingService::class);
        $order = $this->createOrderWithItems([['price_cny' => '49.26', 'quantity' => 1]]);
        $firstRate = $this->createExchangeRate('3600');

        $locked = $service->lockExchangeRateForOrder($order);
        $firstLockedAt = $locked->exchange_rate_locked_at?->toDateTimeString();

        $firstRate->update(['is_active' => false, 'effective_to' => now()]);
        $this->createExchangeRate('3900');
        $lockedAgain = $service->lockExchangeRateForOrder($locked);

        $this->assertSame('3600.0000', (string) $lockedAgain->exchange_rate);
        $this->assertSame(177336, (int) $lockedAgain->product_total_vnd);
        $this->assertSame($firstLockedAt, $lockedAgain->exchange_rate_locked_at?->toDateTimeString());
    }

    public function test_direct_transition_to_locking_status_locks_exchange_rate(): void
    {
        $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([['price_cny' => '49.26', 'quantity' => 1]], 'pending');

        /** @var OrderResolver $resolver */
        $resolver = app(OrderResolver::class);
        $updated = $resolver->update(null, ['id' => $order->id, 'input' => ['status' => 'awaiting_tracking']]);

        $this->assertSame('awaiting_tracking', $updated->status);
        $this->assertSame('3600.0000', (string) $updated->exchange_rate);
        $this->assertNotNull($updated->exchange_rate_locked_at);
        $this->assertSame(177336, (int) $updated->product_total_vnd);
    }

    public function test_deposit_request_locks_rate_and_calculates_70_percent_snapshot(): void
    {
        $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');

        $updated = app(OrderResolver::class)->update(null, [
            'id' => $order->id,
            'input' => ['status' => 'awaiting_deposit', 'deposit_percent' => 70],
        ]);

        $this->assertSame('awaiting_deposit', $updated->status);
        $this->assertSame('3600.0000', (string) $updated->exchange_rate);
        $this->assertSame('50.00', (string) $updated->product_total_cny);
        $this->assertSame(180000, (int) $updated->product_total_vnd);
        $this->assertSame('70.00', (string) $updated->deposit_percent);
        $this->assertSame(126000, (int) $updated->deposit_amount_vnd);
        $this->assertSame(0, (int) $updated->deposit_paid_amount_vnd);
        $this->assertSame(126000, (int) $updated->deposit_remaining_amount_vnd);
        $this->assertSame('waiting_payment', $updated->deposit_status);
        $this->assertSame('0.00', (string) $updated->total_amount);
        $this->assertNotNull($updated->depositVoucher);
        $this->assertSame('deposit', $updated->depositVoucher->voucher_type);
        $this->assertSame(126000, (int) $updated->depositVoucher->total_amount);
    }

    public function test_create_deposit_voucher_locks_rate_and_snapshots_amounts(): void
    {
        Auth::login($this->createUser(['payment_vouchers.create']));
        $this->createPaymentAccount();
        $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');

        $voucher = app(PaymentVoucherService::class)->createDepositVoucher($order->id, 70);
        $updated = $order->fresh();

        $this->assertSame('deposit', $voucher->voucher_type);
        $this->assertSame((int) $order->id, (int) $voucher->order_id);
        $this->assertSame('50.00', number_format((float) $voucher->base_amount_cny, 2, '.', ''));
        $this->assertSame('3600.0000', number_format((float) $voucher->exchange_rate, 4, '.', ''));
        $this->assertSame(180000, (int) $voucher->base_amount_vnd);
        $this->assertSame(126000, (int) $voucher->total_amount);
        $this->assertSame(0, (int) $voucher->paid_amount);
        $this->assertSame(126000, (int) $voucher->remaining_amount);
        $this->assertSame('waiting_payment', $voucher->status);
        $this->assertSame('awaiting_deposit', $updated->status);
        $this->assertSame(126000, (int) $updated->deposit_amount_vnd);
    }

    public function test_create_deposit_voucher_does_not_duplicate_active_voucher(): void
    {
        Auth::login($this->createUser(['payment_vouchers.create']));
        $this->createPaymentAccount();
        $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');

        $first = app(PaymentVoucherService::class)->createDepositVoucher($order->id, 70);
        $second = app(PaymentVoucherService::class)->createDepositVoucher($order->id, 70);

        $this->assertSame((int) $first->id, (int) $second->id);
        $this->assertSame(1, PaymentVoucher::query()->where('voucher_type', 'deposit')->where('order_id', $order->id)->count());
    }

    public function test_order_deposit_voucher_relation_returns_current_voucher_with_zero_paid(): void
    {
        Auth::login($this->createUser(['payment_vouchers.create']));
        $this->createPaymentAccount();
        $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');

        $voucher = app(PaymentVoucherService::class)->createDepositVoucher($order->id, 70);
        $depositVoucher = $order->fresh()->depositVoucher;

        $this->assertNotNull($depositVoucher);
        $this->assertSame((int) $voucher->id, (int) $depositVoucher->id);
        $this->assertSame('deposit', $depositVoucher->voucher_type);
        $this->assertSame('waiting_payment', $depositVoucher->status);
        $this->assertSame(0, (int) $depositVoucher->paid_amount);
        $this->assertSame(126000, (int) $depositVoucher->remaining_amount);
    }

    public function test_existing_deposit_voucher_repairs_missing_order_snapshot_without_duplicate(): void
    {
        Auth::login($this->createUser(['payment_vouchers.create']));
        $this->createPaymentAccount();
        $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');

        $first = app(PaymentVoucherService::class)->createDepositVoucher($order->id, 70);
        $order->forceFill([
            'deposit_amount_vnd' => 0,
            'deposit_paid_amount_vnd' => 0,
            'deposit_remaining_amount_vnd' => 0,
            'deposit_status' => null,
            'deposit_transfer_content' => null,
        ])->save();

        $second = app(PaymentVoucherService::class)->createDepositVoucher($order->id, 70);
        $repaired = $order->fresh();

        $this->assertSame((int) $first->id, (int) $second->id);
        $this->assertSame(1, PaymentVoucher::query()->where('voucher_type', 'deposit')->where('order_id', $order->id)->count());
        $this->assertSame(126000, (int) $repaired->deposit_amount_vnd);
        $this->assertSame(0, (int) $repaired->deposit_paid_amount_vnd);
        $this->assertSame(126000, (int) $repaired->deposit_remaining_amount_vnd);
        $this->assertSame('waiting_payment', $repaired->deposit_status);
        $this->assertSame($first->transfer_content, $repaired->deposit_transfer_content);
    }
    public function test_create_deposit_voucher_without_active_rate_fails_with_utf8_message(): void
    {
        Auth::login($this->createUser(['payment_vouchers.create']));
        $this->createPaymentAccount();
        ExchangeRate::query()->update(['is_active' => false]);
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');

        try {
            app(PaymentVoucherService::class)->createDepositVoucher($order->id, 70);
            $this->fail('Expected HttpException');
        } catch (HttpException $exception) {
            $this->assertStringContainsString('CNY/VND', $exception->getMessage());
            $this->assertStringNotContainsString('\u', $exception->getMessage());
        }
    }

    public function test_deposit_request_without_active_rate_fails(): void
    {
        ExchangeRate::query()->update(['is_active' => false]);
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');

        $this->expectException(HttpException::class);
        app(OrderResolver::class)->update(null, [
            'id' => $order->id,
            'input' => ['status' => 'awaiting_deposit', 'deposit_percent' => 70],
        ]);
    }

    public function test_deposit_snapshot_does_not_change_when_active_rate_changes(): void
    {
        $firstRate = $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');
        $updated = app(OrderResolver::class)->update(null, [
            'id' => $order->id,
            'input' => ['status' => 'awaiting_deposit', 'deposit_percent' => 70],
        ]);

        $firstRate->update(['is_active' => false, 'effective_to' => now()]);
        $this->createExchangeRate('3900');
        $sameOrder = app(OrderResolver::class)->update(null, [
            'id' => $updated->id,
            'input' => ['status' => 'awaiting_deposit', 'deposit_percent' => 90],
        ]);

        $this->assertSame('3600.0000', (string) $sameOrder->exchange_rate);
        $this->assertSame(126000, (int) $sameOrder->deposit_amount_vnd);
    }

    public function test_deposit_manual_payment_requires_exact_amount_and_creates_transaction(): void
    {
        Auth::login($this->createUser(['payments.all']));
        $this->createPaymentAccount();
        $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');
        $voucher = app(PaymentVoucherService::class)->createDepositVoucher($order->id, 70);

        try {
            app(OrderResolver::class)->confirmDepositPayment(null, [
                'order_id' => $order->id,
                'input' => ['amount_vnd' => 26000, 'transaction_code' => 'BANK-PART'],
            ]);
            $this->fail('Expected partial deposit payment to be rejected.');
        } catch (HttpException $exception) {
            $this->assertStringContainsString('Số tiền thực nhận', $exception->getMessage());
        }

        $paid = app(OrderResolver::class)->confirmDepositPayment(null, [
            'order_id' => $order->id,
            'input' => ['amount_vnd' => 126000, 'transaction_code' => 'BANK-FULL', 'note' => 'Da nhan du tien coc'],
        ]);
        $freshVoucher = $voucher->fresh('transactions');
        $invoice = Invoice::query()->with('items')->where('payment_voucher_id', $voucher->id)->first();

        $this->assertSame('deposited', $paid->status);
        $this->assertSame('paid', $paid->deposit_status);
        $this->assertSame(126000, (int) $paid->deposit_paid_amount_vnd);
        $this->assertSame(0, (int) $paid->deposit_remaining_amount_vnd);
        $this->assertSame('BANK-FULL', $paid->deposit_manual_transaction_code);
        $this->assertSame('paid', $freshVoucher->status);
        $this->assertSame(126000, (int) $freshVoucher->paid_amount);
        $this->assertSame(0, (int) $freshVoucher->remaining_amount);
        $this->assertSame(1, $freshVoucher->transactions->count());
        $this->assertSame(126000, (int) $freshVoucher->transactions[0]->amount);
        $this->assertSame('BANK-FULL', $freshVoucher->transactions[0]->bank_transaction_code);
        $this->assertSame('confirmed', $freshVoucher->transactions[0]->status);
        $this->assertNotNull($invoice);
        $this->assertSame('deposit', $invoice->invoice_type);
        $this->assertSame((int) $order->id, (int) $invoice->order_id);
        $this->assertSame((int) $freshVoucher->transactions[0]->id, (int) $invoice->payment_transaction_id);
        $this->assertSame(126000, (int) $invoice->total_amount);
        $this->assertSame(126000, (int) $invoice->paid_amount);
        $this->assertSame('issued', $invoice->status);
        $this->assertCount(1, $invoice->items);
        $this->assertSame('deposit', $invoice->items[0]->item_type);
        $this->assertSame(126000, (int) $invoice->items[0]->amount);
    }

    public function test_deposit_manual_payment_is_idempotent_and_rejects_reused_bank_code(): void
    {
        Auth::login($this->createUser(['payments.all']));
        $this->createPaymentAccount();
        $this->createExchangeRate('3600');
        $firstOrder = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');
        app(PaymentVoucherService::class)->createDepositVoucher($firstOrder->id, 70);

        app(OrderResolver::class)->confirmDepositPayment(null, [
            'order_id' => $firstOrder->id,
            'input' => ['amount_vnd' => 126000, 'transaction_code' => 'BANK-DUP'],
        ]);

        $retried = app(OrderResolver::class)->confirmDepositPayment(null, [
            'order_id' => $firstOrder->id,
            'input' => ['amount_vnd' => 126000, 'transaction_code' => 'BANK-DUP-2'],
        ]);

        $this->assertSame('deposited', $retried->status);
        $this->assertSame(1, $firstOrder->fresh()->depositVoucher->transactions()->count());
        $this->assertSame(1, Invoice::query()->where('order_id', $firstOrder->id)->where('invoice_type', 'deposit')->count());

        $secondOrder = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');
        app(PaymentVoucherService::class)->createDepositVoucher($secondOrder->id, 70);
        try {
            app(OrderResolver::class)->confirmDepositPayment(null, [
                'order_id' => $secondOrder->id,
                'input' => ['amount_vnd' => 126000, 'transaction_code' => 'BANK-DUP'],
            ]);
            $this->fail('Expected duplicate bank transaction code to be rejected.');
        } catch (HttpException $exception) {
            $this->assertStringContainsString('Mã giao dịch ngân hàng đã tồn tại', $exception->getMessage());
        }
    }

    public function test_deposit_confirmation_repairs_legacy_snapshot_without_voucher(): void
    {
        Auth::login($this->createUser(['payments.all']));
        $this->createPaymentAccount();
        $this->createExchangeRate('3600');
        $order = app(OrderPricingService::class)->lockExchangeRateForOrder(
            $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending'),
        );
        $order->forceFill([
            'status' => 'awaiting_deposit',
            'deposit_percent' => 70,
            'deposit_amount_vnd' => 126000,
            'deposit_paid_amount_vnd' => 0,
            'deposit_remaining_amount_vnd' => 126000,
            'deposit_status' => 'waiting_payment',
        ])->save();

        $this->assertNull($order->fresh()->depositVoucher);

        $confirmed = app(PaymentVoucherService::class)->confirmDepositPayment($order->id, [
            'amount_vnd' => 126000,
            'transaction_code' => 'BANK-LEGACY-REPAIR',
        ]);

        $voucher = $confirmed->depositVoucher;
        $this->assertNotNull($voucher);
        $this->assertSame('deposited', $confirmed->status);
        $this->assertSame('paid', $voucher->status);
        $this->assertSame(1, PaymentVoucher::query()->where('order_id', $order->id)->where('voucher_type', 'deposit')->count());
        $this->assertSame(1, Invoice::query()->where('order_id', $order->id)->where('invoice_type', 'deposit')->count());
    }

    public function test_cannot_mark_deposited_by_status_update_when_deposit_is_not_fully_paid(): void
    {
        $this->createExchangeRate('3600');
        $order = app(OrderResolver::class)->update(null, [
            'id' => $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending')->id,
            'input' => ['status' => 'awaiting_deposit', 'deposit_percent' => 70],
        ]);

        $this->expectException(HttpException::class);
        app(OrderResolver::class)->update(null, [
            'id' => $order->id,
            'input' => ['status' => 'deposited'],
        ]);
    }

    public function test_no_deposit_transition_to_purchasing_locks_exchange_rate(): void
    {
        $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([['price_cny' => '50.00', 'quantity' => 1]], 'pending');

        $updated = app(OrderResolver::class)->update(null, [
            'id' => $order->id,
            'input' => ['status' => 'purchasing'],
        ]);

        $this->assertSame('purchasing', $updated->status);
        $this->assertSame('3600.0000', (string) $updated->exchange_rate);
        $this->assertSame(180000, (int) $updated->product_total_vnd);
        $this->assertSame(0, (int) $updated->deposit_amount_vnd);
    }

    public function test_editing_items_after_exchange_rate_is_locked_is_blocked(): void
    {
        $this->createExchangeRate('3600');
        $order = app(OrderPricingService::class)->lockExchangeRateForOrder(
            $this->createOrderWithItems([['price_cny' => '49.26', 'quantity' => 1]]),
        );

        $this->expectException(HttpException::class);
        app(OrderResolver::class)->update(null, [
            'id' => $order->id,
            'input' => [
                'items' => [[
                    'product_name' => 'Changed item',
                    'price_cny' => 99,
                    'quantity' => 1,
                ]],
            ],
        ]);
    }

    public function test_locking_order_without_items_is_blocked(): void
    {
        $this->createExchangeRate('3600');
        $order = $this->createOrderWithItems([]);

        $this->expectException(HttpException::class);
        app(OrderPricingService::class)->lockExchangeRateForOrder($order);
    }


    public function test_old_order_keeps_snapshot_and_new_order_uses_new_active_rate(): void
    {
        $service = app(OrderPricingService::class);
        $firstRate = $this->createExchangeRate('3600');
        $oldOrder = $service->lockExchangeRateForOrder($this->createOrderWithItems([['price_cny' => '49.26', 'quantity' => 1]]));

        $firstRate->update(['is_active' => false, 'effective_to' => now()]);
        $this->createExchangeRate('3900');
        $newOrder = $service->lockExchangeRateForOrder($this->createOrderWithItems([['price_cny' => '49.26', 'quantity' => 1]]));

        $this->assertSame('3600.0000', (string) $oldOrder->fresh()->exchange_rate);
        $this->assertSame(177336, (int) $oldOrder->fresh()->product_total_vnd);
        $this->assertSame('3900.0000', (string) $newOrder->exchange_rate);
        $this->assertSame(192114, (int) $newOrder->product_total_vnd);
    }

    public function test_product_cny_only_backfill_dry_run_does_not_write_database(): void
    {
        $order = $this->createLegacyOrderMissingProductSnapshot('49.26');

        $this->artisan('orders:backfill-currency', [
            '--product-cny-only' => true,
            '--order-id' => [$order->id],
        ])->assertExitCode(0);

        $fresh = $order->fresh();
        $this->assertSame('0.00', (string) $fresh->product_total_cny);
        $this->assertSame('49.26', (string) $fresh->total_amount);
        $this->assertSame(0, (int) $fresh->product_total_vnd);
        $this->assertNull($fresh->exchange_rate);
        $this->assertNull($fresh->exchange_rate_locked_at);
    }

    public function test_product_cny_only_backfill_updates_explicit_order_without_touching_voucher_or_status(): void
    {
        $order = $this->createLegacyOrderMissingProductSnapshot('49.26', 'receiving');
        $voucher = PaymentVoucher::query()->create([
            'voucher_code' => 'PV-TEST-' . strtoupper(substr(uniqid(), -6)),
            'voucher_type' => 'shipping',
            'customer_id' => $order->customer_id,
            'order_id' => $order->id,
            'currency' => 'VND',
            'status' => 'waiting_payment',
            'total_amount' => 100000,
            'paid_amount' => 0,
            'remaining_amount' => 100000,
        ]);

        $this->artisan('orders:backfill-currency', [
            '--product-cny-only' => true,
            '--order-id' => [$order->id],
            '--allow-payment-voucher' => true,
            '--apply' => true,
        ])->assertExitCode(0);

        $fresh = $order->fresh();
        $freshVoucher = $voucher->fresh();
        $this->assertSame('49.26', (string) $fresh->product_total_cny);
        $this->assertSame('49.26', (string) $fresh->total_amount);
        $this->assertSame(0, (int) $fresh->product_total_vnd);
        $this->assertNull($fresh->exchange_rate);
        $this->assertNull($fresh->exchange_rate_locked_at);
        $this->assertSame('receiving', $fresh->status);
        $this->assertSame(100000, (int) $freshVoucher->total_amount);
        $this->assertSame('waiting_payment', $freshVoucher->status);

        $this->artisan('orders:backfill-currency', [
            '--product-cny-only' => true,
            '--order-id' => [$order->id],
            '--allow-payment-voucher' => true,
            '--apply' => true,
        ])->assertExitCode(0);
        $this->assertSame('49.26', (string) $fresh->fresh()->product_total_cny);
    }

    public function test_backfill_command_rejects_allow_payment_voucher_without_order_id(): void
    {
        $this->artisan('orders:backfill-currency', [
            '--exchange-rate' => '3600',
            '--allow-payment-voucher' => true,
        ])->assertExitCode(1);
    }

    public function test_exchange_rate_management_requires_permission(): void
    {
        $service = app(OrderPricingService::class);
        Auth::login($this->createUser(['orders.all']));

        $this->expectException(HttpException::class);
        $service->createExchangeRate(['rate' => 3600]);
    }

    public function test_exchange_rate_management_allows_authorized_user(): void
    {
        Auth::login($this->createUser(['exchange_rates.manage']));

        $rate = app(OrderPricingService::class)->createExchangeRate(['rate' => 3600]);

        $this->assertSame('CNY', $rate->from_currency);
        $this->assertSame('VND', $rate->to_currency);
        $this->assertTrue((bool) $rate->is_active);
        $this->assertSame('3600.0000', (string) $rate->rate);
    }

    private function createPaymentAccount(): PaymentAccount
    {
        PaymentAccount::query()->update(['is_default' => false]);
        return PaymentAccount::query()->create([
            'bank_name' => 'Vietcombank',
            'bank_code' => 'VCB',
            'account_number' => '123456789',
            'account_holder' => 'CONG TY TEST',
            'is_default' => true,
            'is_active' => true,
        ]);
    }

    private function createExchangeRate(string $rate): ExchangeRate
    {
        ExchangeRate::query()->where('from_currency', 'CNY')->where('to_currency', 'VND')->update(['is_active' => false]);

        return ExchangeRate::query()->create([
            'from_currency' => 'CNY',
            'to_currency' => 'VND',
            'rate' => $rate,
            'effective_from' => now()->subMinute(),
            'is_active' => true,
            'created_by' => null,
        ]);
    }

    private function createOrderWithItems(array $items, string $status = 'pending'): Order
    {
        $user = $this->createUser(['all']);
        $customer = Customer::query()->create([
            'code' => 'CUS' . uniqid(),
            'name' => 'Test customer',
            'phone' => '0900000000',
            'status' => 'active',
        ]);
        $order = Order::query()->create([
            'order_code' => 'ORD-TEST-' . strtoupper(substr(uniqid(), -6)),
            'customer_id' => $customer->id,
            'status' => $status,
            'total_amount' => 0,
            'product_total_cny' => 0,
            'product_total_vnd' => 0,
            'currency' => 'CNY',
            'created_by' => $user->id,
        ]);

        foreach ($items as $index => $item) {
            $createdItem = OrderItem::query()->create([
                'order_id' => $order->id,
                'product_name' => 'Test item ' . ($index + 1),
                'price_cny' => $item['price_cny'],
                'quantity' => $item['quantity'],
            ]);
            app(OrderPricingService::class)->recalculateOrderItemAmounts($createdItem);
        }

        return app(OrderPricingService::class)->recalculateOrderTotals($order->fresh('items'));
    }

    private function createLegacyOrderMissingProductSnapshot(string $legacyTotal, string $status = 'pending'): Order
    {
        $order = $this->createOrderWithItems([['price_cny' => $legacyTotal, 'quantity' => 1]], $status);
        $order->forceFill([
            'total_amount' => $legacyTotal,
            'product_total_cny' => 0,
            'product_total_vnd' => 0,
            'exchange_rate' => null,
            'exchange_rate_locked_at' => null,
            'currency' => 'CNY',
        ])->save();

        return $order->fresh('items');
    }

    private function createUser(array $permissions): User
    {
        $role = Role::query()->create([
            'name' => 'Role ' . uniqid(),
            'permissions' => $permissions,
        ]);

        return User::query()->create([
            'name' => 'Test User',
            'email' => uniqid('user') . '@example.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'status' => 'active',
        ]);
    }
}
