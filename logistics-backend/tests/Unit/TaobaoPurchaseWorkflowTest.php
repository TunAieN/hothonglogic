<?php

namespace Tests\Unit;

use App\Exceptions\TaobaoPurchaseValidationException;
use App\Services\Orders\TaobaoPurchaseAllocationPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class TaobaoPurchaseWorkflowTest extends TestCase
{
    public static function validCases(): array
    {
        return [
            'one purchase' => [[['items' => [['order_item_id' => '1', 'quantity' => 2]]]], 2, 0, true],
            'many shops and purchases' => [[['items' => [['order_item_id' => '1', 'quantity' => 2], ['order_item_id' => '2', 'quantity' => 1]]], ['items' => [['order_item_id' => '3', 'quantity' => 2]]], ['items' => [['order_item_id' => '3', 'quantity' => 1]]]], 6, 0, true],
            'partial purchase remains incomplete' => [[['items' => [['order_item_id' => '1', 'quantity' => 1]]]], 1, 1, false],
            'one item split twice' => [[['items' => [['order_item_id' => '1', 'quantity' => 1]]], ['items' => [['order_item_id' => '1', 'quantity' => 1]]]], 2, 0, true],
        ];
    }

    #[DataProvider('validCases')]
    public function test_allocation_progress(array $purchases, int $bought, int $remaining, bool $complete): void
    {
        $ordered = isset($purchases[0]['items'][1]) ? ['1' => 2, '2' => 1, '3' => 3] : ['1' => 2];
        $result = (new TaobaoPurchaseAllocationPolicy)->evaluate($ordered, $purchases);
        self::assertSame($bought, $result['purchased']);
        self::assertSame($remaining, $result['remaining']);
        self::assertSame($complete, $result['complete']);
    }

    public function test_over_purchase_is_rejected(): void
    {
        $this->expectException(TaobaoPurchaseValidationException::class);
        (new TaobaoPurchaseAllocationPolicy)->evaluate(['1' => 2], [['items' => [['order_item_id' => '1', 'quantity' => 3]]]]);
    }

    public function test_foreign_order_item_is_rejected(): void
    {
        $this->expectException(TaobaoPurchaseValidationException::class);
        (new TaobaoPurchaseAllocationPolicy)->evaluate(['1' => 2], [['items' => [['order_item_id' => '99', 'quantity' => 1]]]]);
    }

    public function test_duplicate_line_in_purchase_is_rejected(): void
    {
        $this->expectException(TaobaoPurchaseValidationException::class);
        (new TaobaoPurchaseAllocationPolicy)->evaluate(['1' => 2], [['items' => [['order_item_id' => '1', 'quantity' => 1], ['order_item_id' => '1', 'quantity' => 1]]]]);
    }

    public function test_migration_is_additive_and_tracking_is_independent(): void
    {
        $root = dirname(__DIR__, 2);
        $migration = file_get_contents($root.'/database/migrations/2026_11_27_000057_create_taobao_purchase_order_domain.php');
        $service = file_get_contents($root.'/app/Services/Orders/TaobaoPurchaseOrderService.php');
        $resolver = file_get_contents($root.'/app/GraphQL/Resolvers/OrderResolver.php');
        self::assertStringContainsString("Schema::create('taobao_purchase_orders'", $migration);
        self::assertStringContainsString("Schema::create('taobao_purchase_order_items'", $migration);
        self::assertStringNotContainsString("Schema::table('orders'", $migration);
        self::assertStringNotContainsString('syncOrderTrackings', $service);
        self::assertStringContainsString("'status' => 'awaiting_tracking'", $service);
        self::assertStringContainsString("\$currentStatus === 'purchasing' && in_array(\$nextStatus, ['awaiting_tracking', 'waiting_cn_warehouse']", $resolver);
        self::assertStringContainsString('taobaoPurchaseOrders()->exists()', $resolver);
        self::assertStringContainsString("string('external_order_code', 191)", $migration);
    }
}
