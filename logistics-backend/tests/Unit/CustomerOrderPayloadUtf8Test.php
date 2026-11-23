<?php

namespace Tests\Unit;

use App\Http\Controllers\CustomerPurchaseController;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\Orders\CustomerPurchaseRequestService;
use App\Services\Orders\OrderPricingService;
use Illuminate\Support\Carbon;
use Mockery;
use ReflectionMethod;
use Tests\TestCase;

class CustomerOrderPayloadUtf8Test extends TestCase
{
    public function test_order_mapper_preserves_chinese_lines_containing_byte_85(): void
    {
        $pricing = Mockery::mock(OrderPricingService::class);
        $pricing->shouldReceive('multiplyCnyByQuantity')->once()->with('12.50', 2)->andReturn('25.00');
        $controller = new CustomerPurchaseController($pricing, new CustomerPurchaseRequestService($pricing));

        $item = new OrderItem([
            'product_name' => '儿童包装套装 — Áo trẻ em — 日本語',
            'product_link' => 'https://item.taobao.com/item.htm?id=unicode',
            'price_cny' => '12.50',
            'unit_price_vnd' => 450000,
            'quantity' => 2,
            'subtotal_cny' => '25.00',
            'subtotal_vnd' => 900000,
            'note' => "Phân loại: 包装: 3包\nSKU nguồn: sku-包\nThuộc tính: 商品规格: 升级包装【3包】 / 颜色分类: 蓝色\nGhi chú 🎁",
        ]);
        $item->id = 1756;

        $order = new Order([
            'order_code' => 'REQ-UNICODE', 'status' => 'pending', 'creation_source' => Order::SOURCE_CUSTOMER_PORTAL,
            'product_total_cny' => '25.00', 'product_total_vnd' => 900000, 'exchange_rate' => '36000.0000', 'currency' => 'CNY',
        ]);
        $order->id = 3287;
        $order->created_at = Carbon::parse('2026-11-22 10:00:00');
        $order->updated_at = Carbon::parse('2026-11-22 10:00:00');
        $order->setRelation('items', collect([$item]));

        $method = new ReflectionMethod($controller, 'orderPayload');
        $payload = $method->invoke($controller, $order, false);

        $this->assertSame('儿童包装套装 — Áo trẻ em — 日本語', $payload['items'][0]['product_name']);
        $this->assertSame('包装: 3包', $payload['items'][0]['variant_label']);
        $this->assertSame('sku-包', $payload['items'][0]['source_sku_id']);
        $this->assertSame(['商品规格' => '升级包装【3包】', '颜色分类' => '蓝色'], $payload['items'][0]['selected_attributes']);
        $this->assertSame('Ghi chú 🎁', $payload['items'][0]['note']);
        $this->assertNotFalse(json_encode($payload, JSON_THROW_ON_ERROR));
    }
}
