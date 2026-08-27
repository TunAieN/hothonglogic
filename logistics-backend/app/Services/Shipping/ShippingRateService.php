<?php

namespace App\Services\Shipping;

use App\Models\ShippingRate;
use App\Models\ShippingRateDetail;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ShippingRateService
{
    public function list(array $filter = [])
    {
        return ShippingRate::query()
            ->with(['details' => fn ($query) => $query->orderBy('sort_order')->orderBy('min_weight')->orderBy('weight_from')])
            ->when($filter['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($filter['customer_type'] ?? null, fn ($query, $value) => $query->where('customer_type', $value))
            ->when($filter['route_type'] ?? null, fn ($query, $value) => $query->where('route_type', $value))
            ->when($filter['warehouse_id'] ?? null, fn ($query, $value) => $query->where('warehouse_id', $value))
            ->orderByDesc(DB::raw('COALESCE(effective_from, valid_from)'));
    }

    public function show(int|string $id): ShippingRate
    {
        return ShippingRate::query()->with(['details' => fn ($query) => $query->orderBy('sort_order')->orderBy('min_weight')->orderBy('weight_from')])->findOrFail($id);
    }

    public function create(array $input): ShippingRate
    {
        return DB::transaction(function () use ($input) {
            $details = $input['details'] ?? [];
            $rateData = $this->normalizeRateInput($input);
            $this->assertNoActiveOverlap($rateData);
            $this->assertDetailsValid($details);

            $rate = ShippingRate::query()->create($rateData + ['created_by' => Auth::id()]);
            foreach ($details as $index => $detail) {
                $this->createDetail($rate->id, $detail + ['sort_order' => $detail['sort_order'] ?? $index]);
            }

            return $this->show($rate->id);
        });
    }

    public function update(int|string $id, array $input): ShippingRate
    {
        return DB::transaction(function () use ($id, $input) {
            $rate = ShippingRate::query()->findOrFail($id);
            $rateData = $this->normalizeRateInput($input, $rate);
            $this->assertNoActiveOverlap($rateData, (int) $rate->id);
            $rate->update($rateData);

            if (array_key_exists('details', $input)) {
                $details = $input['details'] ?? [];
                $this->assertDetailsValid($details);
                $rate->details()->delete();
                foreach ($details as $index => $detail) {
                    $this->createDetail($rate->id, $detail + ['sort_order' => $detail['sort_order'] ?? $index]);
                }
            }

            return $this->show($rate->id);
        });
    }

    public function deactivate(int|string $id): ShippingRate
    {
        $rate = ShippingRate::query()->findOrFail($id);
        $rate->update(['status' => ShippingRate::STATUS_INACTIVE]);

        return $this->show($rate->id);
    }

    public function createDetail(int|string $rateId, array $input): ShippingRateDetail
    {
        $rate = ShippingRate::query()->with('details')->findOrFail($rateId);
        $details = $rate->details->map(fn ($row) => [
            'min_weight' => $this->detailMin($row),
            'max_weight' => $this->detailMax($row),
        ])->push([
            'min_weight' => $input['min_weight'] ?? $input['weight_from'] ?? 0,
            'max_weight' => $input['max_weight'] ?? $input['weight_to'] ?? null,
        ])->all();
        $this->assertDetailsValid($details);

        return ShippingRateDetail::query()->create($this->normalizeDetailInput($rateId, $input));
    }

    public function updateDetail(int|string $id, array $input): ShippingRateDetail
    {
        $detail = ShippingRateDetail::query()->findOrFail($id);
        $rate = ShippingRate::query()->with('details')->findOrFail($detail->rate_id);
        $details = $rate->details->filter(fn ($row) => (int) $row->id !== (int) $detail->id)->map(fn ($row) => [
            'min_weight' => $this->detailMin($row),
            'max_weight' => $this->detailMax($row),
        ])->push([
            'min_weight' => $input['min_weight'] ?? $input['weight_from'] ?? $this->detailMin($detail),
            'max_weight' => array_key_exists('max_weight', $input) ? $input['max_weight'] : ($input['weight_to'] ?? $this->detailMax($detail)),
        ])->all();
        $this->assertDetailsValid($details);
        $detail->update($this->normalizeDetailInput($detail->rate_id, $input, $detail));

        return $detail->fresh();
    }

    public function deleteDetail(int|string $id): bool
    {
        return (bool) ShippingRateDetail::query()->findOrFail($id)->delete();
    }

    public function findActiveRate(array $criteria = []): ?ShippingRate
    {
        $date = Carbon::parse($criteria['date'] ?? now())->toDateString();

        return ShippingRate::query()
            ->with(['details' => fn ($query) => $query->orderBy('sort_order')->orderBy('min_weight')->orderBy('weight_from')])
            ->where('status', ShippingRate::STATUS_ACTIVE)
            ->whereDate(DB::raw('COALESCE(effective_from, valid_from)'), '<=', $date)
            ->where(function ($query) use ($date) {
                $query->whereNull('effective_to')
                    ->orWhereDate('effective_to', '>=', $date)
                    ->orWhere(function ($legacy) use ($date) {
                        $legacy->whereNull('effective_from')->whereDate('valid_to', '>=', $date);
                    });
            })
            ->when($criteria['warehouse_id'] ?? null, fn ($query, $value) => $query->where(fn ($inner) => $inner->whereNull('warehouse_id')->orWhere('warehouse_id', $value)))
            ->when($criteria['customer_type'] ?? null, fn ($query, $value) => $query->where(fn ($inner) => $inner->whereNull('customer_type')->orWhere('customer_type', $value)))
            ->when($criteria['route_type'] ?? null, fn ($query, $value) => $query->where(fn ($inner) => $inner->whereNull('route_type')->orWhere('route_type', $value)))
            ->orderByRaw('warehouse_id IS NULL ASC')
            ->orderByRaw('customer_type IS NULL ASC')
            ->orderByDesc(DB::raw('COALESCE(effective_from, valid_from)'))
            ->first();
    }

    public function calculateFee(float $weight, array $criteria = []): array
    {
        $rate = $this->findActiveRate($criteria);
        if (! $rate) {
            throw new HttpException(422, 'Chưa có bảng giá cước phù hợp cho kiện hàng này. Vui lòng cấu hình bảng giá trước khi tạo phiếu thanh toán.');
        }

        $detail = $this->findMatchingDetail($rate, $weight);
        if (! $detail) {
            throw new HttpException(422, 'Chưa có khung giá phù hợp cho cân tính phí '.$weight.' kg.');
        }

        $price = $this->detailPrice($detail);
        $priceType = $detail->price_type ?: 'per_kg';
        $fee = $priceType === 'fixed' ? $price : $weight * $price;

        return [
            'rate' => $rate,
            'detail' => $detail,
            'unit_price' => round($price, 0),
            'price_type' => $priceType,
            'shipping_fee' => round($fee, 0),
            'rate_description' => $detail->description ?: $this->describeDetail($detail),
        ];
    }

    public function findMatchingDetail(ShippingRate $rate, float $weight): ?ShippingRateDetail
    {
        return $rate->details->first(function ($detail) use ($weight) {
            $min = $this->detailMin($detail);
            $max = $this->detailMax($detail);

            return $weight >= $min && ($max === null || $weight <= $max);
        });
    }

    public function describeDetail(ShippingRateDetail $detail): string
    {
        $min = $this->detailMin($detail);
        $max = $this->detailMax($detail);
        if ($max === null) {
            return 'Từ '.$min.'kg trở lên';
        }

        return 'Từ '.$min.'kg đến '.$max.'kg';
    }

    private function normalizeRateInput(array $input, ?ShippingRate $existing = null): array
    {
        $from = $input['effective_from'] ?? $input['valid_from'] ?? $existing?->effective_from?->toDateString() ?? $existing?->valid_from?->toDateString() ?? now()->toDateString();
        $to = array_key_exists('effective_to', $input) ? $input['effective_to'] : ($input['valid_to'] ?? $existing?->effective_to?->toDateString());

        return [
            'name' => $input['name'] ?? $existing?->name ?? 'Bảng cước dành cho khách lẻ',
            'customer_type' => $input['customer_type'] ?? $existing?->customer_type,
            'route_type' => $input['route_type'] ?? $existing?->route_type,
            'warehouse_id' => $input['warehouse_id'] ?? $existing?->warehouse_id,
            'effective_from' => $from,
            'effective_to' => $to,
            'valid_from' => $from,
            'valid_to' => $to ?: '2099-12-31',
            'status' => $input['status'] ?? $existing?->status ?? ShippingRate::STATUS_ACTIVE,
            'note' => $input['note'] ?? $existing?->note,
        ];
    }

    private function normalizeDetailInput(int|string $rateId, array $input, ?ShippingRateDetail $existing = null): array
    {
        $min = (float) ($input['min_weight'] ?? $input['weight_from'] ?? $this->detailMin($existing));
        $max = array_key_exists('max_weight', $input) ? $input['max_weight'] : ($input['weight_to'] ?? $this->detailMax($existing));
        $max = $max === '' ? null : $max;
        $price = (float) ($input['price'] ?? $input['price_per_kg'] ?? $this->detailPrice($existing));

        return [
            'rate_id' => $rateId,
            'shipping_rate_id' => $rateId,
            'weight_from' => $min,
            'weight_to' => $max,
            'min_weight' => $min,
            'max_weight' => $max,
            'price_per_kg' => $price,
            'price' => $price,
            'price_type' => $input['price_type'] ?? $existing?->price_type ?? 'per_kg',
            'description' => $input['description'] ?? $existing?->description,
            'sort_order' => (int) ($input['sort_order'] ?? $existing?->sort_order ?? 0),
        ];
    }

    private function assertDetailsValid(array $details): void
    {
        $ranges = [];
        foreach ($details as $detail) {
            $min = (float) ($detail['min_weight'] ?? $detail['weight_from'] ?? 0);
            $max = array_key_exists('max_weight', $detail) ? $detail['max_weight'] : ($detail['weight_to'] ?? null);
            $max = $max === '' ? null : $max;
            $price = (float) ($detail['price'] ?? $detail['price_per_kg'] ?? 0);
            if ($min < 0) {
                throw new HttpException(422, 'Từ kg không được âm.');
            }
            if ($max !== null && (float) $max <= $min) {
                throw new HttpException(422, 'Đến kg phải lớn hơn Từ kg.');
            }
            if ($price <= 0) {
                throw new HttpException(422, 'Đơn giá phải lớn hơn 0.');
            }
            $ranges[] = ['min' => $min, 'max' => $max === null ? null : (float) $max];
        }

        usort($ranges, fn ($a, $b) => $a['min'] <=> $b['min']);
        for ($i = 1; $i < count($ranges); $i++) {
            $prev = $ranges[$i - 1];
            $current = $ranges[$i];
            if ($prev['max'] === null || $current['min'] < $prev['max']) {
                throw new HttpException(422, 'Khung cân không được trùng hoặc chồng lấn.');
            }
        }
    }

    private function assertNoActiveOverlap(array $rateData, ?int $ignoreId = null): void
    {
        if (($rateData['status'] ?? null) !== ShippingRate::STATUS_ACTIVE) {
            return;
        }
        $from = $rateData['effective_from'];
        $to = $rateData['effective_to'] ?? '2099-12-31';
        $exists = ShippingRate::query()
            ->when($ignoreId, fn ($query) => $query->whereKeyNot($ignoreId))
            ->where('status', ShippingRate::STATUS_ACTIVE)
            ->where(function ($query) use ($rateData) {
                foreach (['customer_type', 'route_type', 'warehouse_id'] as $field) {
                    if (empty($rateData[$field])) {
                        $query->whereNull($field);
                    } else {
                        $query->where($field, $rateData[$field]);
                    }
                }
            })
            ->whereDate(DB::raw('COALESCE(effective_from, valid_from)'), '<=', $to)
            ->whereDate(DB::raw('COALESCE(effective_to, valid_to)'), '>=', $from)
            ->exists();
        if ($exists) {
            throw new HttpException(422, 'Đã có bảng giá active trùng thời gian áp dụng.');
        }
    }

    private function detailMin(?ShippingRateDetail $detail): float
    {
        return (float) ($detail?->min_weight ?? $detail?->weight_from ?? 0);
    }

    private function detailMax(?ShippingRateDetail $detail): ?float
    {
        $value = $detail?->max_weight ?? $detail?->weight_to;

        return $value === null ? null : (float) $value;
    }

    private function detailPrice(?ShippingRateDetail $detail): float
    {
        return (float) ($detail?->price ?? $detail?->price_per_kg ?? 0);
    }
}
