<?php

namespace App\Console\Commands;

use App\Models\PaymentTransaction;
use App\Models\PaymentVoucher;
use App\Models\PaymentVoucherItem;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AuditPayments extends Command
{
    protected $signature = 'payments:audit {--voucher= : Chỉ kiểm tra một payment voucher ID}';

    protected $description = 'Read-only reconciliation for payment vouchers, transactions, invoices and ownership links';

    public function handle(): int
    {
        $voucherId = $this->option('voucher') !== null ? (int) $this->option('voucher') : null;
        $details = [];
        $counters = [
            'Vouchers checked' => 0,
            'Subtotal mismatches' => 0,
            'Payment mismatches' => 0,
            'Remaining mismatches' => 0,
            'Orphan voucher items' => $this->orphanCount('payment_voucher_items', 'payment_voucher_id', 'payment_vouchers', $voucherId),
            'Orphan transactions' => $this->orphanCount('payment_transactions', 'payment_voucher_id', 'payment_vouchers', $voucherId),
            'Invalid invoice links' => $this->invalidInvoiceLinks($voucherId),
            'Invalid customer/order links' => 0,
            'Invalid item references' => 0,
            'Invalid bank snapshots' => 0,
            'Invalid status invariants' => 0,
        ];

        $query = PaymentVoucher::query()
            ->with(['items', 'transactions', 'order', 'packages.order'])
            ->when($voucherId, fn (Builder $builder) => $builder->whereKey($voucherId))
            ->orderBy('id');

        $query->chunkById(100, function ($vouchers) use (&$counters, &$details): void {
            foreach ($vouchers as $voucher) {
                $counters['Vouchers checked']++;
                $this->auditVoucher($voucher, $counters, $details);
            }
        });

        $this->line('Payment audit');
        $this->line(str_repeat('-', 33));
        foreach ($counters as $label => $count) {
            $this->line("{$label}: {$count}");
        }

        if ($this->option('verbose') && $details !== []) {
            $this->newLine();
            $this->table(['Voucher', 'Check', 'Expected', 'Actual'], $details);
        }

        $failed = collect($counters)->except('Vouchers checked')->sum() > 0;
        $this->newLine();
        $failed ? $this->error('FAIL') : $this->info('PASS');

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function auditVoucher(PaymentVoucher $voucher, array &$counters, array &$details): void
    {
        $componentSubtotal = $voucher->componentSubtotal();
        $discount = $voucher->itemDiscountTotal();
        $total = max($componentSubtotal - $discount, 0);
        if ($componentSubtotal !== (int) $voucher->subtotal || $discount !== (int) $voucher->discount_amount || $total !== (int) $voucher->total_amount) {
            $counters['Subtotal mismatches']++;
            $details[] = [$voucher->voucher_code, 'totals', "{$componentSubtotal}/{$discount}/{$total}", "{$voucher->subtotal}/{$voucher->discount_amount}/{$voucher->total_amount}"];
        }

        $confirmedPaid = (int) round((float) $voucher->transactions->where('status', PaymentTransaction::STATUS_CONFIRMED)->sum('amount'));
        if ($confirmedPaid !== (int) $voucher->paid_amount) {
            $counters['Payment mismatches']++;
            $details[] = [$voucher->voucher_code, 'confirmed paid', $confirmedPaid, $voucher->paid_amount];
        }

        $computedRemaining = max((int) $voucher->total_amount - $confirmedPaid, 0);
        if (Schema::hasColumn('payment_vouchers', 'remaining_amount')) {
            $storedRemaining = (int) round((float) $voucher->getRawOriginal('remaining_amount'));
            if ($storedRemaining !== $computedRemaining) {
                $counters['Remaining mismatches']++;
                $details[] = [$voucher->voucher_code, 'remaining', $computedRemaining, $storedRemaining];
            }
        }

        if ($this->hasInvalidCustomerLink($voucher)) {
            $counters['Invalid customer/order links']++;
            $details[] = [$voucher->voucher_code, 'customer/order', $voucher->customer_id, 'linked order/package customer differs'];
        }

        foreach ($voucher->items as $item) {
            if (! $this->referenceExists($item)) {
                $counters['Invalid item references']++;
                $details[] = [$voucher->voucher_code, 'item reference', 'existing target', "{$item->reference_type}:{$item->reference_id}"];
            }
        }

        if (in_array($voucher->payment_method_expected, ['bank_transfer', 'mixed'], true)
            && (! $voucher->bank_name_snapshot || ! $voucher->bank_account_number_snapshot || ! $voucher->bank_account_holder_snapshot)) {
            $counters['Invalid bank snapshots']++;
            $details[] = [$voucher->voucher_code, 'bank snapshot', 'name/account/holder', 'incomplete'];
        }

        $invalidStatus = ($voucher->status === PaymentVoucher::STATUS_PAID && $computedRemaining > 0)
            || ($voucher->status === PaymentVoucher::STATUS_CANCELLED && $voucher->transactions->where('status', PaymentTransaction::STATUS_CONFIRMED)->isNotEmpty());
        if ($invalidStatus) {
            $counters['Invalid status invariants']++;
            $details[] = [$voucher->voucher_code, 'status', 'consistent with transactions', $voucher->status];
        }
    }

    private function hasInvalidCustomerLink(PaymentVoucher $voucher): bool
    {
        if ($voucher->order && (int) $voucher->order->customer_id !== (int) $voucher->customer_id) {
            return true;
        }

        return $voucher->packages->contains(fn ($package) => $package->order && (int) $package->order->customer_id !== (int) $voucher->customer_id);
    }

    private function referenceExists(PaymentVoucherItem $item): bool
    {
        if ($item->reference_type === null && $item->reference_id === null) {
            return true;
        }
        $tables = [
            'PaymentVoucher' => 'payment_vouchers',
            'PaymentVoucherPackage' => 'payment_voucher_packages',
            'VnPackage' => 'vn_packages',
            'Order' => 'orders',
        ];
        $table = $tables[$item->reference_type] ?? null;

        return $table !== null && $item->reference_id !== null && DB::table($table)->where('id', $item->reference_id)->exists();
    }

    private function orphanCount(string $table, string $column, string $target, ?int $voucherId): int
    {
        if (! Schema::hasTable($table) || ! Schema::hasTable($target)) {
            return 0;
        }

        return DB::table("{$table} as source")
            ->leftJoin("{$target} as target", 'target.id', '=', "source.{$column}")
            ->whereNotNull("source.{$column}")
            ->whereNull('target.id')
            ->when($voucherId, fn ($query) => $query->where("source.{$column}", $voucherId))
            ->count();
    }

    private function invalidInvoiceLinks(?int $voucherId): int
    {
        if (! Schema::hasTable('invoices')) {
            return 0;
        }

        return DB::table('invoices as invoice')
            ->leftJoin('payment_vouchers as voucher', 'voucher.id', '=', 'invoice.payment_voucher_id')
            ->leftJoin('payment_transactions as transaction', 'transaction.id', '=', 'invoice.payment_transaction_id')
            ->whereNotNull('invoice.payment_voucher_id')
            ->when($voucherId, fn ($query) => $query->where('invoice.payment_voucher_id', $voucherId))
            ->where(function ($query) {
                $query->whereNull('voucher.id')
                    ->orWhereColumn('invoice.customer_id', '!=', 'voucher.customer_id')
                    ->orWhere(function ($transactionQuery) {
                        $transactionQuery->whereNotNull('invoice.payment_transaction_id')
                            ->where(function ($inner) {
                                $inner->whereNull('transaction.id')
                                    ->orWhereColumn('transaction.payment_voucher_id', '!=', 'invoice.payment_voucher_id');
                            });
                    });
            })->count();
    }
}
