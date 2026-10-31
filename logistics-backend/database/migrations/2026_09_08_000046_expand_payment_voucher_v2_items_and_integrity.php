<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->assertRequiredSchema();
        $this->assertBlockingIntegrity();
        $this->normalizeOrphanRateReferences();
        $this->backfillItems();
        $this->normalizeLegacyItemReferences();
        $this->assertIntegrityBeforeForeignKeys();
        $this->addMissingForeignKeys();
    }

    private function assertBlockingIntegrity(): void
    {
        $checks = [
            'vn_packages.payment_voucher_id' => $this->orphanCount('vn_packages', 'payment_voucher_id', 'payment_vouchers'),
            'invoices.payment_voucher_id' => $this->orphanCount('invoices', 'payment_voucher_id', 'payment_vouchers'),
            'invoice_items.payment_voucher_package_id' => $this->orphanCount('invoice_items', 'payment_voucher_package_id', 'payment_voucher_packages'),
        ];
        $failed = array_filter($checks, fn (int $count) => $count > 0);
        if ($failed !== []) {
            throw new RuntimeException('Payment V2 expand aborted before backfill: '.json_encode($failed, JSON_UNESCAPED_UNICODE));
        }
    }

    private function normalizeOrphanRateReferences(): void
    {
        foreach ([
            'shipping_rate_id' => 'shipping_rates',
            'shipping_rate_detail_id' => 'shipping_rate_details',
        ] as $column => $target) {
            if (! Schema::hasTable($target) || ! Schema::hasColumn('payment_voucher_packages', $column)) {
                continue;
            }

            $orphans = DB::table('payment_voucher_packages as package')
                ->leftJoin("{$target} as target", 'target.id', '=', "package.{$column}")
                ->whereNotNull("package.{$column}")
                ->whereNull('target.id')
                ->select('package.id', 'package.unit_price', 'package.price_type', 'package.shipping_fee', 'package.total_amount')
                ->orderBy('package.id')
                ->get();
            $unsafe = $orphans->filter(fn ($row) => $row->unit_price === null
                || ! in_array($row->price_type, ['fixed', 'per_kg'], true)
                || $row->shipping_fee === null
                || $row->total_amount === null);
            if ($unsafe->isNotEmpty()) {
                throw new RuntimeException("Payment V2 expand aborted: orphan {$column} rows lack pricing snapshots: ".json_encode($unsafe->pluck('id')->all()));
            }

            foreach ($orphans->pluck('id')->chunk(100) as $ids) {
                DB::table('payment_voucher_packages')->whereIn('id', $ids->all())->update([$column => null]);
            }
        }
    }

    private function assertRequiredSchema(): void
    {
        foreach (['payment_vouchers', 'payment_voucher_items', 'payment_transactions'] as $table) {
            if (! Schema::hasTable($table)) {
                throw new RuntimeException("Payment V2 expand aborted: missing {$table} table.");
            }
        }
    }

    private function backfillItems(): void
    {
        DB::table('payment_vouchers')->orderBy('id')->chunkById(100, function ($vouchers): void {
            foreach ($vouchers as $voucher) {
                DB::transaction(function () use ($voucher): void {
                    $item = DB::table('payment_voucher_items')
                        ->where('payment_voucher_id', $voucher->id)
                        ->when(($voucher->voucher_type ?? null) === 'deposit', fn ($query) => $query->where('item_type', 'deposit'))
                        ->when(($voucher->voucher_type ?? null) !== 'deposit', fn ($query) => $query->where('item_type', 'order_amount'))
                        ->orderBy('id')
                        ->first();

                    if ($item) {
                        $metadata = $this->decodeMetadata($item->metadata ?? null);
                        $metadata += array_filter([
                            'amount_cny' => isset($voucher->base_amount_cny) ? number_format((float) $voucher->base_amount_cny, 2, '.', '') : null,
                            'base_amount_vnd' => isset($voucher->base_amount_vnd) ? (int) round((float) $voucher->base_amount_vnd) : null,
                            'exchange_rate' => isset($voucher->exchange_rate) ? (string) $voucher->exchange_rate : null,
                            'deposit_percent' => isset($voucher->deposit_percent) ? number_format((float) $voucher->deposit_percent, 2, '.', '') : null,
                        ], fn ($value) => $value !== null);
                        DB::table('payment_voucher_items')->where('id', $item->id)->update([
                            'metadata' => json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION),
                        ]);
                    }

                    $this->insertAdjustmentIfMissing(
                        $voucher,
                        'deposit_applied',
                        'Tiền đặt cọc đã áp dụng',
                        (int) round((float) ($voucher->deposit_applied ?? 0)),
                    );
                    $this->insertAdjustmentIfMissing(
                        $voucher,
                        'customer_credit',
                        'Số dư khách hàng đã áp dụng',
                        (int) round((float) ($voucher->customer_credit_applied ?? 0)),
                    );
                });
            }
        });
    }

    private function insertAdjustmentIfMissing(object $voucher, string $type, string $description, int $amount): void
    {
        if ($amount <= 0 || DB::table('payment_voucher_items')->where('payment_voucher_id', $voucher->id)->where('item_type', $type)->exists()) {
            return;
        }

        DB::table('payment_voucher_items')->insert([
            'payment_voucher_id' => $voucher->id,
            'item_type' => $type,
            'description' => $description,
            'quantity' => 1,
            'unit_price' => -$amount,
            'amount' => -$amount,
            'reference_type' => 'PaymentVoucher',
            'reference_id' => $voucher->id,
            'metadata' => json_encode(['backfilled' => true], JSON_UNESCAPED_UNICODE),
            'created_at' => $voucher->created_at ?? now(),
            'updated_at' => $voucher->updated_at ?? $voucher->created_at ?? now(),
        ]);
    }

    private function normalizeLegacyItemReferences(): void
    {
        DB::table('payment_voucher_items')
            ->where('reference_type', 'PaymentVoucherSurcharge')
            ->orderBy('id')
            ->chunkById(100, function ($items): void {
                foreach ($items as $item) {
                    $metadata = $this->decodeMetadata($item->metadata ?? null);
                    $metadata['legacy_reference'] = [
                        'type' => 'PaymentVoucherSurcharge',
                        'id' => $item->reference_id,
                    ];
                    $vnPackageId = isset($metadata['vn_package_id']) ? (int) $metadata['vn_package_id'] : null;
                    $hasPackage = $vnPackageId && DB::table('vn_packages')->where('id', $vnPackageId)->exists();
                    DB::table('payment_voucher_items')->where('id', $item->id)->update([
                        'reference_type' => $hasPackage ? 'VnPackage' : null,
                        'reference_id' => $hasPackage ? $vnPackageId : null,
                        'metadata' => json_encode($metadata, JSON_UNESCAPED_UNICODE),
                    ]);
                }
            });
    }

    private function assertIntegrityBeforeForeignKeys(): void
    {
        $checks = [
            'vn_packages.payment_voucher_id' => $this->orphanCount('vn_packages', 'payment_voucher_id', 'payment_vouchers'),
            'payment_voucher_packages.shipping_rate_id' => $this->orphanCount('payment_voucher_packages', 'shipping_rate_id', 'shipping_rates'),
            'payment_voucher_packages.shipping_rate_detail_id' => $this->orphanCount('payment_voucher_packages', 'shipping_rate_detail_id', 'shipping_rate_details'),
            'invoices.payment_voucher_id' => $this->orphanCount('invoices', 'payment_voucher_id', 'payment_vouchers'),
            'invoice_items.payment_voucher_package_id' => $this->orphanCount('invoice_items', 'payment_voucher_package_id', 'payment_voucher_packages'),
        ];
        $failed = array_filter($checks, fn (int $count) => $count > 0);
        if ($failed !== []) {
            throw new RuntimeException('Payment V2 FK expand aborted: '.json_encode($failed, JSON_UNESCAPED_UNICODE));
        }
    }

    private function orphanCount(string $table, string $column, string $target): int
    {
        if (! Schema::hasTable($table) || ! Schema::hasTable($target) || ! Schema::hasColumn($table, $column)) {
            return 0;
        }

        return DB::table("{$table} as source")
            ->leftJoin("{$target} as target", 'target.id', '=', "source.{$column}")
            ->whereNotNull("source.{$column}")
            ->whereNull('target.id')
            ->count();
    }

    private function addMissingForeignKeys(): void
    {
        $this->addForeignKey('vn_packages', 'payment_voucher_id', 'payment_vouchers', 'pv_active_voucher_v2_fk');
        $this->addForeignKey('payment_voucher_packages', 'shipping_rate_id', 'shipping_rates', 'pvp_shipping_rate_v2_fk');
        $this->addForeignKey('payment_voucher_packages', 'shipping_rate_detail_id', 'shipping_rate_details', 'pvp_shipping_rate_detail_v2_fk');
        $this->addForeignKey('invoices', 'payment_voucher_id', 'payment_vouchers', 'invoices_payment_voucher_v2_fk');
        $this->addForeignKey('invoice_items', 'payment_voucher_package_id', 'payment_voucher_packages', 'invoice_items_voucher_package_v2_fk');
    }

    private function addForeignKey(string $table, string $column, string $target, string $name): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasTable($target) || ! Schema::hasColumn($table, $column) || $this->foreignKeyExists($table, $column)) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint) use ($column, $target, $name): void {
            $blueprint->foreign($column, $name)->references('id')->on($target)->nullOnDelete();
        });
    }

    private function foreignKeyExists(string $table, string $column): bool
    {
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

    private function decodeMetadata(mixed $metadata): array
    {
        if (is_array($metadata)) {
            return $metadata;
        }
        $decoded = json_decode((string) $metadata, true);

        return is_array($decoded) ? $decoded : [];
    }

    public function down(): void
    {
        // Additive/backfill migration. Historical item metadata and integrity constraints are retained.
    }
};
