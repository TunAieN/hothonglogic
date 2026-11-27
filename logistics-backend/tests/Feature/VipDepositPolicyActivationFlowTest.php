<?php

namespace Tests\Feature;

use App\GraphQL\Resolvers\OrderResolver;
use App\Models\Customer;
use App\Models\ExchangeRate;
use App\Models\Order;
use App\Models\OrderDepositPolicySnapshot;
use App\Models\OrderItem;
use App\Models\PaymentAccount;
use App\Models\RiskDepositPolicy;
use App\Models\Role;
use App\Models\User;
use App\Models\VipTier;
use App\Services\Orders\OrderPricingService;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\CreatesApplication;

class VipDepositPolicyActivationFlowTest extends BaseTestCase
{
    use CreatesApplication;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $identity = DB::selectOne('SELECT CURRENT_USER() AS account, DATABASE() AS db, @@port AS port');
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertSame('viettrung_qa_runner@127.0.0.1', (string) $identity->account);
        $this->assertSame('logistics_system_test', (string) $identity->db);
        $this->assertSame(3311, (int) $identity->port);
    }

    public function test_bronze_low_uses_sixty_five_percent_end_to_end(): void
    {
        $role = Role::query()->create([
            'name' => 'VIP activation QA',
            'permissions' => ['orders.update'],
        ]);
        $user = User::query()->create([
            'name' => 'VIP activation QA',
            'email' => 'vip-activation@example.test',
            'password' => Hash::make('not-used'),
            'role_id' => $role->id,
            'status' => 'active',
        ]);
        Auth::login($user);

        $tier = VipTier::query()->where('code', 'bronze')->firstOrFail();
        $tier->forceFill([
            'base_deposit_percent' => 60,
            'credit_limit_vnd' => null,
            'deposit_policy_enabled' => true,
            'is_active' => true,
        ])->save();
        $risk = RiskDepositPolicy::query()->where('code', 'low')->firstOrFail();
        $risk->forceFill([
            'minimum_deposit_percent' => null,
            'surcharge_percent' => 5,
            'requires_manager_approval' => false,
            'is_active' => true,
        ])->save();

        PaymentAccount::query()->create([
            'bank_name' => 'QA Bank',
            'bank_code' => 'QAB',
            'account_number' => '000000001',
            'account_holder' => 'VIETTRUNG QA',
            'is_default' => true,
            'is_active' => true,
        ]);
        ExchangeRate::query()->create([
            'from_currency' => 'CNY',
            'to_currency' => 'VND',
            'rate' => 3600,
            'effective_from' => now()->subMinute(),
            'is_active' => true,
        ]);
        $customer = Customer::query()->create([
            'code' => 'CUS-VIP-QA',
            'name' => 'VIP QA customer',
            'phone' => '0900000000',
            'status' => 'active',
            'vip_tier_id' => $tier->id,
        ]);
        $order = Order::query()->create([
            'order_code' => 'ORD-VIP-QA',
            'customer_id' => $customer->id,
            'status' => 'pending',
            'total_amount' => 0,
            'product_total_cny' => 0,
            'product_total_vnd' => 0,
            'currency' => 'CNY',
            'created_by' => $user->id,
        ]);
        $item = OrderItem::query()->create([
            'order_id' => $order->id,
            'product_name' => 'Isolated QA item',
            'price_cny' => 50,
            'quantity' => 1,
        ]);
        app(OrderPricingService::class)->recalculateOrderItemAmounts($item);
        $order = app(OrderPricingService::class)->recalculateOrderTotals($order->fresh('items'));

        /** @var OrderResolver $resolver */
        $resolver = app(OrderResolver::class);
        $preview = $resolver->depositPolicyPreview(null, [
            'order_id' => $order->id,
            'risk_level' => 'low',
        ]);

        $this->assertSame(60.0, $preview['vip_effective_percent']);
        $this->assertSame(5.0, $preview['risk_surcharge_percent']);
        $this->assertSame(65.0, $preview['recommended_percent']);
        $this->assertSame(117000, $preview['deposit_amount_vnd']);

        $updated = $resolver->update(null, [
            'id' => $order->id,
            'input' => [
                'status' => 'awaiting_deposit',
                'deposit_percent' => 65,
                'risk_level' => 'low',
                'risk_reason' => 'Đã kiểm tra shop, sản phẩm và dấu hiệu bất thường.',
                'risk_evidence' => [
                    'seller_checked' => true,
                    'product_checked' => true,
                    'returns_checked' => false,
                    'anomaly_checked' => true,
                ],
            ],
        ]);

        $snapshot = OrderDepositPolicySnapshot::query()->where('order_id', $order->id)->firstOrFail();
        $voucher = $updated->depositVoucher;

        $this->assertSame('65.00', (string) $updated->deposit_percent);
        $this->assertSame(117000, (int) $updated->deposit_amount_vnd);
        $this->assertSame('60.00', (string) $snapshot->vip_deposit_percent);
        $this->assertSame('5.00', (string) $snapshot->risk_surcharge_percent);
        $this->assertSame('65.00', (string) $snapshot->additive_percent);
        $this->assertSame('65.00', (string) $snapshot->final_percent);
        $this->assertSame('vip_plus_risk_surcharge_with_floors', $snapshot->policy_formula);
        $this->assertNotNull($snapshot->voucher_issued_at);
        $this->assertNotNull($voucher);
        $this->assertSame(65.0, $voucher->deposit_percent);
        $this->assertSame(117000, (int) $voucher->total_amount);
    }
}
