<?php

namespace App\Services\Payments;

use App\Models\Customer;
use App\Models\CustomerPaymentIntent;
use App\Models\PaymentVoucher;
use App\Models\SepayWebhookEvent;
use App\Support\BusinessWriteGuard;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CustomerFinanceService
{
    public function __construct(
        private readonly PaymentVoucherService $vouchers,
        private readonly CustomerLedgerService $ledger,
        private readonly SepayAccountRegistry $sepayAccounts,
    ) {}

    public function balance(int $customerId): int
    {
        return $this->ledger->balance($customerId);
    }

    public function createSepayIntent(int $customerId, string $type, int $amountVnd, string $idempotencyKey, ?int $voucherId = null): CustomerPaymentIntent
    {
        BusinessWriteGuard::assertFinancialEnabled(__METHOD__);
        if (! config('sepay.enabled')) {
            throw new HttpException(503, 'Kênh thanh toán SePay chưa được bật.');
        }
        if ($amountVnd <= 0 || $amountVnd > CustomerLedgerService::MAX_VND) {
            throw new HttpException(422, 'Số tiền phải là số nguyên VND trong giới hạn an toàn.');
        }

        return DB::transaction(function () use ($customerId, $type, $amountVnd, $idempotencyKey, $voucherId) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
            $existing = CustomerPaymentIntent::query()->where('customer_id', $customerId)
                ->where('idempotency_key', $idempotencyKey)->lockForUpdate()->first();
            if ($existing) {
                if ($existing->type !== $type || (int) $existing->amount_vnd !== $amountVnd
                    || (int) ($existing->payment_voucher_id ?? 0) !== (int) ($voucherId ?? 0)) {
                    throw new HttpException(409, 'Khóa idempotency đã được dùng với dữ liệu khác.');
                }

                return $existing;
            }

            $voucher = null;
            if ($voucherId) {
                $voucher = PaymentVoucher::query()->where('customer_id', $customerId)->lockForUpdate()->findOrFail($voucherId);
                $remaining = $this->voucherRemaining($voucher);
                if (! in_array($voucher->status, [PaymentVoucher::STATUS_WAITING_PAYMENT, PaymentVoucher::STATUS_PARTIAL_PAID], true)
                    || $remaining <= 0 || $remaining !== $amountVnd) {
                    throw new HttpException(422, 'Phiếu không còn số tiền hợp lệ để thanh toán.');
                }
            }

            $account = $this->sepayAccounts->verifiedPaymentAccount();
            $mapping = $this->sepayAccounts->mappingFor($account);
            if (! $account || ! $mapping) {
                throw new HttpException(503, 'Chưa có tài khoản nhận tiền đã xác minh liên kết SePay.');
            }

            if ($voucher) {
                $reusable = CustomerPaymentIntent::query()->where('customer_id', $customerId)
                    ->where('payment_voucher_id', $voucher->id)->where('type', $type)
                    ->where('payment_account_id', $account->id)->where('amount_vnd', $amountVnd)
                    ->where('status', 'pending')->where('expires_at', '>', now())
                    ->lockForUpdate()->latest('id')->first();
                if ($reusable) {
                    return $reusable;
                }
                CustomerPaymentIntent::query()->where('payment_voucher_id', $voucher->id)
                    ->where('status', 'pending')->where('expires_at', '<=', now())
                    ->update(['status' => 'expired']);
            }

            return CustomerPaymentIntent::query()->create([
                'customer_id' => $customerId, 'payment_voucher_id' => $voucherId,
                'payment_account_id' => $account->id, 'type' => $type, 'provider' => 'sepay',
                'reference' => $this->uniqueReference(), 'amount_vnd' => $amountVnd,
                'idempotency_key' => $idempotencyKey, 'status' => 'pending',
                'expires_at' => now()->addMinutes(max(5, (int) config('sepay.intent_ttl_minutes', 30))),
                'metadata' => ['sepay_account_id' => $mapping['sepay_account_id'],
                    'verified_bank_code' => $mapping['bank_code'],
                    'verified_account_number' => $mapping['account_number']],
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
            $amount = $this->voucherRemaining($voucher);
            if ($amount <= 0 || ! in_array($voucher->status, [PaymentVoucher::STATUS_WAITING_PAYMENT, PaymentVoucher::STATUS_PARTIAL_PAID], true)) {
                throw new HttpException(422, 'Phiếu không còn số tiền cần thanh toán.');
            }
            $balance = $this->ledger->balance($customerId, true);
            if ($balance < $amount) {
                throw new HttpException(422, 'Số dư ví không đủ để thanh toán toàn bộ phiếu.');
            }

            $superseded = CustomerPaymentIntent::query()->where('payment_voucher_id', $voucher->id)
                ->where('provider', 'sepay')->where('status', 'pending')->lockForUpdate()->get();
            foreach ($superseded as $oldIntent) {
                $oldIntent->update(['status' => 'cancelled', 'metadata' => [
                    ...(is_array($oldIntent->metadata) ? $oldIntent->metadata : []),
                    'cancelled_reason' => 'paid_by_wallet', 'cancelled_at' => now()->toIso8601String(),
                ]]);
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
            $ledger = $this->ledger->debit(
                $customerId, $amount, 'debit', 'Thanh toán phiếu '.$voucher->voucher_code.' từ số dư ví.',
                $voucher->id, $result['transaction']->id,
            );
            $intent->update(['status' => 'completed', 'completed_at' => now(),
                'payment_transaction_id' => $result['transaction']->id, 'ledger_id' => $ledger->id]);

            return $intent->fresh();
        });
    }

    public function qrPayload(CustomerPaymentIntent $intent): array
    {
        $intent->loadMissing('paymentAccount');
        $account = $intent->paymentAccount;
        $mapping = $this->sepayAccounts->mappingFor($account);
        $eventStatus = SepayWebhookEvent::query()->where('payment_intent_id', $intent->id)->latest('id')->value('status');
        $displayStatus = $eventStatus === 'reconciliation_needed' ? 'reconciliation_needed'
            : ($eventStatus === 'retryable_failed' ? 'confirmation_delayed'
                : ($intent->status === 'pending' && $intent->expires_at?->isPast() ? 'expired' : $intent->status));
        $qrAllowed = $intent->status === 'pending' && $intent->expires_at?->isFuture() && $mapping !== null;
        $query = $qrAllowed ? http_build_query([
            'acc' => $account->account_number, 'bank' => $account->bank_code,
            'amount' => (int) $intent->amount_vnd, 'des' => $intent->reference,
        ], '', '&', PHP_QUERY_RFC3986) : null;

        return [
            'reference' => $intent->reference, 'amount_vnd' => (int) $intent->amount_vnd,
            'status' => $intent->status, 'display_status' => $displayStatus,
            'expires_at' => $intent->expires_at?->toIso8601String(),
            'bank' => $account ? ['name' => $account->bank_name, 'code' => $account->bank_code,
                'account_number' => $account->account_number, 'account_holder' => $account->account_holder] : null,
            'qr_url' => $query ? rtrim((string) config('sepay.qr_base_url'), '?').'?'.$query : null,
        ];
    }

    public function voucherRemaining(PaymentVoucher $voucher): int
    {
        $total = $this->ledger->vnd($voucher->getRawOriginal('total_amount'));
        $paid = $this->ledger->vnd($voucher->getRawOriginal('paid_amount'));

        $remaining = $total - $paid;
        if ($remaining < 0) {
            throw new \LogicException('Phiếu có số tiền đã trả lớn hơn tổng tiền, cần đối soát.');
        }

        return $remaining;
    }

    private function uniqueReference(string $prefix = 'VT'): string
    {
        do {
            $reference = $prefix.strtoupper(bin2hex(random_bytes(12)));
        } while (CustomerPaymentIntent::query()->where('reference', $reference)->exists());

        return $reference;
    }
}
