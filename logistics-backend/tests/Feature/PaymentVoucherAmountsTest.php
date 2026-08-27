<?php

namespace Tests\Feature;

use App\Models\CnBatch;
use App\Models\CnPackage;
use App\Models\CnWarehouse;
use App\Models\Customer;
use App\Models\CustomerBalanceLedger;
use App\Models\Order;
use App\Models\PaymentAccount;
use App\Models\PaymentVoucher;
use App\Models\Role;
use App\Models\ShippingRate;
use App\Models\ShippingRateDetail;
use App\Models\User;
use App\Models\VnBatchReceipt;
use App\Models\VnPackage;
use App\Models\VnWarehouse;
use App\Services\Payments\PaymentVoucherService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
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
        $this->assertSame(400000.0, $preview['shipping_fee_total']);
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
        $this->assertSame(400000.0, $voucher->shipping_fee_total);
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
        $this->assertSame(30000.0, $preview['shipping_fee_total']);
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
        $this->assertSame(40000.0, $preview['shipping_fee_total']);
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

        $this->assertSame(12000.0, $preview['surcharge_total']);
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
        $this->assertSame(40000.0, $preview['shipping_fee_total']);
        $this->assertSame(5000.0, $preview['surcharge_total']);
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
        $this->assertSame($preview['shipping_fee_total'], $voucher->shipping_fee_total);
        $this->assertSame($preview['surcharge_total'], $voucher->surcharge_total);
        $this->assertSame($preview['deposit_applied'], $voucher->deposit_applied);
        $this->assertSame($preview['customer_credit_applied'], $voucher->customer_credit_applied);
        $this->assertSame($preview['total_amount'], $voucher->total_amount);
        $this->assertSame($preview['remaining_amount'], $voucher->remaining_amount);
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

    private function preview(array $packages, array $surcharges = []): array
    {
        return app(PaymentVoucherService::class)->preview([
            'package_ids' => collect($packages)->pluck('id')->all(),
            'surcharges' => $surcharges,
        ]);
    }

    private function createVoucher(array $packages, array $surcharges = []): PaymentVoucher
    {
        return app(PaymentVoucherService::class)->create([
            'package_ids' => collect($packages)->pluck('id')->all(),
            'request_uuid' => (string) Str::uuid(),
            'receiver_type' => 'pickup_at_warehouse',
            'payment_method_expected' => 'bank_transfer',
            'surcharges' => $surcharges,
        ]);
    }
}
