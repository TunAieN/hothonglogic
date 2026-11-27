<?php

namespace App\Services\Payments;

use App\Models\Customer;
use App\Models\CustomerPaymentIntent;
use App\Models\PaymentVoucher;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class DepositPaymentAutomationService
{
    public function __construct(
        private readonly SepayAccountRegistry $accounts,
        private readonly CustomerNotificationService $notifications,
    ) {}

    public function enabled(): bool
    {
        return config('sepay.deposit_auto_confirmation_enabled') === true;
    }

    public function prepare(PaymentVoucher $voucher): ?CustomerPaymentIntent
    {
        if (! $this->enabled()) {
            $this->notifications->depositRequested($voucher, null);

            return null;
        }

        return DB::transaction(function () use ($voucher) {
            Customer::query()->lockForUpdate()->findOrFail($voucher->customer_id);
            $locked = PaymentVoucher::query()->with(['paymentAccount', 'order'])->lockForUpdate()->findOrFail($voucher->id);
            if ($locked->voucher_type !== 'deposit' || $locked->status !== PaymentVoucher::STATUS_WAITING_PAYMENT) {
                throw new HttpException(422, 'Phiếu không đủ điều kiện chuẩn bị đối soát đặt cọc tự động.');
            }
            $amount = (int) round((float) $locked->remaining_amount);
            if ($amount <= 0) {
                throw new HttpException(422, 'Phiếu đặt cọc không có số tiền hợp lệ để đối soát.');
            }
            $account = $locked->paymentAccount;
            $mapping = $this->accounts->mappingFor($account);
            if (! $account || ! $mapping) {
                throw new HttpException(503, 'Tài khoản nhận tiền của phiếu chưa được xác minh với SePay.');
            }
            $intent = CustomerPaymentIntent::query()->where('payment_voucher_id', $locked->id)
                ->where('type', 'voucher_payment')->where('provider', 'sepay')
                ->where('payment_account_id', $account->id)->where('amount_vnd', $amount)
                ->where('status', 'pending')->where('expires_at', '>', now())
                ->lockForUpdate()->latest('id')->first();
            if (! $intent) {
                $intent = CustomerPaymentIntent::query()->create([
                    'customer_id' => $locked->customer_id,
                    'payment_voucher_id' => $locked->id,
                    'payment_account_id' => $account->id,
                    'type' => 'voucher_payment',
                    'provider' => 'sepay',
                    'reference' => $this->uniqueReference(),
                    'amount_vnd' => $amount,
                    'idempotency_key' => 'deposit-voucher-'.$locked->id.'-v1',
                    'status' => 'pending',
                    'expires_at' => now()->addMinutes(max(60, (int) config('sepay.deposit_intent_ttl_minutes', 10080))),
                    'metadata' => [
                        'purpose' => 'order_deposit',
                        'sepay_account_id' => $mapping['sepay_account_id'],
                        'verified_bank_code' => $mapping['bank_code'],
                        'verified_account_number' => $mapping['account_number'],
                    ],
                ]);
            }
            $locked->update(['transfer_content' => $intent->reference]);
            $this->notifications->depositRequested($locked, $intent->reference);

            return $intent;
        });
    }

    private function uniqueReference(): string
    {
        do {
            $reference = 'VT'.strtoupper(bin2hex(random_bytes(12)));
        } while (CustomerPaymentIntent::query()->where('reference', $reference)->exists());

        return $reference;
    }
}
