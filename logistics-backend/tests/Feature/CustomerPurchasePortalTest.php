<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAccount;
use App\Models\Order;
use App\Services\Products\ProductMetadataService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
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

    public function test_customer_can_persist_cart_draft_and_submit_into_existing_orders_domain(): void
    {
        $account = $this->account();
        $this->actingAs($account, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $account->password)]);

        $item = ['product_name' => 'Sản phẩm kiểm thử QA', 'product_link' => 'https://item.taobao.com/item.htm?id=123', 'source' => 'Taobao', 'variant' => 'Đỏ / L', 'price_cny' => 12.5, 'quantity' => 2, 'color' => 'Đỏ', 'size' => 'L'];
        $this->postJson('/customer-portal/cart/items', $item)->assertCreated()->assertJsonPath('cart.items.0.quantity', 2)->assertJsonPath('cart.items.0.variant', 'Đỏ / L');
        $workspace = $this->getJson('/customer-portal/workspace')->assertOk();
        $cartId = $workspace->json('cart.id');
        $this->postJson('/customer-portal/cart/save-draft', ['title' => 'Nháp từ giỏ QA'])->assertCreated()->assertJsonPath('draft.items.0.product_name', 'Sản phẩm kiểm thử QA');

        $response = $this->postJson('/customer-portal/cart/submit')->assertCreated()
            ->assertJsonPath('order.status', 'pending')
            ->assertJsonPath('order.product_total_cny', '25.00');

        $orderId = $response->json('order.id');
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'customer_id' => $account->customer_id, 'created_by' => null]);
        $this->assertDatabaseHas('order_items', ['order_id' => $orderId, 'color' => 'Đỏ', 'size' => 'L', 'note' => 'Phân loại: Đỏ / L']);
        $this->assertDatabaseHas('customer_purchase_drafts', ['id' => $cartId, 'submitted_order_id' => $orderId, 'status' => 'submitted']);
        $this->getJson('/customer-portal/orders/'.$orderId)->assertOk()->assertJsonPath('order.items.0.product_name', 'Sản phẩm kiểm thử QA');
    }

    public function test_draft_submit_is_idempotent_and_does_not_duplicate_order(): void
    {
        $account = $this->account();
        $this->actingAs($account, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $account->password)]);
        $draft = $this->postJson('/customer-portal/drafts', [
            'title' => 'Yêu cầu QA', 'idempotency_key' => (string) Str::uuid(),
            'items' => [['product_name' => 'Sản phẩm QA', 'quantity' => 1]],
        ])->assertCreated()->json('draft');

        $first = $this->postJson('/customer-portal/drafts/'.$draft['id'].'/submit')->assertCreated()->json('order.id');
        $second = $this->postJson('/customer-portal/drafts/'.$draft['id'].'/submit')->assertCreated()->json('order.id');
        $this->assertSame($first, $second);
        $this->assertSame(1, Order::where('customer_id', $account->customer_id)->where('id', $first)->count());
    }

    public function test_customer_cannot_read_or_mutate_another_customers_resources(): void
    {
        $owner = $this->account('owner');
        $other = $this->account('other');
        $this->actingAs($owner, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $owner->password)]);
        $draftId = $this->postJson('/customer-portal/drafts', ['items' => [['product_name' => 'Riêng tư', 'quantity' => 1]]])->assertCreated()->json('draft.id');
        $orderId = $this->postJson('/customer-portal/drafts/'.$draftId.'/submit')->assertCreated()->json('order.id');

        auth('customer')->logout();
        $this->actingAs($other, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $other->password)]);
        $this->getJson('/customer-portal/orders/'.$orderId)->assertNotFound();
        $this->patchJson('/customer-portal/drafts/'.$draftId, ['title' => 'Chiếm quyền'])->assertNotFound();
        $this->assertSame(0, $this->getJson('/customer-portal/orders')->assertOk()->json('pagination.total'));
    }

    public function test_write_routes_remain_protected_by_business_write_guard(): void
    {
        Config::set('business.writes_enabled', false);
        $account = $this->account();
        $this->actingAs($account, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $account->password)]);
        $this->postJson('/customer-portal/cart/items', ['product_name' => 'Bị khóa', 'quantity' => 1])
            ->assertStatus(423)->assertJsonPath('code', 'BUSINESS_WRITES_LOCKED');
    }

    public function test_unauthenticated_customer_portal_requests_are_rejected(): void
    {
        $this->getJson('/customer-portal/workspace')->assertUnauthorized();
        $this->getJson('/customer-portal/orders')->assertUnauthorized();
        $this->getJson('/customer-portal/product-metadata?url='.urlencode('https://item.taobao.com/item.htm?id=123'))->assertUnauthorized();
    }

    public function test_order_history_contains_only_owned_real_events(): void
    {
        $account = $this->account();
        $other = $this->account('history-other');
        $owned = Order::create(['order_code' => 'ORD-HISTORY-'.Str::upper(Str::random(5)), 'customer_id' => $account->customer_id, 'status' => 'pending', 'total_amount' => 0]);
        Order::create(['order_code' => 'ORD-OTHER-'.Str::upper(Str::random(5)), 'customer_id' => $other->customer_id, 'status' => 'pending', 'total_amount' => 0]);
        $this->actingAs($account, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $account->password)]);
        $this->getJson('/customer-portal/orders/'.$owned->id.'/history')->assertOk()->assertJsonPath('events.0.type', 'created');
        $this->getJson('/customer-portal/orders')->assertOk()->assertJsonPath('pagination.total', 1);
    }

    public function test_product_metadata_endpoint_uses_safe_server_service(): void
    {
        Http::fake(['item.taobao.com/*' => Http::response('<meta property="og:title" content="Sản phẩm QA"><meta property="og:image" content="https://img.example.test/a.jpg">', 200, ['Content-Type' => 'text/html'])]);
        $this->app->instance(ProductMetadataService::class, new ProductMetadataService(fn () => ['93.184.216.34']));
        $account = $this->account();
        $this->actingAs($account, 'customer')->withSession(['customer_password_fingerprint' => hash('sha256', $account->password)]);
        $this->getJson('/customer-portal/product-metadata?url='.urlencode('https://item.taobao.com/item.htm?id=123'))
            ->assertOk()->assertJsonPath('product.title', 'Sản phẩm QA')->assertJsonPath('product.source', 'Taobao');
    }

    private function account(string $suffix = 'customer'): CustomerAccount
    {
        $customer = Customer::create([
            'code' => 'KH'.Str::upper(Str::random(8)), 'name' => 'Khách '.$suffix,
            'phone' => '+849'.random_int(10000000, 99999999), 'email' => $suffix.'-'.Str::uuid().'@example.test', 'status' => 'active',
        ]);

        return CustomerAccount::create([
            'customer_id' => $customer->id, 'email' => $customer->email, 'phone_e164' => $customer->phone,
            'password' => 'Matkhauantoan123', 'status' => 'active', 'email_verified_at' => now(),
        ]);
    }
}
