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
    public const MIN_TOPUP_VND = 1000;

    public const MAX_TOPUP_VND = 999999999999;

    public const TOPUP_STEP_VND = 1;

    public function __construct(
        private readonly PaymentVoucherService $vouchers,
        private readonly CustomerLedgerService $ledger,
        private readonly SepayAccountRegistry $sepayAccounts,
        private readonly CustomerNotificationService $notifications,
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
                    if ($voucher->voucher_type !== 'deposit') {
                        $this->notifications->voucherPaymentRequested($voucher, $reusable->reference);
                    }
                    return $reusable;
                }
                CustomerPaymentIntent::query()->where('payment_voucher_id', $voucher->id)
                    ->where('status', 'pending')->where('expires_at', '<=', now())
                    ->update(['status' => 'expired']);
            }

            $intent = CustomerPaymentIntent::query()->create([
                'customer_id' => $customerId, 'payment_voucher_id' => $voucherId,
                'payment_account_id' => $account->id, 'type' => $type, 'provider' => 'sepay',
                'reference' => $this->uniqueReference(), 'amount_vnd' => $amountVnd,
                'idempotency_key' => $idempotencyKey, 'status' => 'pending',
                'expires_at' => now()->addMinutes(max(5, (int) config('sepay.intent_ttl_minutes', 30))),
                'metadata' => ['sepay_account_id' => $mapping['sepay_account_id'],
                    'verified_bank_code' => $mapping['bank_code'],
                    'verified_account_number' => $mapping['account_number']],
            ]);
            if ($voucher && $voucher->voucher_type !== 'deposit') {
                $this->notifications->voucherPaymentRequested($voucher, $intent->reference);
            }

            return $intent;
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
            if ($result['voucher']->voucher_type === 'deposit') {
                $this->notifications->depositPaid($result['voucher'], $result['transaction']);
            } else {
                $this->notifications->voucherPaid($result['voucher'], $result['transaction']);
            }

            return $intent->fresh();
        });
    }

    /**
     * Pay several customer-owned vouchers as one atomic wallet checkout.
     * Each voucher keeps its own intent/ledger link; the outer transaction
     * guarantees that a validation or balance failure rolls the whole batch back.
     *
     * @param  array<int, int>  $voucherIds
     * @return array<int, CustomerPaymentIntent>
     */
    public function payVouchersFromWallet(int $customerId, array $voucherIds, string $idempotencyKey): array
    {
        BusinessWriteGuard::assertFinancialEnabled(__METHOD__);

        return DB::transaction(function () use ($customerId, $voucherIds, $idempotencyKey) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
            $ids = array_values(array_unique(array_map('intval', $voucherIds)));
            $vouchers = PaymentVoucher::query()->where('customer_id', $customerId)
                ->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            if ($vouchers->count() !== count($ids)) {
                throw new HttpException(404, 'Có phiếu thanh toán không tồn tại hoặc không thuộc tài khoản.');
            }

            $keys = collect($ids)->mapWithKeys(fn (int $id) => [$id => hash('sha256', $idempotencyKey.':'.$id)]);
            $existing = CustomerPaymentIntent::query()->where('customer_id', $customerId)
                ->whereIn('idempotency_key', $keys->values())->lockForUpdate()->get()->keyBy('payment_voucher_id');
            if ($existing->count() === count($ids)) {
                return collect($ids)->map(fn (int $id) => $existing->get($id))->all();
            }

            $total = 0;
            foreach ($vouchers as $voucher) {
                if ($existing->has($voucher->id)) {
                    continue;
                }
                $remaining = $this->voucherRemaining($voucher);
                if ($remaining <= 0 || ! in_array($voucher->status, [PaymentVoucher::STATUS_WAITING_PAYMENT, PaymentVoucher::STATUS_PARTIAL_PAID], true)) {
                    throw new HttpException(422, 'Danh sách có phiếu không còn đủ điều kiện thanh toán.');
                }
                $total += $remaining;
            }
            if ($this->ledger->balance($customerId, true) < $total) {
                throw new HttpException(422, 'Số dư ví không đủ để thanh toán các phiếu đã chọn.');
            }

            return $vouchers->map(fn (PaymentVoucher $voucher) => $this->payVoucherFromWallet(
                $customerId,
                $voucher->id,
                $keys->get($voucher->id),
            ))->all();
        }, 3);
    }

    public function qrPayload(CustomerPaymentIntent $intent): array
    {
        $intent->loadMissing('paymentAccount');
        $account = $intent->paymentAccount;
        $mapping = $this->sepayAccounts->mappingFor($account);
        $eventStatus = $intent->relationLoaded('webhookEvents')
            ? $intent->webhookEvents->first()?->status
            : SepayWebhookEvent::query()->where('payment_intent_id', $intent->id)->latest('id')->value('status');
        $displayStatus = $eventStatus === 'reconciliation_needed' ? 'reconciliation_needed'
            : ($eventStatus === 'retryable_failed' ? 'confirmation_delayed'
                : ($intent->status === 'pending' && $intent->expires_at?->isPast() ? 'expired' : $intent->status));
        $qrAllowed = $intent->status === 'pending' && $intent->expires_at?->isFuture() && $mapping !== null;
        $query = $qrAllowed ? http_build_query([
            'amount' => (int) $intent->amount_vnd,
            'addInfo' => $intent->reference,
            'accountName' => $account->account_holder,
        ], '', '&', PHP_QUERY_RFC3986) : null;
        $qrUrl = $query ? sprintf(
            '%s/%s-%s-compact2.svg?%s',
            rtrim((string) config('sepay.qr_base_url'), '/'),
            rawurlencode((string) $account->bank_code),
            rawurlencode((string) $account->account_number),
            $query,
        ) : null;

        return [
            'reference' => $intent->reference, 'amount_vnd' => (int) $intent->amount_vnd,
            'type' => $intent->type, 'provider' => $intent->provider,
            'status' => $intent->status, 'display_status' => $displayStatus,
            'expires_at' => $intent->expires_at?->toIso8601String(),
            'created_at' => $intent->created_at?->toIso8601String(),
            'completed_at' => $intent->completed_at?->toIso8601String(),
            'bank' => $account ? ['name' => $account->bank_name, 'code' => $account->bank_code,
                'account_number' => $account->account_number, 'account_holder' => $account->account_holder] : null,
            'qr_url' => $qrUrl,
        ];
    }

    public function expirePendingIntents(int $limit = 500): int
    {
        BusinessWriteGuard::assertFinancialEnabled(__METHOD__);

        return DB::transaction(function () use ($limit) {
            $intents = CustomerPaymentIntent::query()
                ->where('status', 'pending')
                ->where('expires_at', '<=', now())
                ->orderBy('id')
                ->limit(max(1, min($limit, 2000)))
                ->lockForUpdate()
                ->get();

            foreach ($intents as $intent) {
                $intent->update(['status' => 'expired']);
            }

            return $intents->count();
        });
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
