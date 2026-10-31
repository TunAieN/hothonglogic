<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const COLUMNS = [
        'payment_method',
        'base_amount_cny',
        'base_amount_vnd',
        'deposit_percent',
        'deposit_applied',
        'customer_credit_applied',
        'paid_at',
        'remaining_amount',
    ];

    public function up(): void
    {
        $this->assertReadyForCleanup();
        $columns = array_values(array_filter(self::COLUMNS, fn (string $column) => Schema::hasColumn('payment_vouchers', $column)));
        if ($columns !== []) {
            Schema::table('payment_vouchers', fn (Blueprint $table) => $table->dropColumn($columns));
        }
    }

    private function assertReadyForCleanup(): void
    {
        $itemTotals = DB::table('payment_vouchers as pv')
            ->leftJoin('payment_voucher_items as pvi', 'pvi.payment_voucher_id', '=', 'pv.id')
            ->groupBy('pv.id', 'pv.subtotal', 'pv.discount_amount', 'pv.total_amount')
            ->selectRaw("pv.id, pv.subtotal, pv.discount_amount, pv.total_amount,
                COALESCE(SUM(CASE WHEN pvi.item_type IN ('deposit_applied', 'customer_credit') THEN 0 ELSE pvi.amount END), 0) component_total,
                ABS(COALESCE(SUM(CASE WHEN pvi.item_type IN ('deposit_applied', 'customer_credit') THEN pvi.amount ELSE 0 END), 0)) adjustment_total");

        $checks = [
            'required V2 foreign keys missing' => collect([
                ['vn_packages', 'payment_voucher_id'],
                ['payment_voucher_packages', 'shipping_rate_id'],
                ['payment_voucher_packages', 'shipping_rate_detail_id'],
                ['invoices', 'payment_voucher_id'],
                ['invoice_items', 'payment_voucher_package_id'],
            ])->filter(fn (array $key) => ! $this->foreignKeyExists($key[0], $key[1]))->count(),
            'voucher item/header mismatches' => DB::query()->fromSub($itemTotals, 'totals')->where(function ($query) {
                $query->whereRaw('ABS(subtotal - component_total) >= 1')
                    ->orWhereRaw('ABS(discount_amount - adjustment_total) >= 1')
                    ->orWhereRaw('ABS(total_amount - GREATEST(component_total - adjustment_total, 0)) >= 1');
            })->count(),
            'payment cache mismatches' => DB::query()->fromSub(
                DB::table('payment_vouchers as pv')->leftJoin('payment_transactions as pt', function ($join) {
                    $join->on('pt.payment_voucher_id', '=', 'pv.id')->where('pt.status', '=', 'confirmed');
                })->groupBy('pv.id', 'pv.paid_amount')->selectRaw('pv.id, pv.paid_amount, COALESCE(SUM(pt.amount), 0) transaction_total'),
                'payments',
            )->whereRaw('ABS(paid_amount - transaction_total) >= 1')->count(),
            'remaining cache mismatches' => Schema::hasColumn('payment_vouchers', 'remaining_amount')
                ? DB::table('payment_vouchers')->whereRaw('ABS(remaining_amount - GREATEST(total_amount - paid_amount, 0)) >= 1')->count()
                : 0,
            'deposit items missing metadata' => DB::table('payment_vouchers as pv')
                ->where('pv.voucher_type', 'deposit')
                ->whereNotExists(function ($query) {
                    $query->selectRaw('1')->from('payment_voucher_items as pvi')
                        ->whereColumn('pvi.payment_voucher_id', 'pv.id')->where('pvi.item_type', 'deposit')
                        ->whereNotNull('pvi.metadata');
                })->count(),
            'legacy surcharge item references' => DB::table('payment_voucher_items')->where('reference_type', 'PaymentVoucherSurcharge')->count(),
        ];
        $failed = array_filter($checks, fn (int $count) => $count > 0);
        if ($failed !== []) {
            throw new RuntimeException('Payment V2 cleanup aborted: '.json_encode($failed, JSON_UNESCAPED_UNICODE));
        }
    }

    private function foreignKeyExists(string $table, string $column): bool
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
            return false;
        }
        if (DB::getDriverName() === 'sqlite') {
            return collect(DB::select("PRAGMA foreign_key_list('{$table}')"))->contains(fn ($row) => ($row->from ?? null) === $column);
        }

        return DB::table('information_schema.KEY_COLUMN_USAGE')
            ->where('TABLE_SCHEMA', DB::getDatabaseName())
            ->where('TABLE_NAME', $table)
            ->where('COLUMN_NAME', $column)
            ->whereNotNull('REFERENCED_TABLE_NAME')
            ->exists();
    }

    public function down(): void
    {
        // Irreversible: compatibility values are served from authoritative items and transactions.
    }
};
