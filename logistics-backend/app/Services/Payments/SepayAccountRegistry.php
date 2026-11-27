<?php

namespace App\Services\Payments;

use App\Models\PaymentAccount;

final class SepayAccountRegistry
{
    public function verifiedPaymentAccount(bool $lock = true): ?PaymentAccount
    {
        $ids = collect($this->entries())->pluck('payment_account_id')->map(fn ($id) => (int) $id)->filter()->all();
        if ($ids === []) {
            return null;
        }

        $query = PaymentAccount::query()->whereIn('id', $ids)->where('is_active', true)
            ->orderByDesc('is_default')->orderBy('id');
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->get()
            ->first(fn (PaymentAccount $account) => $this->mappingFor($account) !== null);
    }

    public function hasVerifiedPaymentAccount(): bool
    {
        return $this->verifiedPaymentAccount(false) !== null;
    }

    public function mappingFor(?PaymentAccount $account): ?array
    {
        if (! $account || ! $account->is_active) {
            return null;
        }
        foreach ($this->entries() as $entry) {
            if (! ($entry['enabled'] ?? false) || (int) ($entry['payment_account_id'] ?? 0) !== (int) $account->id) {
                continue;
            }
            $providerAccountId = trim((string) ($entry['sepay_account_id'] ?? ''));
            $bankCode = $this->normalize((string) ($entry['bank_code'] ?? ''));
            $accountNumber = $this->normalize((string) ($entry['account_number'] ?? ''));
            if ($providerAccountId === '' || $bankCode === '' || $accountNumber === '') {
                continue;
            }
            if ($bankCode !== $this->normalize((string) $account->bank_code)
                || $accountNumber !== $this->normalize((string) $account->account_number)) {
                continue;
            }

            return ['payment_account_id' => (int) $account->id, 'sepay_account_id' => $providerAccountId,
                'bank_code' => $bankCode, 'account_number' => $accountNumber];
        }

        return null;
    }

    public function webhookMatches(PaymentAccount $account, ?string $bankCode, string $accountNumber): bool
    {
        $mapping = $this->mappingFor($account);

        return $mapping !== null && $mapping['bank_code'] === $this->normalize((string) $bankCode)
            && $mapping['account_number'] === $this->normalize($accountNumber);
    }

    private function entries(): array
    {
        return array_values(array_filter(config('sepay.verified_accounts', []), 'is_array'));
    }

    private function normalize(string $value): string
    {
        $normalized = strtoupper(preg_replace('/\s+/', '', trim($value)) ?? '');

        // SePay sends "MBBank" in webhook payloads while the local payment
        // account and VietQR bank code use "MB". Compare the canonical code so
        // a verified MB account is not incorrectly sent to reconciliation.
        return $normalized === 'MBBANK' ? 'MB' : $normalized;
    }
}
