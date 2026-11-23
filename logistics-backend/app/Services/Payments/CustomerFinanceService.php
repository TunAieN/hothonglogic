<?php

namespace App\Services\Payments;

use App\Models\Customer;
use App\Models\CustomerBalanceLedger;
use App\Models\CustomerPaymentIntent;
use App\Models\PaymentAccount;
use App\Models\PaymentVoucher;
use App\Support\BusinessWriteGuard;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CustomerFinanceService
{
    public function __construct(private readonly PaymentVoucherService $vouchers) {}

    public function balance(int $customerId): int
    {
        return max(0, (int) round((float) CustomerBalanceLedger::query()
            ->where('customer_id', $customerId)->latest('id')->value('balance_after')));
    }

    public function createSepayIntent(int $customerId, string $type, int $amountVnd, string $idempotencyKey, ?int $voucherId = null): CustomerPaymentIntent
    {
        BusinessWriteGuard::assertFinancialEnabled(__METHOD__);
        if (! config('sepay.enabled')) {
            throw new HttpException(503, 'Kênh thanh toán SePay chưa được bật.');
        }
        if ($amountVnd <= 0) {
            throw new HttpException(422, 'Số tiền phải là số nguyên VND lớn hơn 0.');
        }

        return DB::transaction(function () use ($customerId, $type, $amountVnd, $idempotencyKey, $voucherId) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
            $existing = CustomerPaymentIntent::query()
                ->where('customer_id', $customerId)->where('idempotency_key', $idempotencyKey)->lockForUpdate()->first();
            if ($existing) {
                if ($existing->type !== $type || (int) $existing->amount_vnd !== $amountVnd || (int) ($existing->payment_voucher_id ?? 0) !== (int) ($voucherId ?? 0)) {
                    throw new HttpException(409, 'Khóa idempotency đã được dùng với dữ liệu khác.');
                }

                return $existing;
            }

            if ($voucherId) {
                $voucher = PaymentVoucher::query()->where('customer_id', $customerId)->lockForUpdate()->findOrFail($voucherId);
                $remaining = (int) round((float) $voucher->remaining_amount);
                if (! in_array($voucher->status, [PaymentVoucher::STATUS_WAITING_PAYMENT, PaymentVoucher::STATUS_PARTIAL_PAID], true) || $remaining <= 0 || $remaining !== $amountVnd) {
                    throw new HttpException(422, 'Phiếu không còn số tiền hợp lệ để thanh toán.');
                }
                CustomerPaymentIntent::query()->where('payment_voucher_id', $voucher->id)->where('status', 'pending')
                    ->update(['status' => 'cancelled']);
            }

            $account = PaymentAccount::query()->where('is_active', true)
                ->whereNotNull('bank_code')->where('bank_code', '!=', '')
                ->whereNotNull('account_number')->where('account_number', '!=', '')
                ->orderByDesc('is_default')->orderBy('id')->lockForUpdate()->first();
            if (! $account) {
                throw new HttpException(503, 'Chưa có tài khoản nhận tiền hợp lệ cho SePay.');
            }

            return CustomerPaymentIntent::query()->create([
                'customer_id' => $customerId,
                'payment_voucher_id' => $voucherId,
                'payment_account_id' => $account->id,
                'type' => $type,
                'provider' => 'sepay',
                'reference' => $this->uniqueReference(),
                'amount_vnd' => $amountVnd,
                'idempotency_key' => $idempotencyKey,
                'status' => 'pending',
                'expires_at' => now()->addMinutes(max(5, (int) config('sepay.intent_ttl_minutes', 30))),
            ]);
        });
    }

    public function payVoucherFromWallet(int $customerId, int $voucherId, string $idempotencyKey): CustomerPaymentIntent
    {
        BusinessWriteGuard::assertFinancialEnabled(__METHOD__);

        return DB::transaction(function () use ($customerId, $voucherId, $idempotencyKey) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
            $existing = CustomerPaymentIntent::query()->where('customer_id', $customerId)
                ->where('idempotency_key', $idempotencyKey)->lockForUpdate()->first();
            if ($existing) {
                if ($existing->type !== 'wallet_voucher_payment' || (int) $existing->payment_voucher_id !== $voucherId) {
                    throw new HttpException(409, 'Khóa idempotency đã được dùng với dữ liệu khác.');
                }

                return $existing;
            }

            $voucher = PaymentVoucher::query()->where('customer_id', $customerId)->lockForUpdate()->findOrFail($voucherId);
            $amount = (int) round((float) $voucher->remaining_amount);
            if ($amount <= 0 || ! in_array($voucher->status, [PaymentVoucher::STATUS_WAITING_PAYMENT, PaymentVoucher::STATUS_PARTIAL_PAID], true)) {
                throw new HttpException(422, 'Phiếu không còn số tiền cần thanh toán.');
            }
            $balance = $this->lockedBalance($customerId);
            if ($balance < $amount) {
                throw new HttpException(422, 'Số dư ví không đủ để thanh toán toàn bộ phiếu.');
            }

            $intent = CustomerPaymentIntent::query()->create([
                'customer_id' => $customerId, 'payment_voucher_id' => $voucher->id,
                'type' => 'wallet_voucher_payment', 'provider' => 'internal_wallet',
                'reference' => $this->uniqueReference('VW'), 'amount_vnd' => $amount,
                'idempotency_key' => $idempotencyKey, 'status' => 'pending', 'expires_at' => now()->addMinutes(5),
            ]);
            $result = $this->vouchers->confirmExactCustomerPayment(
                $voucher->id, $amount, 'customer_balance', 'WALLET-'.$intent->reference, null, now(),
            );
            $ledger = CustomerBalanceLedger::query()->create([
                'customer_id' => $customerId, 'payment_voucher_id' => $voucher->id,
                'transaction_id' => $result['transaction']->id, 'type' => 'debit', 'amount' => $amount,
                'balance_after' => $balance - $amount,
                'description' => 'Thanh toán phiếu '.$voucher->voucher_code.' từ số dư ví.', 'created_by' => null,
            ]);
            $intent->update([
                'status' => 'completed', 'completed_at' => now(),
                'payment_transaction_id' => $result['transaction']->id, 'ledger_id' => $ledger->id,
            ]);

            return $intent->fresh();
        });
    }

    public function qrPayload(CustomerPaymentIntent $intent): array
    {
        $intent->loadMissing('paymentAccount');
        $account = $intent->paymentAccount;
        $query = http_build_query([
            'acc' => $account?->account_number,
            'bank' => $account?->bank_code,
            'amount' => (int) $intent->amount_vnd,
            'des' => $intent->reference,
        ], '', '&', PHP_QUERY_RFC3986);

        return [
            'reference' => $intent->reference, 'amount_vnd' => (int) $intent->amount_vnd,
            'status' => $intent->status, 'expires_at' => $intent->expires_at?->toIso8601String(),
            'bank' => $account ? ['name' => $account->bank_name, 'code' => $account->bank_code, 'account_number' => $account->account_number, 'account_holder' => $account->account_holder] : null,
            'qr_url' => rtrim((string) config('sepay.qr_base_url'), '?').'?'.$query,
        ];
    }

    public function lockedBalance(int $customerId): int
    {
        return max(0, (int) round((float) CustomerBalanceLedger::query()
            ->where('customer_id', $customerId)->lockForUpdate()->latest('id')->value('balance_after')));
    }

    private function uniqueReference(string $prefix = 'VT'): string
    {
        do {
            $reference = $prefix.strtoupper(bin2hex(random_bytes(12)));
        } while (CustomerPaymentIntent::query()->where('reference', $reference)->exists());

        return $reference;
    }
}
