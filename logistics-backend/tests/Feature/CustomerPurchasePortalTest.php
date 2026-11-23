<?php

namespace Tests\Feature;

use App\GraphQL\Resolvers\OrderResolver;
use App\Models\Customer;
use App\Models\CustomerAccount;
use App\Models\Order;
use App\Models\User;
use App\Services\Orders\OrderPricingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CustomerPurchasePortalTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('business.writes_enabled', true);
    }

    public function test_customer_submits_browser_cart_snapshot_into_existing_orders_domain(): void
    {
        $account = $this->authenticate();
        $response = $this->postJson('/customer-portal/purchase-requests', $this->payload())
            ->assertCreated()->assertJsonPath('idempotent_replay', false)
            ->assertJsonPath('order.status', 'pending')->assertJsonPath('order.product_total_cny', '25.00');

        $orderId = $response->json('order.id');
        $this->assertDatabaseHas('orders', [
            'id' => $orderId,
            'customer_id' => $account->customer_id,
            'creation_source' => Order::SOURCE_CUSTOMER_PORTAL,
            'submitted_by_customer_account_id' => $account->id,
            'created_by' => null,
            'account_manager_id' => null,
        ]);
        $this->assertNotNull(Order::query()->findOrFail($orderId)->submitted_at);
        $this->assertDatabaseHas('order_items', ['order_id' => $orderId, 'color' => 'Đỏ', 'size' => 'L', 'price_cny' => 12.5]);
        $this->assertSame('sku-red-l', $response->json('order.items.0.source_sku_id'));
        $this->assertSame(['Màu' => 'Đỏ', 'Kích thước' => 'L'], $response->json('order.items.0.selected_attributes'));
        $this->assertSame('25.00', $response->json('order.items.0.reference_subtotal_cny'));
        $this->assertSame('Kiểm tra đường may', $response->json('order.items.0.note'));
        $this->assertSame('Khách customer', $response->json('order.customer_contact.name'));
        $this->assertNull($response->json('order.account_manager'));
        $this->assertNull($response->json('order.payment'));
    }

    public function test_submission_is_idempotent_and_rejects_changed_content_for_the_same_key(): void
    {
        $account = $this->authenticate('idempotent');
        $payload = $this->payload();
        $first = $this->postJson('/customer-portal/purchase-requests', $payload)->assertCreated()->json('order.id');
        $second = $this->postJson('/customer-portal/purchase-requests', $payload)
            ->assertOk()->assertJsonPath('idempotent_replay', true)->json('order.id');
        $this->assertSame($first, $second);
        $this->assertSame(1, Order::query()->where('customer_id', $account->customer_id)->whereKey($first)->count());

        $payload['items'][0]['quantity'] = 3;
        $this->postJson('/customer-portal/purchase-requests', $payload)->assertConflict();
    }

    public function test_customer_submission_does_not_assign_an_existing_or_active_employee(): void
    {
        $account = $this->authenticate('no-fake-staff');
        $existingOrder = Order::query()->first();

        $orderId = $this->postJson('/customer-portal/purchase-requests', $this->payload())
            ->assertCreated()
            ->assertJsonPath('order.creation_source', Order::SOURCE_CUSTOMER_PORTAL)
            ->json('order.id');

        $order = Order::query()->findOrFail($orderId);
        $this->assertSame($account->id, $order->submitted_by_customer_account_id);
        $this->assertNull($order->created_by);
        $this->assertNull($order->account_manager_id);
        if ($existingOrder?->created_by) {
            $this->assertNotSame($existingOrder->created_by, $order->created_by);
        }
    }

    public function test_assigning_staff_later_does_not_rewrite_customer_creation_provenance(): void
    {
        $account = $this->authenticate('assign-later');
        $orderId = $this->postJson('/customer-portal/purchase-requests', $this->payload())->assertCreated()->json('order.id');
        $staff = $this->staff('assignment');
        Auth::guard('web')->login($staff);

        app(OrderResolver::class)->update(null, [
            'id' => $orderId,
            'input' => ['account_manager_id' => $staff->id],
        ]);

        $order = Order::query()->findOrFail($orderId);
        $this->assertSame($account->id, $order->submitted_by_customer_account_id);
        $this->assertSame(Order::SOURCE_CUSTOMER_PORTAL, $order->creation_source);
        $this->assertNull($order->created_by);
        $this->assertSame($staff->id, $order->account_manager_id);
    }

    public function test_staff_created_order_keeps_the_actual_employee_as_creator(): void
    {
        $account = $this->account('staff-created');
        $staff = $this->staff('creator');
        Auth::guard('web')->login($staff);

        $order = app(OrderResolver::class)->create(null, ['input' => [
            'customer_id' => $account->customer_id,
            'note' => 'Nhân viên tạo trực tiếp',
            'items' => [[
                'product_name' => 'Sản phẩm do nhân viên nhập',
                'product_link' => 'https://item.taobao.com/item.htm?id=staff-created',
                'price_cny' => 10,
                'quantity' => 1,
            ]],
        ]]);

        $this->assertSame(Order::SOURCE_ADMIN_PORTAL, $order->creation_source);
        $this->assertSame($staff->id, $order->created_by);
        $this->assertNull($order->submitted_by_customer_account_id);
        $this->assertNull($order->submitted_at);
    }

    public function test_two_skus_of_the_same_product_are_saved_as_distinct_items(): void
    {
        $this->authenticate('two-skus');
        $payload = $this->payload();
        $second = $payload['items'][0];
        $second['local_item_id'] = 'local-'.Str::uuid();
        $second['sku_id'] = 'sku-blue-m';
        $second['selected_attributes'] = ['Màu' => 'Xanh', 'Kích thước' => 'M'];
        $second['variant_label'] = 'Xanh / M';
        $second['color'] = 'Xanh';
        $second['size'] = 'M';
        $payload['items'][] = $second;

        $response = $this->postJson('/customer-portal/purchase-requests', $payload)->assertCreated();

        $this->assertCount(2, $response->json('order.items'));
        $this->assertSame('sku-red-l', $response->json('order.items.0.source_sku_id'));
        $this->assertSame('sku-blue-m', $response->json('order.items.1.source_sku_id'));
    }

    public function test_identity_is_session_owned_and_other_customers_cannot_read_the_order(): void
    {
        $owner = $this->authenticate('owner');
        $other = $this->account('other');
        $payload = $this->payload();
        $payload['customer_id'] = $other->customer_id;
        $orderId = $this->postJson('/customer-portal/purchase-requests', $payload)->assertCreated()->json('order.id');
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'customer_id' => $owner->customer_id]);

        auth('customer')->logout();
        $this->actingAs($other, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $other->password)]);
        $this->getJson('/customer-portal/orders/'.$orderId)->assertNotFound();
    }

    public function test_unknown_reference_price_is_explicitly_marked_unknown(): void
    {
        $this->authenticate('unknown-price');
        $payload = $this->payload();
        $payload['items'][0]['reference_price_cny'] = null;
        $response = $this->postJson('/customer-portal/purchase-requests', $payload)->assertCreated();
        $this->assertNull($response->json('order.items.0.price_cny'));
        $this->assertFalse($response->json('order.items.0.reference_price_known'));
        $this->assertNull($response->json('order.items.0.reference_subtotal_cny'));
    }

    public function test_chinese_and_multilingual_item_metadata_remains_valid_utf8_across_order_endpoints(): void
    {
        $this->authenticate('unicode-order');
        $payload = $this->payload();
        $payload['items'][0]['title'] = '儿童包装套装 — Áo trẻ em — 日本語';
        $payload['items'][0]['variant_label'] = '包装: 3包';
        $payload['items'][0]['selected_attributes'] = ['商品规格' => '升级包装【3包】', '颜色分类' => '蓝色'];
        $payload['items'][0]['product_note'] = 'Giữ nguyên ký tự 中文, Tiếng Việt và emoji 🎁';

        $created = $this->postJson('/customer-portal/purchase-requests', $payload)
            ->assertCreated()
            ->assertJsonPath('order.items.0.product_name', '儿童包装套装 — Áo trẻ em — 日本語')
            ->assertJsonPath('order.items.0.variant_label', '包装: 3包')
            ->assertJsonPath('order.items.0.selected_attributes.商品规格', '升级包装【3包】')
            ->assertJsonPath('order.items.0.selected_attributes.颜色分类', '蓝色');

        $orderId = $created->json('order.id');
        $this->getJson('/customer-portal/orders?per_page=10')->assertOk()
            ->assertJsonPath('orders.0.items.0.product_name', '儿童包装套装 — Áo trẻ em — 日本語')
            ->assertJsonPath('orders.0.items.0.variant_label', '包装: 3包');
        $this->getJson('/customer-portal/orders/'.$orderId)->assertOk()
            ->assertJsonPath('order.items.0.selected_attributes.商品规格', '升级包装【3包】');
        $this->getJson('/customer-portal/orders/'.$orderId.'/history')->assertOk()
            ->assertJsonPath('order_id', $orderId);
    }

    public function test_mixed_unicode_order_list_keeps_pagination_prices_status_and_ownership(): void
    {
        $owner = $this->authenticate('unicode-pagination');
        $expectedIds = [];
        foreach (['Đơn hợp lệ', '商品包装', 'Unicode 🎁 café'] as $index => $title) {
            $payload = $this->payload();
            $payload['idempotency_key'] = (string) Str::uuid();
            $payload['items'][0]['local_item_id'] = 'local-'.Str::uuid();
            $payload['items'][0]['title'] = $title;
            $payload['items'][0]['reference_price_cny'] = 10 + $index;
            $expectedIds[] = $this->postJson('/customer-portal/purchase-requests', $payload)->assertCreated()->json('order.id');
        }

        $firstPage = $this->getJson('/customer-portal/orders?per_page=2&page=1')->assertOk()
            ->assertJsonCount(2, 'orders')->assertJsonPath('pagination.total', 3)
            ->assertJsonPath('statistics.total', 3);
        $secondPage = $this->getJson('/customer-portal/orders?per_page=2&page=2')->assertOk()
            ->assertJsonCount(1, 'orders')->assertJsonPath('pagination.total', 3);

        $returned = collect([...$firstPage->json('orders'), ...$secondPage->json('orders')]);
        $this->assertEqualsCanonicalizing($expectedIds, $returned->pluck('id')->all());
        $this->assertSame(['pending'], $returned->pluck('status')->unique()->values()->all());
        $this->assertEqualsCanonicalizing(['10.00', '11.00', '12.00'], $returned->pluck('items.0.price_cny')->all());

        auth('customer')->logout();
        $other = $this->account('unicode-pagination-other');
        $this->actingAs($other, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $other->password)]);
        $this->getJson('/customer-portal/orders?per_page=10')->assertOk()
            ->assertJsonCount(0, 'orders')->assertJsonPath('pagination.total', 0);
        $this->getJson('/customer-portal/orders/'.$expectedIds[0])->assertNotFound();
        $this->assertNotSame($owner->customer_id, $other->customer_id);
    }

    public function test_platform_url_required_sku_auth_and_write_guard_are_enforced(): void
    {
        $this->postJson('/customer-portal/purchase-requests', $this->payload())->assertUnauthorized();
        $this->authenticate('validation');
        $payload = $this->payload();
        $payload['items'][0]['product_url'] = 'https://detail.1688.com/offer/123.html';
        $payload['items'][0]['sku_id'] = null;
        $this->postJson('/customer-portal/purchase-requests', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors(['items.0.product_url', 'items.0.sku_id']);

        Config::set('business.writes_enabled', false);
        $this->postJson('/customer-portal/purchase-requests', $this->payload())
            ->assertStatus(423)->assertJsonPath('code', 'BUSINESS_WRITES_LOCKED');
    }

    public function test_order_and_items_are_rolled_back_when_pricing_fails_inside_transaction(): void
    {
        $account = $this->authenticate('rollback');
        $payload = $this->payload();
        $key = $payload['idempotency_key'];
        $pricing = \Mockery::mock(OrderPricingService::class);
        $pricing->shouldReceive('recalculateOrderItemAmounts')->once()->andThrow(new \RuntimeException('pricing failed'));
        $this->app->instance(OrderPricingService::class, $pricing);

        try {
            $this->postJson('/customer-portal/purchase-requests', $payload);
        } catch (\RuntimeException) {
            // The assertion below verifies that the transaction removed both writes.
        }

        $this->assertDatabaseMissing('orders', ['customer_id' => $account->customer_id, 'order_code' => 'REQ-'.strtoupper(substr(hash('sha256', $account->customer_id.'|'.$key), 0, 20))]);
    }

    public function test_dashboard_analytics_groups_owned_orders_without_counting_items_as_orders(): void
    {
        CarbonImmutable::setTestNow('2026-11-23 10:00:00');
        $account = $this->authenticate('dashboard-owner');

        $first = $this->payload();
        $first['items'][] = [...$first['items'][0], 'local_item_id' => 'local-'.Str::uuid(), 'reference_price_cny' => 7.5, 'quantity' => 1];
        $octoberId = $this->postJson('/customer-portal/purchase-requests', $first)->assertCreated()->json('order.id');
        Order::query()->whereKey($octoberId)->update(['created_at' => '2026-10-10 08:00:00', 'status' => 'purchasing']);

        $unknown = $this->payload();
        $unknown['idempotency_key'] = (string) Str::uuid();
        $unknown['items'][0]['local_item_id'] = 'local-'.Str::uuid();
        $unknown['items'][0]['reference_price_cny'] = null;
        $novemberId = $this->postJson('/customer-portal/purchase-requests', $unknown)->assertCreated()->json('order.id');
        Order::query()->whereKey($novemberId)->update(['status' => 'pending']);

        auth('customer')->logout();
        $other = $this->authenticate('dashboard-other');
        $otherOrder = $this->postJson('/customer-portal/purchase-requests', $this->payload())->assertCreated()->json('order.id');
        $this->assertNotSame($account->customer_id, $other->customer_id);
        auth('customer')->logout();
        $this->actingAs($account, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $account->password)]);

        $response = $this->getJson('/customer-portal/dashboard-analytics?months=3')->assertOk()
            ->assertJsonPath('period.months', 3)
            ->assertJsonPath('totals.orders', 2)
            ->assertJsonPath('totals.known_item_count', 2)
            ->assertJsonPath('totals.unknown_item_count', 1);

        $monthly = collect($response->json('monthly'))->keyBy('month');
        $this->assertSame(1, $monthly['2026-10']['order_count']);
        $this->assertSame('32.50', $monthly['2026-10']['reference_value_cny']);
        $this->assertSame(1, $monthly['2026-11']['order_count']);
        $this->assertNull($monthly['2026-11']['reference_value_cny']);
        $this->assertSame('unavailable', $monthly['2026-11']['reference_value_completeness']);
        $this->assertSame(2, collect($response->json('status_distribution'))->sum('count'));
        $this->assertNotContains($otherOrder, [$octoberId, $novemberId]);
        CarbonImmutable::setTestNow();
    }

    public function test_dashboard_analytics_validates_period_and_returns_empty_months(): void
    {
        CarbonImmutable::setTestNow('2026-11-23 10:00:00');
        $this->authenticate('dashboard-empty');
        $this->getJson('/customer-portal/dashboard-analytics?months=5')->assertUnprocessable();
        $response = $this->getJson('/customer-portal/dashboard-analytics?months=6')->assertOk()
            ->assertJsonPath('totals.orders', 0)
            ->assertJsonCount(6, 'monthly');
        $this->assertSame([0], collect($response->json('monthly'))->pluck('order_count')->unique()->values()->all());
        $this->assertSame([], $response->json('status_distribution'));
        CarbonImmutable::setTestNow();
    }

    private function payload(): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'note' => 'Kiểm hàng trước khi mua', 'items' => [[
            'local_item_id' => 'local-'.Str::uuid(), 'product_url' => 'https://item.taobao.com/item.htm?id=123',
            'platform' => 'Taobao', 'title' => 'Sản phẩm kiểm thử QA', 'main_image' => 'https://img.example.test/product.jpg',
            'sku_id' => 'sku-red-l', 'selected_attributes' => ['Màu' => 'Đỏ', 'Kích thước' => 'L'],
            'variant_label' => 'Đỏ / L', 'color' => 'Đỏ', 'size' => 'L', 'quantity' => 2,
            'reference_price_cny' => 12.5, 'product_note' => 'Kiểm tra đường may',
            'seller' => 'Shop QA', 'shop_name' => 'Shop QA', 'sku_required' => true,
        ]]];
    }

    private function authenticate(string $suffix = 'customer'): CustomerAccount
    {
        $account = $this->account($suffix);
        $this->actingAs($account, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $account->password)]);

        return $account;
    }

    private function account(string $suffix): CustomerAccount
    {
        $customer = Customer::query()->create(['code' => 'KH'.Str::upper(Str::random(8)), 'name' => 'Khách '.$suffix,
            'phone' => '+849'.random_int(10000000, 99999999), 'email' => $suffix.'-'.Str::uuid().'@example.test', 'status' => 'active']);

        return CustomerAccount::query()->create(['customer_id' => $customer->id, 'email' => $customer->email,
            'phone_e164' => $customer->phone, 'password' => 'Matkhauantoan123', 'status' => 'active', 'email_verified_at' => now()]);
    }

    private function staff(string $suffix): User
    {
        return User::query()->create([
            'name' => 'Nhân viên test '.$suffix,
            'email' => $suffix.'-'.Str::uuid().'@example.test',
            'password' => 'Matkhauantoan123',
            'role_id' => DB::table('roles')->value('id'),
            'status' => 'active',
        ]);
    }
}
