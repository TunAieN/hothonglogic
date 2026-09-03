<?php

namespace Tests\Feature;

use App\Models\CnBatch;
use App\Models\CnPackage;
use App\Models\CnWarehouse;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerBalanceLedger;
use App\Models\Order;
use App\Models\PaymentAccount;
use App\Models\PaymentVoucher;
use App\Models\Role;
use App\Models\ShippingRate;
use App\Models\ShippingRateDetail;
use App\Models\ShippingTask;
use App\Models\User;
use App\Models\VnBatchReceipt;
use App\Models\VnPackage;
use App\Models\VnWarehouse;
use App\Services\Customers\CustomerAddressService;
use App\Services\Payments\PaymentVoucherService;
use App\Services\Shipping\GhnService;
use App\Services\Shipping\ShipmentService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class PaymentVoucherAmountsTest extends TestCase
{
    use DatabaseTransactions;

    private User $user;

    private Customer $customer;

    private CnWarehouse $cnWarehouse;

    private CnBatch $batch;

    private VnBatchReceipt $receipt;

    private ShippingRateDetail $rateDetail;

    protected function setUp(): void
    {
        parent::setUp();

        $suffix = strtoupper(substr(uniqid(), -8));
        $role = Role::query()->create([
            'name' => 'Payment voucher test '.$suffix,
            'permissions' => ['payment_vouchers.create'],
        ]);
        $this->user = User::query()->create([
            'name' => 'Payment voucher tester',
            'email' => 'payment-'.$suffix.'@example.test',
            'password' => 'password',
            'role_id' => $role->id,
            'status' => 'active',
        ]);
        $this->customer = Customer::query()->create([
            'code' => 'PAY-'.$suffix,
            'name' => 'Khách thanh toán kiểm thử',
            'phone' => '0900000000',
            'status' => 'active',
        ]);
        $this->cnWarehouse = CnWarehouse::query()->create([
            'code' => 'CP'.$suffix,
            'name' => 'Kho Trung Quốc kiểm thử',
            'status' => 'active',
        ]);
        $vnWarehouse = VnWarehouse::query()->create([
            'code' => 'VP'.$suffix,
            'name' => 'Kho Việt Nam kiểm thử',
        ]);
        $this->batch = CnBatch::query()->create([
            'batch_code' => 'PAY-BATCH-'.$suffix,
            'warehouse_id' => $this->cnWarehouse->id,
            'destination_warehouse_name' => $vnWarehouse->name,
            'total_packages' => 0,
            'status' => CnBatch::STATUS_ARRIVED_VN,
            'shipping_type' => 'normal',
        ]);
        $this->receipt = VnBatchReceipt::query()->create([
            'cn_batch_id' => $this->batch->id,
            'vn_warehouse_id' => $vnWarehouse->id,
            'batch_code' => $this->batch->batch_code,
            'status' => VnBatchReceipt::STATUS_CONFIRMED,
            'total_expected_packages' => 0,
            'received_at' => now(),
            'confirmed_at' => now(),
        ]);

        ShippingRate::query()->update(['status' => ShippingRate::STATUS_INACTIVE]);
        $rate = ShippingRate::query()->create([
            'name' => 'Fixed payment voucher test rate',
            'valid_from' => now()->subDay()->toDateString(),
            'valid_to' => now()->addYear()->toDateString(),
            'effective_from' => now()->subDay()->toDateString(),
            'effective_to' => now()->addYear()->toDateString(),
            'status' => ShippingRate::STATUS_ACTIVE,
        ]);
        $this->rateDetail = ShippingRateDetail::query()->create([
            'rate_id' => $rate->id,
            'shipping_rate_id' => $rate->id,
            'weight_from' => 0,
            'weight_to' => 999999,
            'min_weight' => 0,
            'max_weight' => 999999,
            'price_per_kg' => 400000,
            'price' => 400000,
            'price_type' => 'fixed',
            'description' => 'Giá cố định kiểm thử',
        ]);

        PaymentAccount::query()->update(['is_default' => false]);
        PaymentAccount::query()->create([
            'bank_name' => 'Ngân hàng kiểm thử',
            'account_number' => '123456789',
            'account_holder' => 'FGC TEST',
            'is_default' => true,
            'is_active' => true,
        ]);

        Auth::login($this->user);
    }

    public function test_one_order_one_package_with_deposit_uses_full_payment_formula(): void
    {
        $order = $this->createOrder(48996, 34297);
        $package = $this->createPackage($order);

        $preview = $this->preview([$package]);

        $this->assertSame(48996.0, $preview['product_total']);
        $this->assertSame(400000.0, $preview['weight_shipping_total']);
        $this->assertSame(448996.0, $preview['gross_total']);
        $this->assertSame(34297.0, $preview['deposit_applied']);
        $this->assertSame(414699.0, $preview['total_amount']);
        $this->assertSame(414699.0, $preview['remaining_amount']);
    }

    public function test_created_voucher_persists_final_amount_and_order_snapshot(): void
    {
        $order = $this->createOrder(48996, 34297);
        $package = $this->createPackage($order);

        $voucher = $this->createVoucher([$package]);

        $this->assertSame(48996, $voucher->base_amount_vnd);
        $this->assertSame(400000.0, (float) $voucher->items()->where('item_type', 'weight_fee')->sum('amount'));
        $this->assertSame(34297.0, $voucher->deposit_applied);
        $this->assertSame(414699.0, $voucher->total_amount);
        $this->assertSame(0.0, $voucher->paid_amount);
        $this->assertSame(414699.0, $voucher->remaining_amount);
    }

    public function test_multiple_packages_of_one_order_do_not_duplicate_product_or_deposit(): void
    {
        $this->setShippingFee(10000);
        $order = $this->createOrder(100000, 30000);
        $packages = [$this->createPackage($order), $this->createPackage($order), $this->createPackage($order)];

        $preview = $this->preview($packages);

        $this->assertSame(100000.0, $preview['product_total']);
        $this->assertSame(30000.0, $preview['weight_shipping_total']);
        $this->assertSame(30000.0, $preview['deposit_applied']);
        $this->assertSame(100000.0, $preview['remaining_amount']);
    }

    public function test_multiple_orders_for_same_customer_are_each_counted_once(): void
    {
        $this->setShippingFee(20000);
        $firstOrder = $this->createOrder(100000, 10000);
        $secondOrder = $this->createOrder(200000, 20000);

        $preview = $this->preview([$this->createPackage($firstOrder), $this->createPackage($secondOrder)]);

        $this->assertSame(300000.0, $preview['product_total']);
        $this->assertSame(40000.0, $preview['weight_shipping_total']);
        $this->assertSame(30000.0, $preview['deposit_applied']);
        $this->assertSame(310000.0, $preview['remaining_amount']);
    }

    public function test_order_without_deposit_has_no_deposit_deduction(): void
    {
        $this->setShippingFee(20000);
        $order = $this->createOrder(50000, 0);

        $preview = $this->preview([$this->createPackage($order)]);

        $this->assertSame(0.0, $preview['deposit_applied']);
        $this->assertSame(70000.0, $preview['total_amount']);
    }

    public function test_partially_paid_deposit_deducts_only_the_paid_snapshot(): void
    {
        $this->setShippingFee(20000);
        $order = $this->createOrder(100000, 25000, 70000);

        $preview = $this->preview([$this->createPackage($order)]);

        $this->assertSame(25000.0, $preview['deposit_applied']);
        $this->assertSame(95000.0, $preview['remaining_amount']);
    }

    public function test_customer_credit_is_applied_after_deposit_and_persisted_to_ledger(): void
    {
        $this->setShippingFee(20000);
        $order = $this->createOrder(100000, 30000);
        $package = $this->createPackage($order);
        $this->giveCustomerCredit(50000);

        $preview = $this->preview([$package]);
        $voucher = $this->createVoucher([$package]);

        $this->assertSame(50000.0, $preview['customer_credit_applied']);
        $this->assertSame(40000.0, $preview['remaining_amount']);
        $this->assertSame(40000.0, $voucher->total_amount);
        $this->assertSame(0.0, (float) CustomerBalanceLedger::query()->where('customer_id', $this->customer->id)->latest('id')->value('balance_after'));
    }

    public function test_package_and_voucher_surcharges_are_included_once(): void
    {
        $this->setShippingFee(20000);
        $order = $this->createOrder(100000);
        $package = $this->createPackage($order);
        $surcharges = [
            ['vn_package_id' => (string) $package->id, 'surcharge_type' => 'wooden', 'amount' => 5000],
            ['surcharge_type' => 'other', 'amount' => 7000],
        ];

        $preview = $this->preview([$package], $surcharges);

        $this->assertSame(12000.0, $preview['additional_charge_total']);
        $this->assertSame(132000.0, $preview['gross_total']);
        $this->assertSame(132000.0, $preview['remaining_amount']);
    }

    public function test_combined_amounts_apply_order_shipping_surcharge_deposit_and_credit_in_order(): void
    {
        $this->setShippingFee(20000);
        $firstOrder = $this->createOrder(100000, 30000);
        $secondOrder = $this->createOrder(50000, 10000);
        $firstPackage = $this->createPackage($firstOrder);
        $secondPackage = $this->createPackage($secondOrder);
        $this->giveCustomerCredit(15000);
        $surcharges = [['vn_package_id' => (string) $firstPackage->id, 'surcharge_type' => 'other', 'amount' => 5000]];

        $preview = $this->preview([$firstPackage, $secondPackage], $surcharges);

        $this->assertSame(150000.0, $preview['order_total']);
        $this->assertSame(40000.0, $preview['weight_shipping_total']);
        $this->assertSame(5000.0, $preview['additional_charge_total']);
        $this->assertSame(195000.0, $preview['gross_total']);
        $this->assertSame(40000.0, $preview['deposit_applied']);
        $this->assertSame(15000.0, $preview['customer_credit_applied']);
        $this->assertSame(140000.0, $preview['remaining_amount']);
    }

    public function test_preview_and_created_voucher_amounts_are_identical(): void
    {
        $this->setShippingFee(30000);
        $order = $this->createOrder(120000, 20000);
        $package = $this->createPackage($order);
        $surcharges = [['surcharge_type' => 'other', 'amount' => 9000]];

        $preview = $this->preview([$package], $surcharges);
        $voucher = $this->createVoucher([$package], $surcharges);

        $this->assertSame($preview['product_total'], (float) $voucher->base_amount_vnd);
        $this->assertSame($preview['weight_shipping_total'], (float) $voucher->items()->where('item_type', 'weight_fee')->sum('amount'));
        $this->assertSame($preview['additional_charge_total'], (float) $voucher->items()->where('item_type', 'surcharge')->sum('amount'));
        $this->assertSame($preview['deposit_applied'], $voucher->deposit_applied);
        $this->assertSame($preview['customer_credit_applied'], $voucher->customer_credit_applied);
        $this->assertSame($preview['total_amount'], $voucher->total_amount);
        $this->assertSame($preview['remaining_amount'], $voucher->remaining_amount);
    }

    public function test_delivery_fee_is_rechecked_with_ghn_and_client_value_is_ignored(): void
    {
        $this->setShippingFee(30000);
        $order = $this->createOrder(120000, 20000);
        $packages = [$this->createPackage($order), $this->createPackage($order)];

        $preview = $this->preview($packages, [], 52000);
        $this->mock(GhnService::class, function ($mock) {
            $mock->shouldReceive('validateDestination')->once()->andReturn([
                'province' => ['province_id' => 201, 'name' => 'Hà Nội'],
                'district' => ['district_id' => 1482, 'province_id' => 201, 'name' => 'Nam Từ Liêm'],
                'ward' => ['ward_code' => '1A0607', 'district_id' => 1482, 'name' => 'Mỹ Đình 2'],
            ]);
            $mock->shouldReceive('quote')->once()->andReturn([
                'total' => 52000, 'service_fee' => 52000, 'insurance_fee' => 0,
                'service_id' => 53320, 'service_type_id' => 2, 'service_name' => 'Hàng nhẹ',
            ]);
        });
        $voucher = $this->createVoucher($packages, [], 'delivery', 1);

        $this->assertSame(52000.0, $preview['delivery_fee_total']);
        $this->assertSame(232000.0, $preview['gross_total']);
        $this->assertSame(212000.0, $preview['remaining_amount']);
        $this->assertSame(52000.0, (float) $voucher->items()->where('item_type', 'domestic_shipping')->sum('amount'));
        $this->assertSame(212000.0, $voucher->remaining_amount);
        $this->assertSame(232000.0, $voucher->subtotal);
        $this->assertSame(20000.0, $voucher->discount_amount);
        $this->assertSame(212000.0, app(PaymentVoucherService::class)->calculateVoucherTotal($voucher));
        $this->assertSame(52000.0, (float) $voucher->items()->where('item_type', 'domestic_shipping')->sum('amount'));
        $this->assertSame('delivery', $voucher->deliveryRequest?->delivery_method);
        $this->assertSame('GHN', $voucher->deliveryRequest?->preferred_carrier);
        $this->assertSame('Người nhận kiểm thử', $voucher->deliveryRequest?->address?->receiver_name);
        $this->assertSame('12 Lê Đức Thọ, Mỹ Đình 2, Nam Từ Liêm, Hà Nội', $voucher->deliveryRequest?->address?->full_address);

        $task = ShippingTask::query()->create([
            'task_code' => 'SHIP-'.uniqid(), 'delivery_staff_id' => $this->user->id,
            'vn_warehouse_id' => $this->receipt->vn_warehouse_id, 'carrier_code' => 'spx',
            'carrier_name' => 'SPX Express', 'scheduled_delivery_date' => now()->addDay(),
            'status' => ShippingTask::STATUS_CREATED, 'created_by' => $this->user->id,
        ]);
        $request = $voucher->deliveryRequest;
        $request->update(['shipping_task_id' => $task->id, 'status' => 'processing']);
        $shipment = app(ShipmentService::class)->createPending($request->fresh(), [
            'carrier_code' => 'SPX', 'shipping_fee' => 52000, 'cod_amount' => 0,
            'weight' => 2, 'length' => 40, 'width' => 30, 'height' => 25,
        ]);
        $this->assertSame('pending', $shipment->status);
        $this->assertSame('SPX', $shipment->carrier_code);
        $this->assertNull($shipment->tracking_number);
        $this->assertCount(1, $shipment->trackingEvents);
    }

    public function test_ghn_delivery_fee_remains_in_preview_and_created_voucher_totals(): void
    {
        $this->setShippingFee(10000000);
        $order = $this->createOrder(788040, 551628);
        $package = $this->createPackage($order);

        $preview = $this->preview([$package], [], 1031620);

        $this->assertSame(788040.0, $preview['product_total']);
        $this->assertSame(10000000.0, $preview['weight_shipping_total']);
        $this->assertSame(1031620.0, $preview['delivery_fee_total']);
        $this->assertSame(11819660.0, $preview['gross_total']);
        $this->assertSame(551628.0, $preview['deposit_applied']);
        $this->assertSame(11268032.0, $preview['remaining_amount']);

        $refreshedPreview = $this->preview([$package], [], 1031620);
        $this->assertSame(1031620.0, $refreshedPreview['delivery_fee_total']);
        $this->assertSame(11819660.0, $refreshedPreview['gross_total']);
        $this->assertSame(11268032.0, $refreshedPreview['remaining_amount']);

        $this->mockGhnQuote(1031620, 1, null, 788040);
        $voucher = $this->createVoucher([$package], [], 'delivery', 1);

        $this->assertSame(11819660.0, $voucher->subtotal);
        $this->assertSame(11268032.0, $voucher->total_amount);
        $this->assertSame(11268032.0, $voucher->remaining_amount);
        $this->assertSame(1031620.0, (float) $voucher->items()->where('item_type', 'domestic_shipping')->sum('amount'));
    }

    public function test_pickup_ignores_a_submitted_delivery_fee(): void
    {
        $this->setShippingFee(30000);
        $package = $this->createPackage($this->createOrder(120000));

        $voucher = $this->createVoucher([$package], [], 'pickup_at_warehouse', 52000);

        $this->assertSame(0.0, (float) $voucher->items()->where('item_type', 'domestic_shipping')->sum('amount'));
        $this->assertSame(150000.0, $voucher->remaining_amount);
        $this->assertSame('pickup_at_warehouse', $voucher->deliveryRequest?->delivery_method);
        $this->assertNull($voucher->deliveryRequest?->address);
    }

    public function test_existing_customer_address_is_copied_to_an_immutable_delivery_snapshot(): void
    {
        $package = $this->createPackage($this->createOrder(120000));
        $source = $this->createCustomerAddress($this->customer, true);
        $this->mockGhnQuote(34000);

        $voucher = $this->createVoucher([$package], [], 'delivery', 1, [
            'customer_address_id' => $source->id,
            'receiver_name' => 'Dữ liệu client không được tin',
        ]);
        $snapshot = $voucher->deliveryRequest?->address;

        $this->assertSame($source->id, $snapshot?->source_customer_address_id);
        $this->assertSame('Người nhận sổ địa chỉ', $snapshot?->receiver_name);
        $this->assertSame('12 Lê Đức Thọ, Mỹ Đình 2, Nam Từ Liêm, Hà Nội', $snapshot?->full_address);

        $this->mock(GhnService::class, function ($mock) {
            $mock->shouldReceive('validateDestination')->once()->andReturn([
                'province' => ['province_id' => 201, 'name' => 'Hà Nội'],
                'district' => ['district_id' => 1482, 'province_id' => 201, 'name' => 'Nam Từ Liêm'],
                'ward' => ['ward_code' => '1A0607', 'district_id' => 1482, 'name' => 'Mỹ Đình 2'],
            ]);
        });
        app(CustomerAddressService::class)->update($this->customer->id, $source->id, [
            'label' => 'Nhà đã sửa',
            'receiver_name' => 'Tên đã sửa',
            'receiver_phone' => '0900000000',
            'province_code' => '201', 'province_name' => 'Hà Nội',
            'district_code' => '1482', 'district_name' => 'Nam Từ Liêm',
            'ward_code' => '1A0607', 'ward_name' => 'Mỹ Đình 2',
            'address_line' => 'Địa chỉ đã sửa',
            'is_default' => true,
        ]);
        $this->assertSame('Người nhận sổ địa chỉ', $snapshot?->fresh()->receiver_name);
        $this->assertSame('12 Lê Đức Thọ', $snapshot?->fresh()->address_line);
    }

    public function test_customer_cannot_use_an_address_owned_by_another_customer(): void
    {
        $package = $this->createPackage($this->createOrder(120000));
        $other = Customer::query()->create([
            'code' => 'OTHER-'.uniqid(), 'name' => 'Khách khác', 'phone' => '0911111111', 'status' => 'active',
        ]);
        $foreignAddress = $this->createCustomerAddress($other);

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('Địa chỉ không thuộc khách hàng đã chọn.');

        $this->createVoucher([$package], [], 'delivery', 1, ['customer_address_id' => $foreignAddress->id]);
    }

    public function test_new_saved_default_address_and_snapshot_are_created_in_the_voucher_transaction(): void
    {
        $package = $this->createPackage($this->createOrder(120000));
        $oldDefault = $this->createCustomerAddress($this->customer, true);
        $this->mockGhnQuote(34000);

        $voucher = $this->createVoucher([$package], [], 'delivery', 1, [
            'save_address' => true,
            'set_address_default' => true,
            'address_label' => 'Công ty',
        ]);

        $newAddress = CustomerAddress::query()->where('customer_id', $this->customer->id)->where('label', 'Công ty')->firstOrFail();
        $this->assertFalse((bool) $oldDefault->fresh()->is_default);
        $this->assertTrue((bool) $newAddress->is_default);
        $this->assertSame($newAddress->id, $voucher->deliveryRequest?->address?->source_customer_address_id);
    }

    public function test_one_off_address_creates_only_delivery_snapshot(): void
    {
        $package = $this->createPackage($this->createOrder(120000));
        $this->mockGhnQuote(34000);

        $voucher = $this->createVoucher([$package], [], 'delivery', 1, ['save_address' => false]);

        $this->assertSame(0, CustomerAddress::query()->where('customer_id', $this->customer->id)->count());
        $this->assertNull($voucher->deliveryRequest?->address?->source_customer_address_id);
        $this->assertSame('Người nhận kiểm thử', $voucher->deliveryRequest?->address?->receiver_name);
    }

    public function test_saved_address_rolls_back_when_ghn_quote_fails(): void
    {
        $package = $this->createPackage($this->createOrder(120000));
        $this->mockGhnQuote(0, 1, new HttpException(504, 'GHN timeout'));

        try {
            $this->createVoucher([$package], [], 'delivery', 1, [
                'save_address' => true,
                'address_label' => 'Không được lưu dở dang',
            ]);
            $this->fail('Expected GHN failure.');
        } catch (HttpException $exception) {
            $this->assertSame('GHN timeout', $exception->getMessage());
        }

        $this->assertFalse(CustomerAddress::query()->where('customer_id', $this->customer->id)->exists());
        $this->assertFalse(PaymentVoucher::query()->where('customer_id', $this->customer->id)->where('voucher_type', 'shipping')->exists());
    }

    private function createOrder(int $productTotal, int $depositPaid = 0, ?int $depositRequired = null): Order
    {
        $suffix = strtoupper(substr(uniqid(), -8));

        return Order::query()->create([
            'order_code' => 'PAY-ORD-'.$suffix,
            'customer_id' => $this->customer->id,
            'status' => $depositPaid > 0 ? 'deposited' : 'receiving',
            'product_total_cny' => round($productTotal / 3600, 2),
            'product_total_vnd' => $productTotal,
            'currency' => 'VND',
            'deposit_amount_vnd' => $depositRequired ?? $depositPaid,
            'deposit_paid_amount_vnd' => $depositPaid,
            'deposit_remaining_amount_vnd' => max(0, ($depositRequired ?? $depositPaid) - $depositPaid),
            'deposit_status' => $depositPaid > 0 ? PaymentVoucher::STATUS_PAID : null,
            'created_by' => $this->user->id,
        ]);
    }

    private function createPackage(Order $order): VnPackage
    {
        $suffix = strtoupper(substr(uniqid(), -8));
        $cnPackage = CnPackage::query()->create([
            'warehouse_id' => $this->cnWarehouse->id,
            'order_id' => $order->id,
            'tracking_number' => 'PAY-TRACK-'.$suffix,
            'carrier' => 'Test',
            'weight' => 1,
            'status' => 'matched',
            'created_by' => $this->user->id,
        ]);
        $this->batch->packages()->attach($cnPackage->id);

        return VnPackage::query()->create([
            'vn_batch_receipt_id' => $this->receipt->id,
            'cn_batch_id' => $this->batch->id,
            'cn_package_id' => $cnPackage->id,
            'tracking_number_snapshot' => $cnPackage->tracking_number,
            'actual_weight' => 1,
            'actual_length' => 20,
            'actual_width' => 15,
            'actual_height' => 10,
            'inspection_status' => VnPackage::STATUS_INSPECTED,
            'payment_status' => 'unpaid',
            'delivery_status' => 'inspected',
            'received_at' => now(),
        ]);
    }

    private function setShippingFee(int $amount): void
    {
        $this->rateDetail->update([
            'price_per_kg' => $amount,
            'price' => $amount,
        ]);
    }

    private function giveCustomerCredit(int $amount): void
    {
        CustomerBalanceLedger::query()->create([
            'customer_id' => $this->customer->id,
            'type' => 'credit',
            'amount' => $amount,
            'balance_after' => $amount,
            'description' => 'Tiền dư kiểm thử',
            'created_by' => $this->user->id,
        ]);
    }

    private function preview(array $packages, array $surcharges = [], int $deliveryFee = 0): array
    {
        return app(PaymentVoucherService::class)->preview([
            'package_ids' => collect($packages)->pluck('id')->all(),
            'surcharges' => $surcharges,
            'delivery_fee' => $deliveryFee,
        ]);
    }

    private function createVoucher(array $packages, array $surcharges = [], string $deliveryMethod = 'pickup_at_warehouse', int $deliveryFee = 0, array $overrides = []): PaymentVoucher
    {
        return app(PaymentVoucherService::class)->create([
            'package_ids' => collect($packages)->pluck('id')->all(),
            'request_uuid' => (string) Str::uuid(),
            'delivery_method' => $deliveryMethod,
            'receiver_name' => $deliveryMethod === 'pickup_at_warehouse' ? null : 'Người nhận kiểm thử',
            'receiver_phone' => $deliveryMethod === 'pickup_at_warehouse' ? null : '0900000000',
            'province_name' => $deliveryMethod === 'pickup_at_warehouse' ? null : 'Hà Nội',
            'district_name' => $deliveryMethod === 'pickup_at_warehouse' ? null : 'Nam Từ Liêm',
            'ward_name' => $deliveryMethod === 'pickup_at_warehouse' ? null : 'Mỹ Đình 2',
            'address_line' => $deliveryMethod === 'pickup_at_warehouse' ? null : '12 Lê Đức Thọ',
            'full_address' => $deliveryMethod === 'pickup_at_warehouse' ? null : '12 Lê Đức Thọ, Hà Nội',
            'preferred_carrier' => $deliveryMethod === 'pickup_at_warehouse' ? null : 'ghn',
            'province_code' => $deliveryMethod === 'pickup_at_warehouse' ? null : '201',
            'district_code' => $deliveryMethod === 'pickup_at_warehouse' ? null : '1482',
            'ward_code' => $deliveryMethod === 'pickup_at_warehouse' ? null : '1A0607',
            'delivery_fee' => $deliveryFee,
            'payment_method_expected' => 'bank_transfer',
            'surcharges' => $surcharges,
            ...$overrides,
        ]);
    }

    private function createCustomerAddress(Customer $customer, bool $isDefault = false): CustomerAddress
    {
        return CustomerAddress::query()->create([
            'customer_id' => $customer->id,
            'label' => 'Nhà riêng',
            'receiver_name' => 'Người nhận sổ địa chỉ',
            'receiver_phone' => '0900000000',
            'province_code' => '201',
            'province_name' => 'Hà Nội',
            'district_code' => '1482',
            'district_name' => 'Nam Từ Liêm',
            'ward_code' => '1A0607',
            'ward_name' => 'Mỹ Đình 2',
            'address_line' => '12 Lê Đức Thọ',
            'full_address' => '12 Lê Đức Thọ, Mỹ Đình 2, Nam Từ Liêm, Hà Nội',
            'is_default' => $isDefault,
        ]);
    }

    private function mockGhnQuote(int $fee, int $validationCalls = 1, ?\Throwable $quoteException = null, ?int $expectedInsuranceValue = null): void
    {
        $this->mock(GhnService::class, function ($mock) use ($fee, $validationCalls, $quoteException, $expectedInsuranceValue) {
            $mock->shouldReceive('validateDestination')->times($validationCalls)->andReturn([
                'province' => ['province_id' => 201, 'name' => 'Hà Nội'],
                'district' => ['district_id' => 1482, 'province_id' => 201, 'name' => 'Nam Từ Liêm'],
                'ward' => ['ward_code' => '1A0607', 'district_id' => 1482, 'name' => 'Mỹ Đình 2'],
            ]);
            $quote = $mock->shouldReceive('quote')->once();
            if ($expectedInsuranceValue !== null) {
                $quote->withArgs(fn (array $input) => ($input['insurance_value'] ?? null) === $expectedInsuranceValue);
            }
            if ($quoteException) {
                $quote->andThrow($quoteException);
            } else {
                $quote->andReturn([
                    'total' => $fee, 'service_fee' => $fee, 'insurance_fee' => 0,
                    'service_id' => 53320, 'service_type_id' => 2, 'service_name' => 'Hàng nhẹ',
                ]);
            }
        });
    }
}
