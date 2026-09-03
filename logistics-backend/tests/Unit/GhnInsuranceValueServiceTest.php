<?php

namespace Tests\Unit;

use App\Models\CnPackage;
use App\Models\Order;
use App\Models\VnPackage;
use App\Services\Shipping\GhnInsuranceValueService;
use Tests\TestCase;

class GhnInsuranceValueServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('services.ghn.max_insurance_value', 5_000_000);
    }

    public function test_one_order_and_one_package_uses_goods_value(): void
    {
        $this->assertSame(788040, $this->service()->forPackages(collect([
            $this->package($this->order(1, 788040)),
        ])));
    }

    public function test_multiple_packages_of_one_order_do_not_duplicate_goods_value(): void
    {
        $order = $this->order(1, 788040);

        $this->assertSame(788040, $this->service()->forPackages(collect([
            $this->package($order),
            $this->package($order),
            $this->package($order),
        ])));
    }

    public function test_unique_order_goods_values_are_summed(): void
    {
        $this->assertSame(1288040, $this->service()->forPackages(collect([
            $this->package($this->order(1, 788040)),
            $this->package($this->order(2, 500000)),
        ])));
    }

    public function test_goods_value_is_clamped_to_configured_ghn_limit(): void
    {
        $this->assertSame(5_000_000, $this->service()->forPackages(collect([
            $this->package($this->order(1, 6_000_000)),
        ])));
    }

    private function service(): GhnInsuranceValueService
    {
        return new GhnInsuranceValueService;
    }

    private function order(int $id, int $productTotal): Order
    {
        $order = new Order(['product_total_vnd' => $productTotal]);
        $order->id = $id;

        return $order;
    }

    private function package(Order $order): VnPackage
    {
        $cnPackage = new CnPackage;
        $cnPackage->setRelation('order', $order);
        $package = new VnPackage;
        $package->setRelation('cnPackage', $cnPackage);

        return $package;
    }
}
