<?php

namespace App\Services\Payments;

use App\Models\Customer;
use App\Models\CustomerBalanceLedger;
use App\Models\CustomerPaymentIntent;
use App\Models\SepayWebhookEvent;
use App\Support\BusinessWriteGuard;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SepayWebhookService
{
    public function __construct(
        private readonly CustomerFinanceService $finance,
        private readonly PaymentVoucherService $vouchers,
    ) {}

    public function ingest(array $payload, string $rawBody): SepayWebhookEvent
    {
        BusinessWriteGuard::assertFinancialEnabled(__METHOD__);
        $providerId = trim((string) ($payload['id'] ?? ''));
        if ($providerId === '' || strlen($providerId) > 100) {
            throw new \InvalidArgumentException('Webhook thiếu mã giao dịch hợp lệ.');
        }

        try {
            return DB::transaction(function () use ($payload, $rawBody, $providerId) {
                $duplicate = SepayWebhookEvent::query()->where('provider_transaction_id', $providerId)->lockForUpdate()->first();
                if ($duplicate) {
                    return $duplicate;
                }

                $amount = $this->integerAmount($payload['transferAmount'] ?? null);
                $reference = $this->extractReference($payload);
                $event = SepayWebhookEvent::query()->create([
                    'provider_transaction_id' => $providerId,
                    'payload_hash' => hash('sha256', $rawBody),
                    'transfer_type' => strtolower(trim((string) ($payload['transferType'] ?? ''))),
                    'account_number' => $this->normalizeAccount($payload['accountNumber'] ?? ''),
                    'amount_vnd' => $amount,
                    'reference' => $reference,
                    'status' => 'received',
                    'occurred_at' => $this->occurredAt($payload['transactionDate'] ?? null),
                    'payload' => array_intersect_key($payload, array_flip([
                        'id', 'gateway', 'transactionDate', 'accountNumber', 'subAccount', 'code',
                        'content', 'transferType', 'description', 'transferAmount', 'referenceCode',
                    ])),
                ]);

                if (($event->transfer_type ?? '') !== 'in') {
                    return $this->reconcile($event, 'not_incoming');
                }
                if ($amount === null || $amount <= 0) {
                    return $this->reconcile($event, 'invalid_amount');
                }
                if (! $reference) {
                    return $this->reconcile($event, 'reference_not_found');
                }

                $intent = CustomerPaymentIntent::query()->where('reference', $reference)->lockForUpdate()->first();
                if (! $intent) {
                    return $this->reconcile($event, 'intent_not_found');
                }
                $event->update(['payment_intent_id' => $intent->id]);
                if ($intent->status === 'completed') {
                    return $this->reconcile($event, 'intent_already_completed');
                }
                if ($intent->status !== 'pending' || $intent->expires_at->isPast()) {
                    if ($intent->status === 'pending') {
                        $intent->update(['status' => 'expired']);
                    }

                    return $this->reconcile($event, 'intent_not_active');
                }
                $intent->loadMissing('paymentAccount');
                if ($this->normalizeAccount($intent->paymentAccount?->account_number) !== $event->account_number) {
                    return $this->reconcile($event, 'receiving_account_mismatch');
                }
                if ((int) $intent->amount_vnd !== $amount) {
                    return $this->reconcile($event, 'amount_mismatch');
                }

                if ($intent->type === 'wallet_topup') {
                    Customer::query()->lockForUpdate()->findOrFail($intent->customer_id);
                    $balance = $this->finance->lockedBalance((int) $intent->customer_id);
                    $ledger = CustomerBalanceLedger::query()->create([
                        'customer_id' => $intent->customer_id, 'payment_voucher_id' => null, 'transaction_id' => null,
                        'type' => 'deposit', 'amount' => $amount, 'balance_after' => $balance + $amount,
                        'description' => 'Nạp tiền qua SePay - '.$intent->reference, 'created_by' => null,
                    ]);
                    $intent->update(['status' => 'completed', 'completed_at' => now(), 'ledger_id' => $ledger->id]);
                } elseif ($intent->type === 'voucher_payment' && $intent->payment_voucher_id) {
                    $result = $this->vouchers->confirmExactCustomerPayment(
                        $intent->payment_voucher_id, $amount, 'bank_transfer',
                        'SEPAY-'.$providerId, $intent->paymentAccount?->bank_name, $event->occurred_at ?? now(),
                    );
                    $intent->update([
                        'status' => 'completed', 'completed_at' => now(),
                        'payment_transaction_id' => $result['transaction']->id,
                    ]);
                } else {
                    return $this->reconcile($event, 'unsupported_intent_type');
                }

                $event->update(['status' => 'processed', 'processed_at' => now(), 'reconciliation_reason' => null]);

                return $event->fresh();
            });
        } catch (QueryException $exception) {
            $duplicate = SepayWebhookEvent::query()->where('provider_transaction_id', $providerId)->first();
            if ($duplicate) {
                return $duplicate;
            }
            throw $exception;
        }
    }

    private function reconcile(SepayWebhookEvent $event, string $reason): SepayWebhookEvent
    {
        $event->update(['status' => 'reconciliation_needed', 'reconciliation_reason' => $reason]);

        return $event->fresh();
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
        if (! is_numeric($value)) {
            return null;
        }
        $number = (float) $value;
        if (! is_finite($number) || $number < 0 || floor($number) !== $number || $number > PHP_INT_MAX) {
            return null;
        }

        return (int) $number;
    }

    private function normalizeAccount(mixed $value): string
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
        } catch (\Throwable) {
            return null;
        }
    }
}
