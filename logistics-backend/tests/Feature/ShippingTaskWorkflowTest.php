<?php

namespace Tests\Feature;

use App\Models\CnPackage;
use App\Models\CnWarehouse;
use App\Models\Customer;
use App\Models\DeliveryAddress;
use App\Models\DeliveryRequest;
use App\Models\ExportItem;
use App\Models\ExportSlip;
use App\Models\Order;
use App\Models\PaymentTransaction;
use App\Models\PaymentVoucher;
use App\Models\PaymentVoucherItem;
use App\Models\PaymentVoucherPackage;
use App\Models\Role;
use App\Models\Shipment;
use App\Models\ShippingTask;
use App\Models\User;
use App\Models\VnPackage;
use App\Models\VnWarehouse;
use App\Services\Shipping\GhnService;
use App\Services\Shipping\ShippingTaskService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\Sanctum;
use Mockery;
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
            'cod_amount' => 0,
        ]);

        $this->assertMatchesRegularExpression('/^NVX-\d{8}-\d{4,}$/', $task->task_code);
        $this->assertMatchesRegularExpression('/^PXH-\d{8}-\d{4,}$/', $task->exportSlip->export_code);
        $this->assertSame(1, $task->taskOrders->count());
        $this->assertSame(35000.0, (float) $task->estimated_shipping_fee);
        $this->assertSame(0.0, (float) $task->cod_amount);
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
                    data { id payment_date settled_value }
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
        $this->assertSame(320000.0, (float) $row['settled_value']);
    }

    public function test_shipping_queue_uses_paid_voucher_gross_value_once_for_multiple_packages(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        $packages = collect([$package]);
        foreach (range(2, 3) as $index) {
            $copy = $package->replicate();
            $copy->tracking_number_snapshot = $package->tracking_number_snapshot.'-'.$index;
            $copy->save();
            $packages->push($copy);
        }
        $this->attachVoucher($user, $warehouse, $order, $packages, 11819660, 551628, 11268032);
        Auth::login($user);

        $rows = app(ShippingTaskService::class)->queueOptions([(string) $order->id]);

        $this->assertCount(1, $rows);
        $this->assertSame(3, $rows[0]['package_count']);
        $this->assertSame(11819660.0, $rows[0]['settled_value']);
    }

    public function test_shipping_queue_returns_one_row_and_full_settled_value_for_one_order(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        $this->attachVoucher($user, $warehouse, $order, collect([$package]), 11819660, 551628, 11268032);
        Auth::login($user);

        $rows = app(ShippingTaskService::class)->queueOptions([(string) $order->id]);

        $this->assertCount(1, $rows);
        $this->assertSame(1, $rows[0]['package_count']);
        $this->assertSame(11819660.0, $rows[0]['settled_value']);
    }

    public function test_shipping_queue_returns_two_rows_for_two_selected_orders(): void
    {
        [$user, , $firstOrder] = $this->shippingFixture();
        [, , $secondOrder] = $this->shippingFixture();
        Auth::login($user);

        $rows = app(ShippingTaskService::class)->queueOptions([
            (string) $firstOrder->id,
            (string) $secondOrder->id,
        ]);

        $this->assertCount(2, $rows);
        $this->assertSame(2, collect($rows)->sum('package_count'));
    }

    public function test_ghn_preview_matches_collected_fee_and_confirmation_creates_no_shipment(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        [$voucher, $request] = $this->attachPreviewDelivery($user, $warehouse, $order, $package, 1031620);
        $this->mockGhnPreview(1031620);
        Auth::login($user);
        $service = app(ShippingTaskService::class);

        $preview = $service->ghnPreview(['order_ids' => [(string) $order->id]]);

        $this->assertSame('matched', $preview['fee_status']);
        $this->assertSame(0.0, $preview['fee_difference']);
        $this->assertSame(11819660.0, $preview['settled_value']);
        $shipmentCount = Shipment::query()->count();
        $task = $service->create([
            'order_ids' => [(string) $order->id],
            'delivery_staff_id' => (string) $user->id,
            'carrier_code' => 'ghn',
            'scheduled_delivery_date' => now()->addDays(3)->toDateString(),
            'vn_warehouse_id' => (string) $warehouse->id,
            'service_type' => 'standard',
            'ghn_service_id' => 200,
            'ghn_service_type_id' => 2,
            'estimated_shipping_fee' => $preview['current_fee'],
            'cod_amount' => 0,
        ]);

        $this->assertNotNull($task->id);
        $this->assertSame($task->id, $request->fresh()->shipping_task_id);
        $this->assertSame(DeliveryRequest::STATUS_PROCESSING, $request->fresh()->status);
        $this->assertSame($shipmentCount, Shipment::query()->count());
        $this->assertSame(1031620.0, (float) $voucher->fresh()->items()->where('item_type', 'domestic_shipping')->sum('amount'));
    }

    public function test_ghn_preview_uses_order_goods_value_instead_of_paid_voucher_subtotal(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        $order->update(['product_total_vnd' => 788040]);
        [$voucher] = $this->attachPreviewDelivery($user, $warehouse, $order, $package, 1014119);
        $voucher->update(['subtotal' => 11802159]);
        $this->mockGhnPreview(1014119, 788040);
        Auth::login($user);

        $preview = app(ShippingTaskService::class)->ghnPreview(['order_ids' => [(string) $order->id]]);

        $this->assertSame(11802159.0, $preview['settled_value']);
        $this->assertSame(1014119.0, $preview['current_fee']);
        $this->assertSame(0.0, $preview['fee_difference']);
        $this->assertSame('matched', $preview['fee_status']);
    }

    public function test_task_detail_uses_paid_voucher_breakdown_and_delivery_snapshot_without_double_counting_ghn(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        $order->update(['product_total_vnd' => 788040]);
        [$voucher] = $this->attachPreviewDelivery($user, $warehouse, $order, $package, 1014119);
        PaymentVoucherItem::query()->create([
            'payment_voucher_id' => $voucher->id,
            'item_type' => 'order_amount',
            'description' => 'Giá trị hàng hóa',
            'quantity' => 1,
            'unit_price' => 788040,
            'amount' => 788040,
        ]);
        PaymentVoucherItem::query()->create([
            'payment_voucher_id' => $voucher->id,
            'item_type' => 'weight_fee',
            'description' => 'Cước Trung Quốc → Việt Nam',
            'quantity' => 1,
            'unit_price' => 10000000,
            'amount' => 10000000,
        ]);
        $voucher->update(['subtotal' => 11802159, 'paid_amount' => 20, 'remaining_amount' => 0]);
        PaymentTransaction::query()->create([
            'transaction_code' => 'GD-'.uniqid(),
            'payment_voucher_id' => $voucher->id,
            'amount' => 20,
            'payment_method' => 'bank_transfer',
            'received_at' => now(),
            'confirmed_by' => $user->id,
            'status' => PaymentTransaction::STATUS_CONFIRMED,
        ]);
        Auth::login($user);

        $task = app(ShippingTaskService::class)->create([
            'order_ids' => [(string) $order->id],
            'delivery_staff_id' => (string) $user->id,
            'carrier_code' => 'ghn',
            'scheduled_delivery_date' => now()->addDays(3)->toDateString(),
            'vn_warehouse_id' => (string) $warehouse->id,
            'service_type' => 'Hàng nhẹ',
            'delivery_method' => 'door_delivery',
            'estimated_shipping_fee' => 1014119,
            'cod_amount' => 0,
        ]);
        $detail = app(ShippingTaskService::class)->task($task->id);

        $this->assertSame(788040.0, $detail['financials']['product_total']);
        $this->assertSame(10000000.0, $detail['financials']['weight_shipping_total']);
        $this->assertSame(1014119.0, $detail['financials']['domestic_shipping_total']);
        $this->assertSame(0.0, $detail['financials']['surcharge_total']);
        $this->assertSame(11802159.0, $detail['financials']['settled_total']);
        $this->assertSame(0.0, $detail['financials']['remaining_amount']);
        $this->assertSame('paid', $detail['financials']['status']);
        $this->assertSame(11802159.0, $detail['orders'][0]['settled_total']);
        $this->assertSame(1014119.0, $detail['ghn']['collected_fee']);
        $this->assertSame(1014119.0, $detail['ghn']['current_fee']);
        $this->assertSame(0.0, $detail['ghn']['fee_difference']);
        $this->assertSame('+84987654321', $detail['delivery_address']['receiver_phone']);
        $this->assertSame('1A0607', $detail['delivery_address']['ward_code']);
        $this->assertFalse($detail['shipment']['exists']);

        $slipDetail = app(ShippingTaskService::class)->slip($task->exportSlip->id);
        $this->assertSame(788040.0, $slipDetail['financials']['product_total']);
        $this->assertSame(10000000.0, $slipDetail['financials']['weight_shipping_total']);
        $this->assertSame(1014119.0, $slipDetail['financials']['domestic_shipping_total']);
        $this->assertSame(0.0, $slipDetail['financials']['surcharge_total']);
        $this->assertSame(11802159.0, $slipDetail['financials']['settled_total']);
        $this->assertSame(0.0, $slipDetail['financials']['remaining_amount']);
        $this->assertSame('paid', $slipDetail['financials']['status']);
        $this->assertSame([$voucher->voucher_code], $slipDetail['payment']['voucher_codes']);
        $this->assertSame('+84987654321', $slipDetail['delivery_address']['receiver_phone']);
        $this->assertSame('1A0607', $slipDetail['delivery_address']['ward_code']);
        $this->assertSame(1014119.0, $slipDetail['ghn']['collected_fee']);
        $this->assertSame(1014119.0, $slipDetail['ghn']['current_fee']);
        $this->assertFalse($slipDetail['shipment']['exists']);

        Sanctum::actingAs($user, ['*'], 'api');
        $response = $this->postJson('/graphql', [
            'query' => <<<'GRAPHQL'
                query ShippingTaskDetail($id: ID!) {
                  shippingTask(id: $id) {
                    financials { product_total weight_shipping_total domestic_shipping_total surcharge_total settled_total remaining_amount status }
                    delivery_address { receiver_name receiver_phone district_code ward_code full_address }
                    ghn { mode service_name collected_fee current_fee fee_difference fee_status }
                    shipment { exists carrier_order_id tracking_number status }
                    orders { id settled_total }
                  }
                }
                GRAPHQL,
            'variables' => ['id' => (string) $task->id],
        ]);
        $response->assertOk()
            ->assertJsonPath('data.shippingTask.financials.settled_total', 11802159)
            ->assertJsonPath('data.shippingTask.orders.0.settled_total', 11802159)
            ->assertJsonPath('data.shippingTask.ghn.fee_difference', 0)
            ->assertJsonPath('data.shippingTask.shipment.exists', false);

        $slipResponse = $this->postJson('/graphql', [
            'query' => <<<'GRAPHQL'
                query ExportSlipDetail($id: ID!) {
                  exportSlip(id: $id) {
                    payment { voucher_codes settled_total remaining_amount }
                    financials { product_total weight_shipping_total domestic_shipping_total surcharge_total settled_total remaining_amount status }
                    delivery_address { receiver_name receiver_phone district_code ward_code full_address }
                    ghn { mode service_id service_name collected_fee current_fee fee_difference fee_status }
                    shipment { exists carrier_order_id tracking_number status }
                  }
                }
                GRAPHQL,
            'variables' => ['id' => (string) $task->exportSlip->id],
        ]);
        $slipResponse->assertOk()
            ->assertJsonPath('data.exportSlip.financials.settled_total', 11802159)
            ->assertJsonPath('data.exportSlip.delivery_address.ward_code', '1A0607')
            ->assertJsonPath('data.exportSlip.ghn.fee_difference', 0)
            ->assertJsonPath('data.exportSlip.shipment.exists', false);

        $task->update(['estimated_shipping_fee' => 1020000]);
        $changedFeeDetail = app(ShippingTaskService::class)->task($task->id);
        $this->assertSame(11802159.0, $changedFeeDetail['financials']['settled_total']);
        $this->assertSame(5881.0, $changedFeeDetail['ghn']['fee_difference']);
        $changedSlipDetail = app(ShippingTaskService::class)->slip($task->exportSlip->id);
        $this->assertSame(11802159.0, $changedSlipDetail['financials']['settled_total']);
        $this->assertSame(5881.0, $changedSlipDetail['ghn']['fee_difference']);
    }

    public function test_ghn_preview_warns_when_current_fee_increases_without_changing_voucher(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        [$voucher] = $this->attachPreviewDelivery($user, $warehouse, $order, $package, 1031620);
        $this->mockGhnPreview(1050000);
        Auth::login($user);

        $preview = app(ShippingTaskService::class)->ghnPreview(['order_ids' => [(string) $order->id]]);

        $this->assertSame('increased', $preview['fee_status']);
        $this->assertSame(18380.0, $preview['fee_difference']);
        $this->assertSame(1031620.0, (float) $voucher->fresh()->items()->where('item_type', 'domestic_shipping')->sum('amount'));
    }

    public function test_ghn_preview_is_available_through_shipping_graphql(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        $this->attachPreviewDelivery($user, $warehouse, $order, $package, 1031620);
        $this->mockGhnPreview(1031620);
        Sanctum::actingAs($user, ['*'], 'api');

        $response = $this->postJson('/graphql', [
            'query' => <<<'GRAPHQL'
                query ShippingTaskGhnPreview($input: ShippingTaskGhnPreviewInput!) {
                  shippingTaskGhnPreview(input: $input) {
                    mode validation_status service_id service_name collected_fee current_fee
                    fee_difference fee_status cod_amount estimated_delivery_at
                    warehouse { id name }
                    address { receiver_name district_code ward_code }
                  }
                }
                GRAPHQL,
            'variables' => ['input' => ['order_ids' => [(string) $order->id]]],
        ]);

        $response->assertOk()->assertJsonMissingPath('errors');
        $response->assertJsonPath('data.shippingTaskGhnPreview.mode', 'preview');
        $response->assertJsonPath('data.shippingTaskGhnPreview.fee_status', 'matched');
        $response->assertJsonPath('data.shippingTaskGhnPreview.address.ward_code', '1A0607');
    }

    public function test_ghn_preview_uses_the_only_configured_warehouse_for_legacy_null_links(): void
    {
        $warehouse = VnWarehouse::query()->first() ?? VnWarehouse::query()->create([
            'code' => 'VN-LEGACY',
            'name' => 'Kho Việt Nam',
            'address' => 'Hà Nội',
        ]);
        [$user, , $order, $package] = $this->shippingFixture($warehouse);
        [$voucher] = $this->attachPreviewDelivery($user, $warehouse, $order, $package, 1031620);
        $voucher->update(['vn_warehouse_id' => null]);
        $this->mockGhnPreview(1031620);
        Auth::login($user);

        $preview = app(ShippingTaskService::class)->ghnPreview(['order_ids' => [(string) $order->id]]);

        $this->assertSame((string) $warehouse->id, $preview['warehouse']['id']);
    }

    public function test_ghn_preview_rejects_delivery_address_without_ward_code_before_calling_ghn(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        [, $request] = $this->attachPreviewDelivery($user, $warehouse, $order, $package, 1031620);
        $request->address()->update(['ward_code' => null]);
        $ghn = Mockery::mock(GhnService::class);
        $ghn->shouldNotReceive('preview');
        $this->app->instance(GhnService::class, $ghn);
        Sanctum::actingAs($user, ['*'], 'api');

        $response = $this->postJson('/graphql', [
            'query' => 'query InvalidAddress($input: ShippingTaskGhnPreviewInput!) { shippingTaskGhnPreview(input: $input) { mode } }',
            'variables' => ['input' => ['order_ids' => [(string) $order->id]]],
        ]);

        $response->assertOk();
        $response->assertJsonPath('errors.0.message', 'Địa chỉ giao hàng chưa có mã GHN hợp lệ.');
    }

    public function test_shipping_queue_uses_full_value_when_voucher_has_no_deposit(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        $this->attachVoucher($user, $warehouse, $order, collect([$package]), 5000000, 0, 5000000);
        Auth::login($user);

        $rows = app(ShippingTaskService::class)->queueOptions([(string) $order->id]);

        $this->assertSame(5000000.0, $rows[0]['settled_value']);
    }

    public function test_shipping_queue_excludes_voucher_with_remaining_debt(): void
    {
        [$user, $warehouse, $order, $package] = $this->shippingFixture();
        $voucher = $this->attachVoucher($user, $warehouse, $order, collect([$package]), 5000000, 0, 4000000);
        $voucher->update([
            'status' => PaymentVoucher::STATUS_PARTIAL_PAID,
            'remaining_amount' => 1000000,
        ]);
        Auth::login($user);

        $this->assertSame([], app(ShippingTaskService::class)->queueOptions([(string) $order->id]));
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
            'subtotal' => 40000,
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
        ]);
        PaymentVoucherItem::query()->create([
            'payment_voucher_id' => $voucher->id,
            'item_type' => 'weight_fee',
            'description' => 'Phí vận chuyển TQ → VN',
            'quantity' => 1,
            'unit_price' => 35000,
            'amount' => 35000,
        ]);
        PaymentVoucherItem::query()->create([
            'payment_voucher_id' => $voucher->id,
            'item_type' => 'domestic_shipping',
            'description' => 'Phí giao hàng nội địa Việt Nam',
            'quantity' => 1,
            'unit_price' => 5000,
            'amount' => 5000,
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
        $this->assertSame(0.0, $detail['financials']['product_total']);
        $this->assertSame(35000.0, $detail['financials']['weight_shipping_total']);
        $this->assertSame(5000.0, $detail['financials']['domestic_shipping_total']);
        $this->assertSame(40000.0, $detail['financials']['settled_total']);
        $this->assertSame($order->order_code, $detail['packages'][0]['order_code']);
        $this->assertSame('Khách kiểm thử', $detail['packages'][0]['customer_name']);
        $this->assertContains('create_shipping_task', collect($detail['history'])->pluck('action')->all());

        $package->update(['payment_status' => 'unpaid']);
        $this->assertSame('unpaid', $service->slip($task->exportSlip->id)['payment']['status']);
    }

    private function shippingFixture(?VnWarehouse $existingWarehouse = null): array
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
        $warehouse = $existingWarehouse ?? VnWarehouse::query()->create([
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

    private function attachVoucher(User $user, VnWarehouse $warehouse, Order $order, $packages, float $grossValue, float $deposit, float $finalPayment): PaymentVoucher
    {
        $voucher = PaymentVoucher::query()->create([
            'voucher_code' => 'PT-'.uniqid(),
            'customer_id' => $order->customer_id,
            'vn_warehouse_id' => $warehouse->id,
            'created_by' => $user->id,
            'payment_method_expected' => 'bank_transfer',
            'status' => PaymentVoucher::STATUS_PAID,
            'subtotal' => $grossValue,
            'total_amount' => $finalPayment,
            'deposit_applied' => $deposit,
            'paid_amount' => $finalPayment,
            'remaining_amount' => 0,
            'paid_at' => now(),
        ]);

        foreach ($packages as $package) {
            $package->update(['payment_voucher_id' => $voucher->id]);
            PaymentVoucherPackage::query()->create([
                'payment_voucher_id' => $voucher->id,
                'vn_package_id' => $package->id,
                'order_id' => $order->id,
                'actual_weight' => $package->actual_weight,
                'chargeable_weight' => $package->actual_weight,
                'unit_price' => 1,
                'price_type' => 'fixed',
                'shipping_fee' => 1,
                'total_amount' => 1,
            ]);
        }

        return $voucher;
    }

    private function attachPreviewDelivery(User $user, VnWarehouse $warehouse, Order $order, VnPackage $package, float $collectedFee): array
    {
        $voucher = $this->attachVoucher($user, $warehouse, $order, collect([$package]), 11819660, 551628, 11268032);
        PaymentVoucherItem::query()->create([
            'payment_voucher_id' => $voucher->id,
            'item_type' => 'domestic_shipping',
            'description' => 'Phí giao hàng nội địa Việt Nam',
            'quantity' => 1,
            'unit_price' => $collectedFee,
            'amount' => $collectedFee,
        ]);
        $request = DeliveryRequest::query()->create([
            'customer_id' => $order->customer_id,
            'payment_voucher_id' => $voucher->id,
            'order_id' => $order->id,
            'delivery_method' => DeliveryRequest::METHOD_DELIVERY,
            'preferred_carrier' => 'GHN',
            'status' => DeliveryRequest::STATUS_READY_TO_SHIP,
            'created_by' => $user->id,
        ]);
        DeliveryAddress::query()->create([
            'delivery_request_id' => $request->id,
            'receiver_name' => 'Nguyễn Minh Anh',
            'receiver_phone' => '+84987654321',
            'province_code' => '201',
            'province_name' => 'Hà Nội',
            'district_code' => '1482',
            'district_name' => 'Nam Từ Liêm',
            'ward_code' => '1A0607',
            'ward_name' => 'Mỹ Đình 2',
            'address_line' => '25 Trần Thái Tông',
            'full_address' => '25 Trần Thái Tông, Mỹ Đình 2, Nam Từ Liêm, Hà Nội',
        ]);

        return [$voucher, $request];
    }

    private function mockGhnPreview(float $currentFee, ?int $expectedInsuranceValue = null): void
    {
        $ghn = Mockery::mock(GhnService::class);
        $expectation = $ghn->shouldReceive('preview')->once();
        if ($expectedInsuranceValue !== null) {
            $expectation->withArgs(fn (array $input) => ($input['insurance_value'] ?? null) === $expectedInsuranceValue);
        }
        $expectation->andReturn([
            'mode' => 'preview',
            'services' => [['service_id' => 200, 'service_type_id' => 2, 'service_name' => 'Hàng nhẹ']],
            'service' => ['service_id' => 200, 'service_type_id' => 2, 'service_name' => 'Hàng nhẹ'],
            'current_fee' => $currentFee,
            'estimated_delivery_at' => '2026-09-05T08:00:00+07:00',
            'dimensions' => ['weight' => 5000, 'length' => 20, 'width' => 15, 'height' => 10],
        ]);
        $this->app->instance(GhnService::class, $ghn);
    }
}
