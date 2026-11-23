<?php

namespace App\Services\Payments;

use App\Models\Customer;
use App\Models\CustomerPaymentIntent;
use App\Models\SepayWebhookEvent;
use App\Support\BusinessWriteGuard;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

class SepayWebhookService
{
    public function __construct(
        private readonly CustomerLedgerService $ledger,
        private readonly PaymentVoucherService $vouchers,
        private readonly SepayAccountRegistry $accounts,
    ) {}

    public function ingest(array $payload, string $rawBody): SepayWebhookEvent
    {
        BusinessWriteGuard::assertFinancialEnabled(__METHOD__);
        $providerId = trim((string) ($payload['id'] ?? ''));
        if ($providerId === '' || strlen($providerId) > 100) {
            throw new \InvalidArgumentException('Webhook thiếu mã giao dịch hợp lệ.');
        }

        try {
            $event = $this->receive($providerId, $payload, $rawBody);
        } catch (QueryException $exception) {
            $event = SepayWebhookEvent::query()->where('provider_transaction_id', $providerId)->first();
            if (! $event) {
                throw $exception;
            }
            if (! hash_equals((string) $event->payload_hash, hash('sha256', $rawBody))) {
                $event = $this->receive($providerId, $payload, $rawBody);
            }
        }
        if (in_array($event->status, ['received', 'retryable_failed'], true)) {
            return $this->processEvent((int) $event->id);
        }

        return $event;
    }

    public function processEvent(int $eventId, bool $manualRetry = false): SepayWebhookEvent
    {
        BusinessWriteGuard::assertFinancialEnabled(__METHOD__);
        $customerId = CustomerPaymentIntent::query()
            ->where('reference', SepayWebhookEvent::query()->whereKey($eventId)->value('reference'))
            ->value('customer_id');

        try {
            return DB::transaction(function () use ($eventId, $manualRetry, $customerId) {
                // All customer-money paths lock the customer before intents,
                // vouchers and ledger rows. This keeps wallet and webhook
                // processing on one deterministic lock order.
                if ($customerId) {
                    Customer::query()->lockForUpdate()->findOrFail($customerId);
                }
                $event = SepayWebhookEvent::query()->lockForUpdate()->findOrFail($eventId);
                if ($event->status === 'processed') {
                    return $event;
                }
                if (! in_array($event->status, ['received', 'retryable_failed'], true)) {
                    return $event;
                }
                if (! $manualRetry && $event->next_retry_at?->isFuture()) {
                    return $event;
                }

                $event->update([
                    'status' => 'processing',
                    'attempt_count' => (int) $event->attempt_count + 1,
                    'last_attempt_at' => now(),
                    'next_retry_at' => null,
                    'processing_history' => $this->history($event, 'processing', $manualRetry ? 'manual_retry' : 'automatic'),
                ]);

                if (($event->transfer_type ?? '') !== 'in') {
                    return $this->reconcile($event, 'not_incoming');
                }
                if ($event->amount_vnd === null || (int) $event->amount_vnd <= 0) {
                    return $this->reconcile($event, 'invalid_amount');
                }
                if (! $event->reference) {
                    return $this->reconcile($event, 'reference_not_found');
                }

                $intent = CustomerPaymentIntent::query()->where('reference', $event->reference)->lockForUpdate()->first();
                if (! $intent) {
                    return $this->reconcile($event, 'intent_not_found');
                }
                $event->update(['payment_intent_id' => $intent->id]);
                if ($intent->status === 'completed') {
                    return $this->reconcile($event, 'intent_already_completed');
                }
                if ($intent->status === 'cancelled') {
                    return $this->reconcile($event, 'intent_cancelled');
                }
                if ($intent->status === 'expired' || ($intent->status === 'pending' && $intent->expires_at->isPast())) {
                    if ($intent->status === 'pending') {
                        $intent->update(['status' => 'expired']);
                    }
                    $reason = $this->occurredBeforeExpiry($event, $intent)
                        ? 'expired_intent_payment_before_expiry'
                        : 'intent_expired';

                    return $this->reconcile($event, $reason);
                }
                if ($intent->status !== 'pending') {
                    return $this->reconcile($event, 'intent_not_active');
                }

                $intent->loadMissing('paymentAccount');
                if (! $intent->paymentAccount
                    || ! $this->accounts->webhookMatches($intent->paymentAccount, $event->bank_code, (string) $event->account_number)) {
                    return $this->reconcile($event, 'receiving_account_not_verified');
                }
                if ((int) $intent->amount_vnd !== (int) $event->amount_vnd) {
                    return $this->reconcile($event, 'amount_mismatch');
                }

                if ($intent->type === 'wallet_topup') {
                    $ledger = $this->ledger->credit(
                        (int) $intent->customer_id, (int) $event->amount_vnd, 'deposit',
                        'Nạp tiền qua SePay - '.$intent->reference,
                    );
                    $intent->update(['status' => 'completed', 'completed_at' => now(), 'ledger_id' => $ledger->id]);
                } elseif ($intent->type === 'voucher_payment' && $intent->payment_voucher_id) {
                    $result = $this->vouchers->confirmExactCustomerPayment(
                        $intent->payment_voucher_id, (int) $event->amount_vnd, 'bank_transfer',
                        'SEPAY-'.$event->provider_transaction_id, $intent->paymentAccount->bank_name,
                        $event->occurred_at ?? now(),
                    );
                    $intent->update(['status' => 'completed', 'completed_at' => now(),
                        'payment_transaction_id' => $result['transaction']->id]);
                } else {
                    return $this->reconcile($event, 'unsupported_intent_type');
                }

                $event->update([
                    'status' => 'processed', 'processed_at' => now(), 'reconciliation_reason' => null,
                    'last_error_code' => null, 'last_error_message' => null,
                    'processing_history' => $this->history($event, 'processed'),
                ]);

                return $event->fresh();
            });
        } catch (Throwable $exception) {
            return $this->recordProcessingFailure($eventId, $exception);
        }
    }

    public function retryDue(int $limit = 100): int
    {
        $ids = SepayWebhookEvent::query()->whereIn('status', ['received', 'retryable_failed'])
            ->where('attempt_count', '<', max(1, (int) config('sepay.max_auto_attempts', 7)))
            ->where(fn ($query) => $query->whereNull('next_retry_at')->orWhere('next_retry_at', '<=', now()))
            ->orderBy('id')->limit(max(1, min($limit, 500)))->pluck('id');
        foreach ($ids as $id) {
            $this->processEvent((int) $id);
        }

        return $ids->count();
    }

    private function receive(string $providerId, array $payload, string $rawBody): SepayWebhookEvent
    {
        $hash = hash('sha256', $rawBody);

        return DB::transaction(function () use ($providerId, $payload, $hash) {
            $existing = SepayWebhookEvent::query()->where('provider_transaction_id', $providerId)->lockForUpdate()->first();
            if ($existing) {
                if (! hash_equals((string) $existing->payload_hash, $hash)) {
                    $existing->update([
                        'status' => 'reconciliation_needed',
                        'reconciliation_reason' => 'provider_payload_conflict',
                        'payload_conflict_count' => (int) $existing->payload_conflict_count + 1,
                        'processing_history' => $this->history($existing, 'reconciliation_needed', 'provider_payload_conflict'),
                    ]);
                }

                return $existing->fresh();
            }

            $reference = $this->extractReference($payload);
            $event = SepayWebhookEvent::query()->create([
                'provider_transaction_id' => $providerId,
                'payment_intent_id' => $reference
                    ? CustomerPaymentIntent::query()->where('reference', $reference)->value('id')
                    : null,
                'payload_hash' => $hash,
                'transfer_type' => strtolower(trim((string) ($payload['transferType'] ?? ''))),
                'bank_code' => $this->normalize($payload['gateway'] ?? ''),
                'account_number' => $this->normalize($payload['accountNumber'] ?? ''),
                'amount_vnd' => $this->integerAmount($payload['transferAmount'] ?? null),
                'reference' => $reference,
                'status' => 'received',
                'occurred_at' => $this->occurredAt($payload['transactionDate'] ?? null),
                'payload' => array_intersect_key($payload, array_flip([
                    'id', 'gateway', 'transactionDate', 'accountNumber', 'subAccount', 'code',
                    'content', 'transferType', 'description', 'transferAmount', 'referenceCode',
                ])),
                'processing_history' => [['at' => now()->toIso8601String(), 'status' => 'received']],
            ]);

            return $event;
        });
    }

    private function recordProcessingFailure(int $eventId, Throwable $exception): SepayWebhookEvent
    {
        try {
            return DB::transaction(function () use ($eventId, $exception) {
                $event = SepayWebhookEvent::query()->lockForUpdate()->findOrFail($eventId);
                if ($event->status === 'processed') {
                    return $event;
                }
                $intentId = $event->payment_intent_id ?: CustomerPaymentIntent::query()
                    ->where('reference', $event->reference)->value('id');
                $businessFailure = $exception instanceof HttpException && $exception->getStatusCode() >= 400
                    && $exception->getStatusCode() < 500;
                $status = $businessFailure ? 'reconciliation_needed' : 'retryable_failed';
                $code = $businessFailure ? 'voucher_processing_rejected'
                    : ($exception instanceof QueryException ? 'database_temporarily_unavailable' : 'processing_exception');
                $event->update([
                    'status' => $status,
                    'payment_intent_id' => $intentId,
                    'reconciliation_reason' => $businessFailure ? $code : null,
                    'attempt_count' => max(1, (int) $event->attempt_count),
                    'last_attempt_at' => now(),
                    'next_retry_at' => $businessFailure ? null : now()->addSeconds(max(30, (int) config('sepay.retry_delay_seconds', 60))),
                    'last_error_code' => $code,
                    'last_error_message' => $businessFailure ? 'Nghiệp vụ phiếu không còn phù hợp để tự động thanh toán.' : 'Lỗi kỹ thuật khi xử lý; event đã được lưu để retry.',
                    'processing_history' => $this->history($event, $status, $code),
                ]);

                return $event->fresh();
            });
        } catch (Throwable) {
            throw $exception;
        }
    }

    private function reconcile(SepayWebhookEvent $event, string $reason): SepayWebhookEvent
    {
        $event->update([
            'status' => 'reconciliation_needed', 'reconciliation_reason' => $reason,
            'next_retry_at' => null, 'processing_history' => $this->history($event, 'reconciliation_needed', $reason),
        ]);

        return $event->fresh();
    }

    private function history(SepayWebhookEvent $event, string $status, ?string $reason = null): array
    {
        $history = is_array($event->processing_history) ? $event->processing_history : [];
        $history[] = array_filter(['at' => now()->toIso8601String(), 'status' => $status, 'reason' => $reason]);

        return array_slice($history, -50);
    }

    private function occurredBeforeExpiry(SepayWebhookEvent $event, CustomerPaymentIntent $intent): bool
    {
        $occurred = $event->occurred_at;
        if (! $occurred || $occurred->isAfter($event->created_at->copy()->addMinutes(5))
            || $occurred->isBefore($event->created_at->copy()->subDays(30))) {
            return false;
        }

        return $occurred->lessThanOrEqualTo($intent->expires_at);
    }

    private function extractReference(array $payload): ?string
    {
        foreach ([$payload['code'] ?? null, $payload['content'] ?? null, $payload['description'] ?? null] as $value) {
            if (preg_match('/VT[0-9A-F]{24}/i', (string) $value, $matches)) {
                return strtoupper($matches[0]);
            }
        }

        return null;
    }

    private function integerAmount(mixed $value): ?int
    {
        try {
            $amount = $this->ledger->vnd($value);

            return $amount >= 0 ? $amount : null;
        } catch (Throwable) {
            return null;
        }
    }

    private function normalize(mixed $value): string
    {
        return strtoupper(preg_replace('/\s+/', '', trim((string) $value)) ?? '');
    }

    private function occurredAt(mixed $value): ?Carbon
    {
        if (! $value) {
            return null;
        }
        try {
            return Carbon::parse((string) $value);
        } catch (Throwable) {
            return null;
        }
    }
}
