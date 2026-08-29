<?php

namespace Tests\Feature;

use App\Models\ShippingRate;
use App\Services\Shipping\ShippingRateService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class ShippingRateServiceTest extends TestCase
{
    use DatabaseTransactions;

    public function test_updating_rate_with_multiple_valid_details_preserves_each_price(): void
    {
        $rate = ShippingRate::query()->create([
            'name' => 'Bảng giá regression test',
            'valid_from' => '2026-02-02',
            'valid_to' => '2027-02-02',
            'effective_from' => '2026-02-02',
            'effective_to' => '2027-02-02',
            'status' => ShippingRate::STATUS_INACTIVE,
        ]);

        $updated = app(ShippingRateService::class)->update($rate->id, [
            'name' => $rate->name,
            'effective_from' => '2026-02-02',
            'effective_to' => '2027-02-02',
            'status' => ShippingRate::STATUS_INACTIVE,
            'details' => [
                ['min_weight' => 0, 'max_weight' => 1, 'price' => 25000, 'price_type' => 'per_kg', 'sort_order' => 0],
                ['min_weight' => 1, 'max_weight' => 5, 'price' => 30000, 'price_type' => 'per_kg', 'sort_order' => 1],
                ['min_weight' => 5, 'max_weight' => null, 'price' => 35000, 'price_type' => 'per_kg', 'sort_order' => 2],
            ],
        ]);

        $this->assertCount(3, $updated->details);
        $this->assertSame([25000.0, 30000.0, 35000.0], $updated->details->pluck('price')->all());
    }
}
