<?php

namespace Tests\Feature;

use App\Exceptions\BusinessWritesLockedException;
use App\Exceptions\FinancialWritesLockedException;
use App\Models\CustomerAccount;
use App\Models\User;
use App\Services\Shipping\ShippingRateService;
use App\Services\Payments\PaymentVoucherService;
use App\Support\BusinessWriteGuard;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BusinessWriteLockTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Config::set('business.writes_enabled', false);
    }

    public function test_graphql_alias_and_operation_name_cannot_bypass_lock(): void
    {
        $response = $this->postJson('/graphql', [
            'query' => <<<'GRAPHQL'
                mutation HiddenBusinessWrite($input: CreateCustomerInput!) {
                    harmlessAlias: createCustomer(input: $input) { id }
                }
                GRAPHQL,
            'operationName' => 'HiddenBusinessWrite',
            'variables' => [
                'input' => ['name' => 'Lock Probe', 'phone' => '0900000000'],
            ],
        ]);

        $response->assertOk();
        $this->assertSame(
            'BUSINESS_WRITES_LOCKED',
            data_get($response->json(), 'errors.0.extensions.code')
        );
    }

    public function test_read_only_graphql_query_still_executes(): void
    {
        $this->postJson('/graphql', ['query' => 'query ReadOnlyProbe { __typename }'])
            ->assertOk()
            ->assertJsonPath('data.__typename', 'Query');
    }

    public function test_graphql_batch_cannot_mix_a_business_write_past_the_lock(): void
    {
        $response = $this->postJson('/graphql', [
            ['query' => 'query BatchRead { __typename }'],
            ['query' => 'mutation BatchWrite { hidden: deleteOrder(id: "1") { id } }'],
        ])->assertOk();

        $this->assertSame('Query', data_get($response->json(), '0.data.__typename'));
        $this->assertSame('BUSINESS_WRITES_LOCKED', data_get($response->json(), '1.errors.0.extensions.code'));
    }

    public function test_rest_middleware_rejects_before_controller_side_effect(): void
    {
        $called = false;
        Route::post('/_business-write-probe', function () use (&$called) {
            $called = true;

            return response()->json(['ok' => true]);
        })->middleware('business.writes');

        $this->postJson('/_business-write-probe')
            ->assertStatus(423)
            ->assertJsonPath('code', 'BUSINESS_WRITES_LOCKED');

        $this->assertFalse($called);
    }

    public function test_internal_service_call_is_blocked_before_database_access(): void
    {
        $this->expectException(BusinessWritesLockedException::class);
        app(ShippingRateService::class)->create([]);
    }

    public function test_admin_cannot_enable_lock_through_request_input(): void
    {
        $admin = new User(['name' => 'Lock Probe Admin', 'email' => 'lock-probe@example.invalid']);
        $admin->id = 999999;
        Sanctum::actingAs($admin, ['*']);

        Route::post('/_business-write-admin-probe', fn () => response()->json(['ok' => true]))
            ->middleware('business.writes');

        $this->postJson('/_business-write-admin-probe', ['BUSINESS_WRITES_ENABLED' => true])
            ->assertStatus(423)
            ->assertJsonPath('code', 'BUSINESS_WRITES_LOCKED');

        $this->assertFalse(Config::get('business.writes_enabled'));
    }

    public function test_queued_business_work_cannot_bypass_service_guard(): void
    {
        $this->expectException(BusinessWritesLockedException::class);
        Bus::dispatchSync(new LockedBusinessWriteJob);
    }

    public function test_customer_identity_cannot_bypass_rest_guard(): void
    {
        $customer = new CustomerAccount(['email' => 'customer-lock-probe@example.invalid']);
        $customer->id = 999999;
        $this->actingAs($customer, 'customer');

        Route::post('/_customer-business-write-probe', fn () => response()->json(['ok' => true]))
            ->middleware('business.writes');

        $this->postJson('/_customer-business-write-probe')
            ->assertStatus(423)
            ->assertJsonPath('code', 'BUSINESS_WRITES_LOCKED');
    }

    public function test_financial_writes_can_stay_locked_while_other_business_writes_are_enabled(): void
    {
        Config::set('business.writes_enabled', true);
        Config::set('business.financial_writes_enabled', false);

        BusinessWriteGuard::assertEnabled('test.non-financial');

        $this->expectException(FinancialWritesLockedException::class);
        app(PaymentVoucherService::class)->create([]);
    }
}

final class LockedBusinessWriteJob implements ShouldQueue
{
    use Dispatchable;
    use Queueable;

    public function handle(ShippingRateService $service): void
    {
        $service->create([]);
    }
}
