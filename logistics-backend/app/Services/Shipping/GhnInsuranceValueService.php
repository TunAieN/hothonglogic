<?php

namespace App\Services\Shipping;

use App\Models\VnPackage;
use Illuminate\Support\Collection;
use RuntimeException;

class GhnInsuranceValueService
{
    public function forPackages(Collection $packages): int
    {
        $goodsValue = $packages
            ->map(fn (VnPackage $package) => $package->cnPackage?->order)
            ->filter()
            ->unique('id')
            ->sum(fn ($order) => max(0, (float) ($order->product_total_vnd ?? 0)));

        return $this->clamp($goodsValue);
    }

    public function clamp(float|int $value): int
    {
        $maximum = (int) config('services.ghn.max_insurance_value');
        if ($maximum <= 0) {
            throw new RuntimeException('GHN max insurance value must be a positive integer.');
        }

        return min($maximum, max(0, (int) round($value)));
    }
}
