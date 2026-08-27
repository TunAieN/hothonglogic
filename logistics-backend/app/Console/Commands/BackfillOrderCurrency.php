<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Services\Orders\OrderPricingService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class BackfillOrderCurrency extends Command
{
    protected $signature = 'orders:backfill-currency
        {--dry-run : Only print the changes. This is the default unless --apply is provided}
        {--apply : Write the selected safe changes}
        {--exchange-rate= : VND/CNY rate to apply when backfilling VND snapshots}
        {--product-cny-only : Only backfill orders.product_total_cny from order_items}
        {--order-id=* : Limit to one or more order ids}
        {--allow-payment-voucher : Allow explicitly selected orders that already have payment vouchers}';

    protected $description = 'Backfill product CNY and optional VND snapshot fields for legacy orders without changing price_cny or dropping total_amount.';

    public function handle(OrderPricingService $pricing): int
    {
        $apply = (bool) $this->option('apply');
        $dryRun = ! $apply || (bool) $this->option('dry-run');
        $productCnyOnly = (bool) $this->option('product-cny-only');
        $allowPaymentVoucher = (bool) $this->option('allow-payment-voucher');
        $orderIds = array_values(array_unique(array_filter(array_map('intval', (array) $this->option('order-id')))));
        $rate = trim((string) $this->option('exchange-rate'));

        if (! $productCnyOnly && ($rate === '' || ! is_numeric($rate) || (float) $rate <= 0)) {
            $this->error('Please provide --exchange-rate with a value greater than 0, for example --exchange-rate=3600, or use --product-cny-only.');

            return self::FAILURE;
        }

        if ($apply && $orderIds === []) {
            $this->error('--apply requires one or more explicit --order-id values. Bulk apply is not allowed by this command.');

            return self::FAILURE;
        }

        if ($allowPaymentVoucher && $orderIds === []) {
            $this->error('--allow-payment-voucher is only allowed together with one or more explicit --order-id values. It cannot run in bulk.');

            return self::FAILURE;
        }

        if ($allowPaymentVoucher) {
            $this->warn('WARNING: --allow-payment-voucher only backfills order product snapshots. It does not change payment vouchers, transactions, invoices, balances, status, or orders.total_amount.');
        }

        if ($dryRun) {
            $this->info('Mode: dry-run. No database rows will be updated. Add --apply to write selected safe changes.');
        } else {
            $this->warn('Mode: apply. Only explicitly selected safe order IDs will be updated.');
        }

        $summary = [
            'checked' => 0,
            'has_items' => 0,
            'no_items' => 0,
            'matched_legacy_total' => 0,
            'mismatched_legacy_total' => 0,
            'already_snapshot' => 0,
            'without_snapshot' => 0,
            'has_payment_voucher' => 0,
            'unsafe' => 0,
            'skipped' => 0,
            'would_update' => 0,
            'updated' => 0,
            'errors' => 0,
        ];
        $ids = [
            'would_update' => [],
            'updated' => [],
            'skipped' => [],
            'failed' => [],
            'mismatched' => [],
            'unsafe' => [],
        ];

        $query = Order::query()
            ->with('items')
            ->when($orderIds !== [], fn ($query) => $query->whereIn('id', $orderIds))
            ->orderBy('id');

        $query->chunkById(50, function ($orders) use ($pricing, $rate, $dryRun, $allowPaymentVoucher, $productCnyOnly, &$summary, &$ids) {
            foreach ($orders as $order) {
                $summary['checked']++;
                $hasItems = $order->items->isNotEmpty();
                $hasCurrencySnapshot = (bool) $order->exchange_rate_locked_at || (int) ($order->product_total_vnd ?? 0) > 0;
                $hasProductCny = $order->product_total_cny !== null && $this->decimalToInt((string) $order->product_total_cny) !== 0;
                $hasSnapshot = $productCnyOnly ? $hasProductCny : $hasCurrencySnapshot;
                $hasPaymentVoucher = DB::table('payment_voucher_packages')->where('order_id', $order->id)->exists()
                    || DB::table('payment_vouchers')->where('order_id', $order->id)->exists();
                $totals = $pricing->orderProductTotals($order, $productCnyOnly ? null : $rate);
                $legacyTotal = number_format((float) ($order->total_amount ?? 0), 2, '.', '');
                $matchesLegacy = $pricing->isLegacyTotalMatchingItems($order);
                $before = $this->snapshot($order);
                $reasons = [];

                $summary[$hasItems ? 'has_items' : 'no_items']++;
                $summary[$matchesLegacy ? 'matched_legacy_total' : 'mismatched_legacy_total']++;
                $summary[$hasSnapshot ? 'already_snapshot' : 'without_snapshot']++;
                if ($hasPaymentVoucher) {
                    $summary['has_payment_voucher']++;
                }
                if (! $matchesLegacy) {
                    $ids['mismatched'][] = $order->id;
                }

                if (! $hasItems) {
                    $reasons[] = 'no_items';
                }
                if ($hasSnapshot) {
                    $reasons[] = $productCnyOnly ? 'product_total_cny_already_set' : 'already_snapshot';
                }
                if (! $matchesLegacy) {
                    $reasons[] = 'legacy_total_mismatch';
                }
                if ($hasPaymentVoucher && ! $allowPaymentVoucher) {
                    $reasons[] = 'has_payment_voucher';
                }

                $canUpdate = $reasons === [];
                if (! $canUpdate) {
                    $summary['unsafe']++;
                    $summary['skipped']++;
                    $ids['unsafe'][] = $order->id;
                    $ids['skipped'][] = $order->id;
                } else {
                    $summary['would_update']++;
                    $ids['would_update'][] = $order->id;
                }

                $afterPreview = $productCnyOnly
                    ? [
                        'product_total_cny' => $totals['product_total_cny'],
                        'product_total_vnd' => (int) ($order->product_total_vnd ?? 0),
                        'exchange_rate' => $order->exchange_rate === null ? null : (string) $order->exchange_rate,
                        'exchange_rate_locked_at' => $order->exchange_rate_locked_at?->toDateTimeString(),
                        'total_amount' => $legacyTotal,
                    ]
                    : [
                        'product_total_cny' => $totals['product_total_cny'],
                        'product_total_vnd' => $totals['product_total_vnd'],
                        'exchange_rate' => number_format((float) $rate, 4, '.', ''),
                        'exchange_rate_locked_at' => $dryRun ? '<would set current timestamp>' : '<set during update>',
                        'total_amount' => $legacyTotal,
                    ];

                $this->line(sprintf(
                    '%s order_id=%s code=%s legacy_cny=%s calculated_cny=%s rate=%s expected_vnd=%s action=%s reason=%s before=%s after=%s payment_voucher_changed=no total_amount_changed=no status_changed=no',
                    $dryRun ? 'DRY-RUN' : ($canUpdate ? 'UPDATE' : 'SKIP'),
                    $order->id,
                    $order->order_code,
                    $legacyTotal,
                    $totals['product_total_cny'],
                    $productCnyOnly ? '-' : $rate,
                    $productCnyOnly ? (int) ($order->product_total_vnd ?? 0) : $totals['product_total_vnd'],
                    $canUpdate ? ($dryRun ? 'would_update' : 'update') : 'skip',
                    $reasons === [] ? '-' : implode(',', $reasons),
                    json_encode($before, JSON_UNESCAPED_UNICODE),
                    json_encode($afterPreview, JSON_UNESCAPED_UNICODE),
                ));

                if ($dryRun || ! $canUpdate) {
                    continue;
                }

                try {
                    DB::transaction(function () use ($order, $pricing, $rate, $productCnyOnly) {
                        $locked = Order::query()->with('items')->lockForUpdate()->findOrFail($order->id);
                        $currentProductCny = $locked->product_total_cny === null ? 0 : $this->decimalToInt((string) $locked->product_total_cny);
                        if ($currentProductCny !== 0) {
                            return;
                        }
                        if (! $pricing->isLegacyTotalMatchingItems($locked)) {
                            return;
                        }

                        if ($productCnyOnly) {
                            $totals = $pricing->orderProductTotals($locked);
                            $locked->forceFill([
                                'product_total_cny' => $totals['product_total_cny'],
                            ])->save();

                            return;
                        }

                        if ($locked->exchange_rate_locked_at || (int) ($locked->product_total_vnd ?? 0) > 0) {
                            return;
                        }
                        foreach ($locked->items as $item) {
                            $pricing->recalculateOrderItemAmounts($item, $rate);
                        }
                        $pricing->recalculateOrderTotals($locked->fresh('items'), $rate, true, true);
                    });
                    $summary['updated']++;
                    $ids['updated'][] = $order->id;
                    $after = $this->snapshot(Order::query()->findOrFail($order->id));
                    $this->info('UPDATED order_id='.$order->id.' before='.json_encode($before, JSON_UNESCAPED_UNICODE).' after='.json_encode($after, JSON_UNESCAPED_UNICODE).' payment_voucher_changed=no total_amount_changed=no status_changed=no');
                } catch (Throwable $exception) {
                    $summary['errors']++;
                    $ids['failed'][] = $order->id;
                    report($exception);
                    $this->error("ERROR order {$order->id}: {$exception->getMessage()}");
                }
            }
        });

        foreach ($ids as $key => $value) {
            $ids[$key] = array_values(array_unique($value));
        }

        $this->info('Summary: '.json_encode($summary, JSON_UNESCAPED_UNICODE));
        $this->info('IDs: '.json_encode($ids, JSON_UNESCAPED_UNICODE));

        return $summary['errors'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function snapshot(Order $order): array
    {
        return [
            'product_total_cny' => (string) ($order->product_total_cny ?? '0.00'),
            'product_total_vnd' => (int) ($order->product_total_vnd ?? 0),
            'exchange_rate' => $order->exchange_rate === null ? null : (string) $order->exchange_rate,
            'exchange_rate_locked_at' => $order->exchange_rate_locked_at?->toDateTimeString(),
            'total_amount' => (string) ($order->total_amount ?? '0.00'),
            'status' => (string) $order->status,
        ];
    }

    private function decimalToInt(string $value): int
    {
        $normalized = trim(str_replace(',', '.', $value));
        if ($normalized === '' || ! preg_match('/^-?\d+(\.\d+)?$/', $normalized)) {
            return 0;
        }

        return (int) round(((float) $normalized) * 100);
    }
}
