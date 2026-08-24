<?php

namespace App\Services;

use App\Models\ExchangeRate;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OrderPricingService
{
    public function getActiveExchangeRate(string $from = 'CNY', string $to = 'VND', ?string $date = null): ?ExchangeRate
    {
        $effectiveDate = Carbon::parse($date ?? now())->toDateTimeString();

        return ExchangeRate::query()
            ->where('from_currency', strtoupper($from))
            ->where('to_currency', strtoupper($to))
            ->where('is_active', true)
            ->where(function ($query) use ($effectiveDate) {
                $query->whereNull('effective_from')->orWhere('effective_from', '<=', $effectiveDate);
            })
            ->where(function ($query) use ($effectiveDate) {
                $query->whereNull('effective_to')->orWhere('effective_to', '>=', $effectiveDate);
            })
            ->orderByDesc('effective_from')
            ->orderByDesc('id')
            ->first();
    }

    public function listExchangeRates(array $filter = [])
    {
        return ExchangeRate::query()
            ->with('creator')
            ->when($filter['from_currency'] ?? null, fn ($query, $value) => $query->where('from_currency', strtoupper($value)))
            ->when($filter['to_currency'] ?? null, fn ($query, $value) => $query->where('to_currency', strtoupper($value)))
            ->when(array_key_exists('is_active', $filter), fn ($query) => $query->where('is_active', (bool) $filter['is_active']))
            ->orderByDesc('effective_from')
            ->orderByDesc('id');
    }

    public function createExchangeRate(array $input): ExchangeRate
    {
        $this->ensurePermission('exchange_rates.manage');
        $rate = $this->normalizeRate($input['rate'] ?? null);
        if ($rate <= 0) {
            throw new HttpException(422, 'Tỷ giá phải lớn hơn 0.');
        }

        return DB::transaction(function () use ($input, $rate) {
            $from = strtoupper($input['from_currency'] ?? 'CNY');
            $to = strtoupper($input['to_currency'] ?? 'VND');
            $isActive = array_key_exists('is_active', $input) ? (bool) $input['is_active'] : true;

            if ($isActive) {
                ExchangeRate::query()
                    ->where('from_currency', $from)
                    ->where('to_currency', $to)
                    ->where('is_active', true)
                    ->update(['is_active' => false, 'effective_to' => now()]);
            }

            return ExchangeRate::query()->create([
                'from_currency' => $from,
                'to_currency' => $to,
                'rate' => number_format($rate, 4, '.', ''),
                'effective_from' => $input['effective_from'] ?? now(),
                'effective_to' => $input['effective_to'] ?? null,
                'is_active' => $isActive,
                'created_by' => Auth::id(),
            ])->fresh('creator');
        });
    }

    public function activateExchangeRate(int|string $id): ExchangeRate
    {
        $this->ensurePermission('exchange_rates.manage');

        return DB::transaction(function () use ($id) {
            $rate = ExchangeRate::query()->lockForUpdate()->findOrFail($id);
            ExchangeRate::query()
                ->where('from_currency', $rate->from_currency)
                ->where('to_currency', $rate->to_currency)
                ->where('id', '!=', $rate->id)
                ->where('is_active', true)
                ->update(['is_active' => false, 'effective_to' => now()]);
            $rate->update(['is_active' => true, 'effective_from' => $rate->effective_from ?? now(), 'effective_to' => null]);
            return $rate->fresh('creator');
        });
    }

    public function deactivateExchangeRate(int|string $id): ExchangeRate
    {
        $this->ensurePermission('exchange_rates.manage');
        $rate = ExchangeRate::query()->findOrFail($id);
        $rate->update(['is_active' => false, 'effective_to' => $rate->effective_to ?? now()]);
        return $rate->fresh('creator');
    }

    public function lockExchangeRateForOrder(Order $order): Order
    {
        return DB::transaction(function () use ($order) {
            $lockedOrder = Order::query()->with('items')->lockForUpdate()->findOrFail($order->id);
            if ($lockedOrder->exchange_rate_locked_at) {
                return $lockedOrder->fresh('items');
            }

            if ($lockedOrder->items->isEmpty()) {
                throw new HttpException(422, 'Không thể chốt tỷ giá cho đơn hàng chưa có sản phẩm.');
            }

            $rate = $this->getActiveExchangeRate();
            if (! $rate) {
                throw new HttpException(422, 'Chưa cấu hình tỷ giá CNY/VND đang hoạt động.');
            }

            foreach ($lockedOrder->items as $item) {
                $this->recalculateOrderItemAmounts($item, (string) $rate->rate);
            }

            $this->recalculateOrderTotals($lockedOrder, (string) $rate->rate, true, false);
            return $lockedOrder->fresh('items');
        });
    }

    public function recalculateOrderItemAmounts(OrderItem $item, ?string $exchangeRate = null): OrderItem
    {
        $this->assertOrderItemAmountIsValid($item);

        if ($exchangeRate === null) {
            return $item->fresh();
        }

        $subtotalCny = $this->multiplyCnyByQuantity((string) $item->price_cny, (int) $item->quantity);
        $item->forceFill([
            'subtotal_cny' => $subtotalCny,
            'exchange_rate' => $this->formatRate($exchangeRate),
            'unit_price_vnd' => $this->convertCnyToVnd((string) $item->price_cny, $exchangeRate),
            'subtotal_vnd' => $this->convertCnyToVnd($subtotalCny, $exchangeRate),
        ])->save();

        return $item->fresh();
    }

    public function recalculateOrderTotals(Order $order, ?string $exchangeRate = null, bool $lock = false, bool $preserveLegacyFields = false): Order
    {
        $items = $order->items()->get();
        $productTotalCny = $this->sumDecimalStrings($items->map(fn (OrderItem $item) => $this->multiplyCnyByQuantity((string) $item->price_cny, (int) $item->quantity))->all(), 2);

        $attributes = [
            'product_total_cny' => $productTotalCny,
        ];

        if ($exchangeRate !== null) {
            $productTotalVnd = array_sum($items->map(fn (OrderItem $item) => (int) ($item->subtotal_vnd ?: $this->convertCnyToVnd($this->multiplyCnyByQuantity((string) $item->price_cny, (int) $item->quantity), $exchangeRate)))->all());
            $attributes += [
                'product_total_vnd' => $productTotalVnd,
                'exchange_rate' => $this->formatRate($exchangeRate),
            ];
            if (! $preserveLegacyFields) {
                $attributes['currency'] = 'VND';
            }
        }
        if ($lock) {
            $attributes['exchange_rate_locked_at'] = now();
        }

        $order->forceFill($attributes)->save();
        return $order->fresh('items');
    }

    public function convertCnyToVnd(string $amountCny, string $exchangeRate): int
    {
        $cnyCents = $this->decimalToInt($amountCny, 2);
        $rateUnits = $this->decimalToInt($exchangeRate, 4);
        return intdiv(($cnyCents * $rateUnits) + 500000, 1000000);
    }

    public function multiplyCnyByQuantity(string $priceCny, int $quantity): string
    {
        $cents = $this->decimalToInt($priceCny, 2) * max(0, $quantity);
        return number_format($cents / 100, 2, '.', '');
    }

    public function addCny(string $left, string $right): string
    {
        return $this->sumDecimalStrings([$left, $right], 2);
    }

    public function orderProductTotals(Order $order, ?string $exchangeRate = null): array
    {
        $items = $order->items()->get();
        $totalCny = $this->sumDecimalStrings($items->map(fn (OrderItem $item) => $this->multiplyCnyByQuantity((string) $item->price_cny, (int) $item->quantity))->all(), 2);
        $totalVnd = $exchangeRate === null
            ? (int) $items->sum('subtotal_vnd')
            : array_sum($items->map(fn (OrderItem $item) => $this->convertCnyToVnd($this->multiplyCnyByQuantity((string) $item->price_cny, (int) $item->quantity), $exchangeRate))->all());

        return [
            'product_total_cny' => $totalCny,
            'product_total_vnd' => $totalVnd,
        ];
    }

    public function isLegacyTotalMatchingItems(Order $order): bool
    {
        $totals = $this->orderProductTotals($order);
        return $this->decimalToInt((string) ($order->total_amount ?? 0), 2) === $this->decimalToInt($totals['product_total_cny'], 2);
    }

    private function decimalToInt(string $value, int $scale): int
    {
        $normalized = trim(str_replace(',', '.', $value));
        if ($normalized === '' || ! preg_match('/^-?\d+(\.\d+)?$/', $normalized)) {
            return 0;
        }
        $negative = str_starts_with($normalized, '-');
        $normalized = ltrim($normalized, '-');
        [$whole, $fraction] = array_pad(explode('.', $normalized, 2), 2, '');
        $fraction = substr(str_pad($fraction, $scale + 1, '0'), 0, $scale + 1);
        $base = ((int) $whole * (10 ** $scale)) + (int) substr($fraction, 0, $scale);
        $roundDigit = (int) substr($fraction, $scale, 1);
        if ($roundDigit >= 5) {
            $base++;
        }
        return $negative ? -$base : $base;
    }

    private function sumDecimalStrings(array $values, int $scale): string
    {
        $sum = array_sum(array_map(fn ($value) => $this->decimalToInt((string) $value, $scale), $values));
        return number_format($sum / (10 ** $scale), $scale, '.', '');
    }

    private function normalizeRate(mixed $rate): float
    {
        if (is_string($rate)) {
            $rate = str_replace(',', '.', trim($rate));
        }
        return is_numeric($rate) ? (float) $rate : 0.0;
    }

    private function formatRate(string|float $rate): string
    {
        return number_format((float) $rate, 4, '.', '');
    }

    private function assertOrderItemAmountIsValid(OrderItem $item): void
    {
        if ((int) $item->quantity <= 0) {
            throw new HttpException(422, 'Số lượng sản phẩm phải lớn hơn 0.');
        }

        if ($this->decimalToInt((string) $item->price_cny, 2) < 0) {
            throw new HttpException(422, 'Giá CNY của sản phẩm không được âm.');
        }
    }

    private function ensurePermission(string $permission): void
    {
        $user = Auth::user();
        $permissions = $user?->role?->permissions ?? [];
        if (in_array('all', $permissions, true) || in_array($permission, $permissions, true) || in_array('settings.all', $permissions, true)) {
            return;
        }
        throw new HttpException(403, 'Bạn không có quyền cập nhật tỷ giá.');
    }
}
