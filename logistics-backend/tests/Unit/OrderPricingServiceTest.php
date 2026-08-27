<?php

namespace Tests\Unit;

use App\Services\Orders\OrderPricingService;
use PHPUnit\Framework\TestCase;

class OrderPricingServiceTest extends TestCase
{
    public function test_converts_single_item_cny_to_vnd(): void
    {
        $service = new OrderPricingService;

        $this->assertSame(177336, $service->convertCnyToVnd('49.26', '3600'));
        $this->assertSame('49.26', $service->multiplyCnyByQuantity('49.26', 1));
    }

    public function test_converts_multiple_items_without_losing_cny_decimals(): void
    {
        $service = new OrderPricingService;

        $firstSubtotal = $service->multiplyCnyByQuantity('49.26', 2);
        $secondSubtotal = $service->multiplyCnyByQuantity('17.10', 1);

        $this->assertSame('98.52', $firstSubtotal);
        $this->assertSame('17.10', $secondSubtotal);
        $this->assertSame(354672, $service->convertCnyToVnd($firstSubtotal, '3600'));
        $this->assertSame(61560, $service->convertCnyToVnd($secondSubtotal, '3600'));
    }

    public function test_rounds_vnd_to_nearest_dong(): void
    {
        $service = new OrderPricingService;

        $this->assertSame(177336, $service->convertCnyToVnd('49.26', '3600.0000'));
        $this->assertSame(177361, $service->convertCnyToVnd('49.26', '3600.5000'));
    }
}
