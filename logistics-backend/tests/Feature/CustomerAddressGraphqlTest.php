<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\Role;
use App\Models\User;
use App\Services\Shipping\GhnService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class CustomerAddressGraphqlTest extends TestCase
{
    use DatabaseTransactions;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $suffix = strtoupper(substr(uniqid(), -8));
        $role = Role::query()->create([
            'name' => 'Customer address test '.$suffix,
            'permissions' => ['payment_vouchers.create'],
        ]);
        $user = User::query()->create([
            'name' => 'Customer address tester',
            'email' => 'customer-address-'.$suffix.'@example.test',
            'password' => 'password',
            'role_id' => $role->id,
            'status' => 'active',
        ]);
        $this->customer = Customer::query()->create([
            'code' => 'ADDR-'.$suffix,
            'name' => 'Nguyễn Minh Anh',
            'phone' => '+84987654321',
            'status' => 'active',
        ]);

        Sanctum::actingAs($user, ['*'], 'api');
    }

    public function test_create_customer_address_inserts_record_and_atomically_replaces_default(): void
    {
        $oldDefault = CustomerAddress::query()->create([
            'customer_id' => $this->customer->id,
            ...$this->storedAddress(['label' => 'Địa chỉ cũ', 'is_default' => true]),
        ]);
        $this->mockValidGhnDestination();

        $response = $this->postJson('/graphql', [
            'query' => <<<'GRAPHQL'
                mutation CreateCustomerAddress($input: CustomerAddressInput!) {
                  createCustomerAddress(input: $input) {
                    id customer_id label receiver_name receiver_phone
                    province_code province_name district_code district_name
                    ward_code ward_name address_line full_address is_default
                  }
                }
                GRAPHQL,
            'variables' => ['input' => $this->addressInput(['is_default' => true])],
        ]);

        $response->assertOk()->assertJsonMissingPath('errors');
        $addressId = (int) $response->json('data.createCustomerAddress.id');
        $this->assertSame((string) $this->customer->id, $response->json('data.createCustomerAddress.customer_id'));
        $this->assertSame('Số 18, thôn Đồng Đổi, Xã Thanh Mỹ, Thị xã Sơn Tây, Hà Nội', $response->json('data.createCustomerAddress.full_address'));
        $this->assertDatabaseHas('customer_addresses', [
            'id' => $addressId,
            'customer_id' => $this->customer->id,
            'receiver_name' => 'Nguyễn Minh Anh',
            'receiver_phone' => '+84987654321',
            'is_default' => true,
        ]);
        $this->assertFalse((bool) $oldDefault->fresh()->is_default);
        $this->assertSame(1, CustomerAddress::query()->where('customer_id', $this->customer->id)->where('is_default', true)->count());
    }

    public function test_update_customer_address_changes_existing_record_without_inserting_duplicate(): void
    {
        $address = CustomerAddress::query()->create([
            'customer_id' => $this->customer->id,
            ...$this->storedAddress(),
        ]);
        $countBefore = CustomerAddress::query()->count();
        $this->mockValidGhnDestination();

        $response = $this->postJson('/graphql', [
            'query' => <<<'GRAPHQL'
                mutation UpdateCustomerAddress($id: ID!, $input: CustomerAddressInput!) {
                  updateCustomerAddress(id: $id, input: $input) {
                    id customer_id label receiver_name full_address is_default
                  }
                }
                GRAPHQL,
            'variables' => [
                'id' => (string) $address->id,
                'input' => $this->addressInput(['label' => 'Công ty', 'receiver_name' => 'Nguyễn Văn B']),
            ],
        ]);

        $response->assertOk()->assertJsonMissingPath('errors');
        $this->assertSame((string) $address->id, $response->json('data.updateCustomerAddress.id'));
        $this->assertSame($countBefore, CustomerAddress::query()->count());
        $this->assertDatabaseHas('customer_addresses', [
            'id' => $address->id,
            'customer_id' => $this->customer->id,
            'label' => 'Công ty',
            'receiver_name' => 'Nguyễn Văn B',
        ]);
    }

    public function test_create_customer_address_failure_does_not_leave_a_record(): void
    {
        $this->mock(GhnService::class, function ($mock) {
            $mock->shouldReceive('validateDestination')->once()->andThrow(new HttpException(422, 'Địa chỉ GHN không hợp lệ.'));
        });

        $response = $this->postJson('/graphql', [
            'query' => <<<'GRAPHQL'
                mutation CreateCustomerAddress($input: CustomerAddressInput!) {
                  createCustomerAddress(input: $input) { id }
                }
                GRAPHQL,
            'variables' => ['input' => $this->addressInput()],
        ]);

        $response->assertOk()->assertJsonPath('data.createCustomerAddress', null);
        $this->assertNotEmpty($response->json('errors'));
        $this->assertFalse(CustomerAddress::query()->where('customer_id', $this->customer->id)->exists());
    }

    private function mockValidGhnDestination(): void
    {
        $this->mock(GhnService::class, function ($mock) {
            $mock->shouldReceive('validateDestination')->once()->andReturn([
                'province' => ['province_id' => 201, 'name' => 'Hà Nội'],
                'district' => ['district_id' => 1464, 'province_id' => 201, 'name' => 'Thị xã Sơn Tây'],
                'ward' => ['ward_code' => '1A0101', 'district_id' => 1464, 'name' => 'Xã Thanh Mỹ'],
            ]);
        });
    }

    private function addressInput(array $overrides = []): array
    {
        return [
            'customer_id' => (string) $this->customer->id,
            'label' => 'Nhà riêng',
            'receiver_name' => 'Nguyễn Minh Anh',
            'receiver_phone' => '+84987654321',
            'province_code' => '201',
            'province_name' => 'Hà Nội',
            'district_code' => '1464',
            'district_name' => 'Thị xã Sơn Tây',
            'ward_code' => '1A0101',
            'ward_name' => 'Xã Thanh Mỹ',
            'address_line' => 'Số 18, thôn Đồng Đổi',
            'is_default' => false,
            ...$overrides,
        ];
    }

    private function storedAddress(array $overrides = []): array
    {
        return [
            'label' => 'Nhà riêng',
            'receiver_name' => 'Nguyễn Minh Anh',
            'receiver_phone' => '+84987654321',
            'province_code' => '201',
            'province_name' => 'Hà Nội',
            'district_code' => '1464',
            'district_name' => 'Thị xã Sơn Tây',
            'ward_code' => '1A0101',
            'ward_name' => 'Xã Thanh Mỹ',
            'address_line' => 'Địa chỉ cũ',
            'full_address' => 'Địa chỉ cũ, Xã Thanh Mỹ, Thị xã Sơn Tây, Hà Nội',
            'is_default' => false,
            ...$overrides,
        ];
    }
}
