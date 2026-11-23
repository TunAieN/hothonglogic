<?php

namespace Tests\Feature;

use App\Models\CnBatch;
use App\Models\CnPackage;
use App\Models\CnPackageItem;
use App\Models\CnWarehouse;
use App\Models\Customer;
use App\Models\CustomerAccount;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderTracking;
use App\Models\OrderTrackingItem;
use App\Models\VnPackage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CustomerLogisticsPortalTest extends TestCase
{
    use DatabaseTransactions;

    public function test_list_counts_physical_packages_once_and_never_leaks_a_shared_batch(): void
    {
        $owner = $this->authenticate('logistics-owner');
        $other = $this->account('logistics-other');
        $warehouse = $this->warehouse();
        $batch = CnBatch::query()->create([
            'batch_code' => 'BATCH-'.Str::upper(Str::random(8)),
            'warehouse_id' => $warehouse->id,
            'status' => 'arrived_vn',
            'departed_at' => '2026-11-18 08:00:00',
            'expected_arrival_at' => '2026-11-23 08:00:00',
            'arrived_at' => '2026-11-22 08:00:00',
        ]);

        $owned = $this->package($warehouse, $this->order((int) $owner->customer_id, 'OWNED'));
        $foreign = $this->package($warehouse, $this->order((int) $other->customer_id, 'FOREIGN'));
        foreach ([$owned, $foreign] as $package) {
            DB::table('cn_batch_packages')->insert([
                'cn_batch_id' => $batch->id,
                'cn_package_id' => $package->id,
                'created_at' => '2026-11-18 09:00:00',
                'updated_at' => '2026-11-18 09:00:00',
            ]);
        }
        VnPackage::query()->create([
            'cn_batch_id' => $batch->id,
            'cn_package_id' => $owned->id,
            'tracking_number_snapshot' => $owned->tracking_number,
            'inspection_status' => 'inspected',
            'delivery_status' => 'waiting_delivery',
            'scanned_at' => '2026-11-22 09:00:00',
            'received_at' => '2026-11-22 10:00:00',
        ]);

        $this->getJson('/customer-portal/warehouse-packages')->assertOk()
            ->assertJsonCount(1, 'packages')
            ->assertJsonPath('packages.0.id', $owned->id)
            ->assertJsonPath('statistics.total', 1)
            ->assertJsonPath('statistics.vn_received', 1);

        $this->getJson('/customer-portal/tracking?code='.urlencode($foreign->tracking_number))
            ->assertOk()->assertJsonCount(0, 'results');
    }

    public function test_tracking_returns_multiple_owned_packages_and_marks_eta_as_an_estimate(): void
    {
        $account = $this->authenticate('tracking-owner');
        $warehouse = $this->warehouse();
        $order = $this->order((int) $account->customer_id, 'MULTI');
        $tracking = OrderTracking::query()->create([
            'order_id' => $order->id,
            'tracking_number' => 'YT'.Str::upper(Str::random(12)),
            'carrier' => 'YTO',
            'status' => 'received',
            'dispatched_at' => '2026-11-17 10:00:00',
        ]);
        $packages = collect([1, 2])->map(fn () => $this->package($warehouse, $order, $tracking));
        $orderItem = OrderItem::query()->create([
            'order_id' => $order->id,
            'product_name' => '儿童保暖外套',
            'product_image' => 'https://img.example.test/product.jpg',
            'color' => 'Đỏ',
            'size' => 'L',
            'quantity' => 5,
        ]);
        OrderTrackingItem::query()->create(['order_tracking_id' => $tracking->id, 'order_item_id' => $orderItem->id, 'quantity' => 5]);
        CnPackageItem::query()->create(['cn_package_id' => $packages->first()->id, 'order_item_id' => $orderItem->id, 'quantity' => 2]);
        $batch = CnBatch::query()->create([
            'batch_code' => 'ETA-'.Str::upper(Str::random(8)),
            'warehouse_id' => $warehouse->id,
            'status' => 'exporting',
            'departed_at' => '2026-11-20 08:00:00',
            'expected_arrival_at' => '2026-11-25 08:00:00',
        ]);
        foreach ($packages as $package) {
            DB::table('cn_batch_packages')->insert([
                'cn_batch_id' => $batch->id,
                'cn_package_id' => $package->id,
                'created_at' => '2026-11-20 07:00:00',
                'updated_at' => '2026-11-20 07:00:00',
            ]);
        }

        $response = $this->getJson('/customer-portal/tracking?code='.urlencode($order->order_code))->assertOk()
            ->assertJsonCount(1, 'results')
            ->assertJsonCount(2, 'results.0.packages')
            ->assertJsonCount(1, 'results.0.packages.0.products')
            ->assertJsonPath('results.0.packages.0.products.0.variant', 'Đỏ / L')
            ->assertJsonCount(0, 'results.0.packages.1.products');

        $events = collect($response->json('results.0.packages.0.timeline'))->keyBy('key');
        $this->assertSame('estimate', $events['batch_eta']['kind']);
        $this->assertSame('2026-11-25T08:00:00.000000Z', $events['batch_eta']['occurred_at']);

        $this->getJson('/customer-portal/tracking?code='.$packages->first()->id)->assertOk()
            ->assertJsonCount(1, 'results')->assertJsonCount(1, 'results.0.packages');
    }

    public function test_detail_and_order_shipments_are_scoped_to_the_authenticated_customer(): void
    {
        $owner = $this->authenticate('scope-owner');
        $other = $this->account('scope-other');
        $warehouse = $this->warehouse();
        $ownedOrder = $this->order((int) $owner->customer_id, 'SCOPE-OWNED');
        $foreignOrder = $this->order((int) $other->customer_id, 'SCOPE-FOREIGN');
        $ownedPackage = $this->package($warehouse, $ownedOrder);
        $foreignPackage = $this->package($warehouse, $foreignOrder);

        $this->getJson('/customer-portal/warehouse-packages/'.$ownedPackage->id)->assertOk()
            ->assertJsonPath('package.id', $ownedPackage->id);
        $this->getJson('/customer-portal/warehouse-packages/'.$foreignPackage->id)->assertNotFound();
        $this->getJson('/customer-portal/orders/'.$foreignOrder->id.'/shipments')->assertNotFound();

        auth('customer')->logout();
        $this->getJson('/customer-portal/warehouse-packages')->assertUnauthorized();
    }

    private function package(CnWarehouse $warehouse, Order $order, ?OrderTracking $tracking = null): CnPackage
    {
        return CnPackage::query()->create([
            'warehouse_id' => $warehouse->id,
            'order_id' => $order->id,
            'order_tracking_id' => $tracking?->id,
            'tracking_number' => 'PKG'.Str::upper(Str::random(14)),
            'carrier' => $tracking?->carrier,
            'weight' => 2.35,
            'status' => 'matched',
            'received_at' => '2026-11-18 08:00:00',
        ]);
    }

    private function order(int $customerId, string $suffix): Order
    {
        return Order::query()->create([
            'order_code' => 'REQ-'.$suffix.'-'.Str::upper(Str::random(6)),
            'customer_id' => $customerId,
            'status' => 'purchasing',
            'total_amount' => 0,
        ]);
    }

    private function warehouse(): CnWarehouse
    {
        return CnWarehouse::query()->create([
            'code' => 'QA'.Str::upper(Str::random(8)),
            'name' => 'Kho Quảng Châu QA',
            'address' => 'Guangzhou, China',
            'status' => 'active',
        ]);
    }

    private function authenticate(string $suffix): CustomerAccount
    {
        $account = $this->account($suffix);
        $this->actingAs($account, 'customer')->withSession([
            'customer_password_fingerprint' => hash('sha256', $account->password),
        ]);

        return $account;
    }

    private function account(string $suffix): CustomerAccount
    {
        $customer = Customer::query()->create([
            'code' => 'KH'.Str::upper(Str::random(8)),
            'name' => 'Khách '.$suffix,
            'phone' => '+849'.random_int(10000000, 99999999),
            'email' => $suffix.'-'.Str::uuid().'@example.test',
            'status' => 'active',
        ]);

        return CustomerAccount::query()->create([
            'customer_id' => $customer->id,
            'email' => $customer->email,
            'phone_e164' => $customer->phone,
            'password' => 'Matkhauantoan123',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);
    }
}
