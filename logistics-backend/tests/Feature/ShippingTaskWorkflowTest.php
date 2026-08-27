<?php

namespace Tests\Feature;

use App\Models\CnPackage;
use App\Models\CnWarehouse;
use App\Models\Customer;
use App\Models\ExportItem;
use App\Models\ExportSlip;
use App\Models\Order;
use App\Models\PaymentTransaction;
use App\Models\PaymentVoucher;
use App\Models\PaymentVoucherPackage;
use App\Models\Role;
use App\Models\ShippingTask;
use App\Models\User;
use App\Models\VnPackage;
use App\Models\VnWarehouse;
use App\Services\Shipping\ShippingTaskService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class ShippingTaskWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    public function test_paid_order_is_removed_from_queue_and_generates_task_and_slip_atomically(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        Auth::login($user);
        $service = app(ShippingTaskService::class);

        $before = $service->queueOptions([(string) $order->id]);
        $this->assertCount(1, $before);
        $this->assertSame(1, $before[0]['package_count']);

        $task = $service->create([
            'order_ids' => [(string) $order->id],
            'delivery_staff_id' => (string) $user->id,
            'carrier_code' => 'ghn',
            'scheduled_delivery_date' => now()->addDay()->toDateString(),
            'vn_warehouse_id' => (string) $warehouse->id,
            'service_type' => 'standard',
            'delivery_method' => 'door_delivery',
            'estimated_shipping_fee' => 35000,
            'cod_amount' => 800000,
        ]);

        $this->assertMatchesRegularExpression('/^NVX-\d{8}-\d{4,}$/', $task->task_code);
        $this->assertMatchesRegularExpression('/^PXH-\d{8}-\d{4,}$/', $task->exportSlip->export_code);
        $this->assertSame(1, $task->taskOrders->count());
        $this->assertSame(35000.0, (float) $task->estimated_shipping_fee);
        $this->assertSame(800000.0, (float) $task->cod_amount);
        $this->assertDatabaseHas('shipping_task_orders', [
            'shipping_task_id' => $task->id,
            'order_id' => $order->id,
            'package_count' => 1,
        ]);
        $this->assertDatabaseHas('export_items', [
            'export_id' => $task->exportSlip->id,
            'vn_package_id' => $package->id,
        ]);
        $this->assertSame('export_task_created', $package->fresh()->delivery_status);
        $this->assertSame([], $service->queueOptions([(string) $order->id]));
    }

    public function test_same_paid_package_cannot_be_assigned_twice(): void
    {
        [$user, $warehouse, $order] = $this->shippingFixture();
        Auth::login($user);
        $service = app(ShippingTaskService::class);
        $taskCount = ShippingTask::query()->count();
        $slipCount = ExportSlip::query()->count();
        $itemCount = ExportItem::query()->count();
        $input = [
            'order_ids' => [(string) $order->id],
            'delivery_staff_id' => (string) $user->id,
            'carrier_code' => 'ghn',
            'scheduled_delivery_date' => now()->addDay()->toDateString(),
            'vn_warehouse_id' => (string) $warehouse->id,
        ];

        $service->create($input);

        try {
            $service->create($input);
            $this->fail('Expected the second task creation to be rejected.');
        } catch (HttpException $exception) {
            $this->assertSame(422, $exception->getStatusCode());
        }

        $this->assertSame($taskCount + 1, ShippingTask::query()->count());
        $this->assertSame($slipCount + 1, ExportSlip::query()->count());
        $this->assertSame($itemCount + 1, ExportItem::query()->count());
    }

    public function test_shipping_queue_serializes_payment_date_through_graphql(): void
    {
        [$user, , $order] = $this->shippingFixture();
        Sanctum::actingAs($user, ['*'], 'api');

        $response = $this->postJson('/graphql', [
            'query' => <<<'GRAPHQL'
                query ShippingQueueSerialization {
                  shippingQueueOrders(page: 1, first: 10) {
                    data { id payment_date }
                  }
                }
                GRAPHQL,
        ]);

        $response->assertOk()->assertJsonMissingPath('errors');
        $row = collect($response->json('data.shippingQueueOrders.data'))
            ->firstWhere('id', (string) $order->id);

        $this->assertNotNull($row);
        $this->assertIsString($row['payment_date']);
        $this->assertStringStartsWith(now()->format('Y-m-d'), $row['payment_date']);
    }

    public function test_task_list_supports_real_stats_search_and_filters(): void
    {
        [$user, $warehouse, $order] = $this->shippingFixture();
        Auth::login($user);
        $service = app(ShippingTaskService::class);
        $task = $service->create([
            'order_ids' => [(string) $order->id],
            'delivery_staff_id' => (string) $user->id,
            'carrier_code' => 'ghn',
            'scheduled_delivery_date' => now()->addDay()->toDateString(),
            'vn_warehouse_id' => (string) $warehouse->id,
        ]);

        $result = $service->tasks([
            'search' => $task->task_code,
            'status' => ShippingTask::STATUS_CREATED,
            'carrier_code' => 'ghn',
            'delivery_staff_id' => (string) $user->id,
            'date_from' => now()->toDateString(),
            'date_to' => now()->toDateString(),
            'sort_field' => 'task_code',
            'sort_direction' => 'asc',
        ], 1, 10);

        $this->assertSame(1, $result['paginatorInfo']['total']);
        $this->assertSame($task->task_code, $result['data'][0]['task_code']);
        $this->assertSame($user->phone, $result['data'][0]['delivery_staff_phone']);
        $this->assertGreaterThanOrEqual(1, $result['stats']['total_tasks']);
    }

    public function test_task_status_transition_updates_slip_and_package(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        Auth::login($user);
        $service = app(ShippingTaskService::class);
        $task = $service->create([
            'order_ids' => [(string) $order->id],
            'delivery_staff_id' => (string) $user->id,
            'carrier_code' => 'ghn',
            'scheduled_delivery_date' => now()->addDay()->toDateString(),
            'vn_warehouse_id' => (string) $warehouse->id,
        ]);

        $this->assertSame('preparing', $service->updateStatus($task->id, 'preparing')['status']);
        $this->assertSame('in_transit', $service->updateStatus($task->id, 'in_transit')['status']);
        $this->assertSame('completed', $service->updateStatus($task->id, 'completed')['status']);
        $this->assertSame('delivered', $task->exportSlip->fresh()->status);
        $this->assertSame('delivered', $package->fresh()->delivery_status);
    }

    public function test_export_slip_list_supports_stats_search_filters_and_task_status(): void
    {
        [$user, $warehouse, $order] = $this->shippingFixture();
        Auth::login($user);
        $service = app(ShippingTaskService::class);
        $task = $service->create([
            'order_ids' => [(string) $order->id],
            'delivery_staff_id' => (string) $user->id,
            'carrier_code' => 'ghn',
            'scheduled_delivery_date' => now()->addDay()->toDateString(),
            'vn_warehouse_id' => (string) $warehouse->id,
        ]);
        $service->updateStatus($task->id, ShippingTask::STATUS_PREPARING);

        $result = $service->slips([
            'search' => $task->exportSlip->export_code,
            'status' => ShippingTask::STATUS_PREPARING,
            'carrier_code' => 'ghn',
            'delivery_staff_id' => (string) $user->id,
            'date_from' => now()->toDateString(),
            'date_to' => now()->toDateString(),
            'sort_direction' => 'asc',
        ], 1, 10);

        $this->assertSame(1, $result['paginatorInfo']['total']);
        $this->assertSame($task->exportSlip->export_code, $result['data'][0]['export_code']);
        $this->assertSame(ShippingTask::STATUS_PREPARING, $result['data'][0]['status']);
        $this->assertSame($user->phone, $result['data'][0]['delivery_staff_phone']);
        $this->assertGreaterThanOrEqual(1, $result['stats']['total_slips']);
        $this->assertGreaterThanOrEqual(1, $result['stats']['total_packages']);
        $this->assertGreaterThanOrEqual(5, $result['stats']['total_weight']);
        $this->assertGreaterThanOrEqual(320000, $result['stats']['total_value']);
    }

    public function test_export_slip_detail_uses_real_package_payment_and_audit_data(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        Auth::login($user);
        $voucher = PaymentVoucher::query()->create([
            'voucher_code' => 'PT-'.uniqid(),
            'customer_id' => $order->customer_id,
            'vn_warehouse_id' => $warehouse->id,
            'created_by' => $user->id,
            'payment_method_expected' => 'bank_transfer',
            'status' => PaymentVoucher::STATUS_PAID,
            'total_amount' => 40000,
            'paid_amount' => 40000,
            'remaining_amount' => 0,
        ]);
        $package->update(['payment_voucher_id' => $voucher->id]);
        PaymentVoucherPackage::query()->create([
            'payment_voucher_id' => $voucher->id,
            'vn_package_id' => $package->id,
            'order_id' => $order->id,
            'actual_weight' => 5,
            'chargeable_weight' => 5,
            'unit_price' => 35000,
            'price_type' => 'fixed',
            'domestic_shipping_fee' => 5000,
        ]);
        PaymentTransaction::query()->create([
            'transaction_code' => 'GD-'.uniqid(),
            'payment_voucher_id' => $voucher->id,
            'amount' => 40000,
            'payment_method' => 'bank_transfer',
            'bank_name' => 'Ngân hàng kiểm thử',
            'bank_transaction_code' => 'BANK-'.uniqid(),
            'received_at' => now()->subMinute(),
            'confirmed_by' => $user->id,
            'status' => PaymentTransaction::STATUS_CONFIRMED,
        ]);
        $service = app(ShippingTaskService::class);
        $task = $service->create([
            'order_ids' => [(string) $order->id],
            'delivery_staff_id' => (string) $user->id,
            'carrier_code' => 'ghn',
            'scheduled_delivery_date' => now()->addDay()->toDateString(),
            'vn_warehouse_id' => (string) $warehouse->id,
        ]);

        $detail = $service->slip($task->exportSlip->id);

        $this->assertSame('paid', $detail['payment']['status']);
        $this->assertSame('bank_transfer', $detail['payment']['payment_method']);
        $this->assertSame('Ngân hàng kiểm thử', $detail['payment']['bank_name']);
        $this->assertSame($user->name, $detail['payment']['confirmed_by']);
        $this->assertSame(40000.0, $detail['payment']['paid_amount']);
        $this->assertSame(320000.0, $detail['financials']['order_value']);
        $this->assertSame(40000.0, $detail['financials']['shipping_fee']);
        $this->assertSame(360000.0, $detail['financials']['total_amount']);
        $this->assertSame($order->order_code, $detail['packages'][0]['order_code']);
        $this->assertSame('Khách kiểm thử', $detail['packages'][0]['customer_name']);
        $this->assertContains('create_shipping_task', collect($detail['history'])->pluck('action')->all());

        $package->update(['payment_status' => 'unpaid']);
        $this->assertSame('unpaid', $service->slip($task->exportSlip->id)['payment']['status']);
    }

    private function shippingFixture(): array
    {
        $suffix = uniqid();
        $role = Role::query()->create([
            'name' => 'Shipping test '.$suffix,
            'permissions' => ['exports.read', 'exports.create', 'exports.update', 'exports.cancel'],
        ]);
        $user = User::query()->create([
            'name' => 'Shipping tester',
            'email' => "shipping-{$suffix}@example.test",
            'password' => 'password',
            'role_id' => $role->id,
            'status' => 'active',
        ]);
        $customer = Customer::query()->create([
            'code' => 'KH-'.$suffix,
            'name' => 'Khách kiểm thử',
            'phone' => '0900000000',
            'address' => 'Hà Nội',
            'status' => 'active',
        ]);
        $warehouse = VnWarehouse::query()->create([
            'code' => 'VN-'.substr($suffix, -8),
            'name' => 'Kho kiểm thử',
            'address' => 'Hà Nội',
        ]);
        $order = Order::query()->create([
            'order_code' => 'ORD-'.$suffix,
            'customer_id' => $customer->id,
            'status' => 'receiving',
            'product_total_vnd' => 320000,
            'currency' => 'VND',
            'created_by' => $user->id,
        ]);
        $cnWarehouse = CnWarehouse::query()->create([
            'code' => 'CN-'.substr($suffix, -8),
            'name' => 'Kho Trung Quốc kiểm thử',
            'address' => 'Quảng Châu',
            'status' => 'active',
        ]);
        $cnPackage = CnPackage::query()->create([
            'warehouse_id' => $cnWarehouse->id,
            'order_id' => $order->id,
            'tracking_number' => 'TRACK-'.$suffix,
            'carrier' => 'Giao hàng nhanh',
            'status' => 'matched',
            'created_by' => $user->id,
        ]);
        $package = VnPackage::query()->create([
            'cn_package_id' => $cnPackage->id,
            'tracking_number_snapshot' => $cnPackage->tracking_number,
            'actual_weight' => 5,
            'actual_length' => 20,
            'actual_width' => 15,
            'actual_height' => 10,
            'inspection_status' => VnPackage::STATUS_INSPECTED,
            'payment_status' => 'paid',
            'payment_locked_at' => now(),
            'delivery_status' => 'ready_for_delivery',
            'received_at' => now(),
        ]);

        return [$user, $warehouse, $order, $package];
    }
}
