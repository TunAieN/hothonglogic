<?php

namespace App\Services\Payments;

use App\Models\Customer;
use App\Models\CustomerBalanceLedger;
use Illuminate\Support\Facades\DB;
use LogicException;
use OverflowException;

final class CustomerLedgerService
{
    public const MAX_VND = 9999999999999;

    public function balance(int $customerId, bool $lock = false): int
    {
        if ($lock) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
        }
        $query = CustomerBalanceLedger::query()->where('customer_id', $customerId)->latest('id');
        if ($lock) {
            $query->lockForUpdate();
        }
        $raw = $query->value('balance_after');
        $balance = $raw === null ? 0 : $this->vnd($raw);
        if ($balance < 0) {
            throw new LogicException('Sổ cái khách hàng đang có số dư âm bất thường.');
        }

        return $balance;
    }

    public function credit(int $customerId, int $amountVnd, string $type, string $description, ?int $voucherId = null, ?int $transactionId = null, ?int $createdBy = null): CustomerBalanceLedger
    {
        return $this->append($customerId, $amountVnd, true, $type, $description, $voucherId, $transactionId, $createdBy);
    }

    public function debit(int $customerId, int $amountVnd, string $type, string $description, ?int $voucherId = null, ?int $transactionId = null, ?int $createdBy = null): CustomerBalanceLedger
    {
        return $this->append($customerId, $amountVnd, false, $type, $description, $voucherId, $transactionId, $createdBy);
    }

    public function vnd(mixed $value): int
    {
        $normalized = trim((string) $value);
        if (! preg_match('/^-?\d+(?:\.0{1,2})?$/', $normalized)) {
            throw new LogicException('Giá trị tiền VND không phải số nguyên chính xác.');
        }
        $integer = (int) explode('.', $normalized, 2)[0];
        if (abs($integer) > self::MAX_VND) {
            throw new OverflowException('Giá trị tiền VND vượt giới hạn an toàn.');
        }

        return $integer;
    }

    private function append(int $customerId, int $amountVnd, bool $credit, string $type, string $description, ?int $voucherId, ?int $transactionId, ?int $createdBy): CustomerBalanceLedger
    {
        if (! DB::transactionLevel()) {
            throw new LogicException('Ghi sổ cái phải nằm trong database transaction.');
        }
        if ($amountVnd <= 0 || $amountVnd > self::MAX_VND) {
            throw new LogicException('Số tiền ghi sổ không hợp lệ.');
        }
        $current = $this->balance($customerId, true);
        $next = $credit ? $current + $amountVnd : $current - $amountVnd;
        if ($next < 0) {
            throw new LogicException('Số dư không đủ cho giao dịch ghi nợ.');
        }
        if ($next > self::MAX_VND) {
            throw new OverflowException('Số dư sau giao dịch vượt giới hạn an toàn.');
        }

        return CustomerBalanceLedger::query()->create([
            'customer_id' => $customerId, 'payment_voucher_id' => $voucherId, 'transaction_id' => $transactionId,
            'type' => $type, 'amount' => (string) $amountVnd, 'balance_after' => (string) $next,
            'description' => $description, 'created_by' => $createdBy,
        ]);
    }
}
