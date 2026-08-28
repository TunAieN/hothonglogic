<?php

namespace Tests\Feature;

use App\GraphQL\Resolvers\EmployeeResolver;
use App\GraphQL\Resolvers\LoginResolver;
use App\GraphQL\Resolvers\RoleResolver;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeRbacTest extends TestCase
{
    use DatabaseTransactions;

    public function test_canonical_employee_roles_are_available(): void
    {
        $this->assertSame([
            'admin',
            'sales_staff',
            'customer_service',
            'china_warehouse_staff',
            'vietnam_warehouse_staff',
            'accountant',
            'shipping_staff',
        ], app(RoleResolver::class)->list()->pluck('key')->all());

        $this->assertSame(['all'], Role::query()->where('key', 'admin')->firstOrFail()->permissions);
    }

    public function test_locked_and_inactive_employees_cannot_login(): void
    {
        foreach ([
            'locked' => 'Tài khoản của bạn đang tạm khóa.',
            'inactive' => 'Tài khoản này đã ngừng hoạt động.',
        ] as $status => $expectedMessage) {
            $user = $this->employee($status, ['customers.read']);

            try {
                app(LoginResolver::class)->login(null, [
                    'email' => $user->email,
                    'password' => 'password',
                ]);
                $this->fail("Expected {$status} employee login to be rejected.");
            } catch (\Exception $exception) {
                $this->assertSame($expectedMessage, $exception->getMessage());
            }
        }
    }

    public function test_graphql_permission_allows_owned_module_and_denies_other_modules(): void
    {
        $user = $this->employee('active', ['customers.read']);
        Sanctum::actingAs($user, ['*'], 'api');

        $allowed = $this->postJson('/graphql', [
            'query' => '{ customers(first: 1) { paginatorInfo { total } } }',
        ]);
        $allowed->assertJsonMissingPath('errors');

        $denied = $this->postJson('/graphql', [
            'query' => '{ orders(first: 1) { paginatorInfo { total } } }',
        ]);
        $denied->assertJsonPath('errors.0.message', 'Bạn không có quyền thực hiện thao tác này.');
    }

    public function test_delete_employee_preserves_record_and_marks_it_inactive(): void
    {
        $employee = $this->employee('active', ['customers.read']);

        $result = app(EmployeeResolver::class)->delete(null, ['id' => $employee->id]);

        $this->assertSame('inactive', $result->status);
        $this->assertDatabaseHas('users', [
            'id' => $employee->id,
            'status' => 'inactive',
        ]);
    }

    public function test_employee_detail_returns_profile_manager_statistics_and_activity(): void
    {
        $adminRole = Role::query()->where('key', 'admin')->firstOrFail();
        $salesRole = Role::query()->where('key', 'sales_staff')->firstOrFail();
        $manager = User::create([
            'name' => 'Sales Manager',
            'email' => uniqid('manager_', true).'@example.com',
            'password' => 'password',
            'role_id' => $salesRole->id,
            'department' => 'sales',
            'status' => 'active',
        ]);
        $employee = User::create([
            'name' => 'Employee Detail',
            'email' => uniqid('detail_', true).'@example.com',
            'password' => 'password',
            'role_id' => $salesRole->id,
            'phone' => '0900000000',
            'address' => 'Hà Nội',
            'birthday' => '1994-08-12',
            'gender' => 'male',
            'note' => 'Ghi chú thật',
            'department' => 'sales',
            'joined_at' => '2023-06-15',
            'manager_id' => $manager->id,
            'status' => 'active',
        ]);
        AuditLog::query()->create([
            'user_id' => $employee->id,
            'action' => 'updated',
            'entity_type' => 'Order',
            'entity_id' => 123,
        ]);
        $admin = User::create([
            'name' => 'Admin Detail Test',
            'email' => uniqid('admin_detail_', true).'@example.com',
            'password' => 'password',
            'role_id' => $adminRole->id,
            'department' => 'administration',
            'status' => 'active',
        ]);
        Sanctum::actingAs($admin, ['*'], 'api');

        $response = $this->postJson('/graphql', [
            'query' => <<<'GRAPHQL'
                query EmployeeDetail($id: ID!) {
                  employee(id: $id) {
                    id name birthday gender note joined_at manager_id
                    role { key description }
                    manager { id name role { name } }
                  }
                  employeeDetailStatistics(employee_id: $id) { key label value suffix }
                  employeeActivity(employee_id: $id) { action entity_type entity_id }
                }
            GRAPHQL,
            'variables' => ['id' => $employee->id],
        ]);

        $response->assertJsonMissingPath('errors');
        $response->assertJsonPath('data.employee.name', 'Employee Detail');
        $response->assertJsonPath('data.employee.manager.id', (string) $manager->id);
        $response->assertJsonPath('data.employee.role.key', 'sales_staff');
        $response->assertJsonPath('data.employeeActivity.0.action', 'updated');
        $this->assertSame(
            ['total_orders', 'total_customers', 'processing_orders', 'completion_rate'],
            collect($response->json('data.employeeDetailStatistics'))->pluck('key')->all(),
        );
    }

    public function test_employee_detail_statistics_requires_employee_read_permission(): void
    {
        $employee = $this->employee('active', ['customers.read']);
        Sanctum::actingAs($employee, ['*'], 'api');

        $response = $this->postJson('/graphql', [
            'query' => 'query ($id: ID!) { employeeDetailStatistics(employee_id: $id) { key } }',
            'variables' => ['id' => $employee->id],
        ]);

        $response->assertJsonPath('errors.0.message', 'Bạn không có quyền thực hiện thao tác này.');
    }

    public function test_employee_profile_fields_are_updated_and_employee_cannot_manage_itself(): void
    {
        $manager = $this->employee('active', ['customers.read']);
        $employee = $this->employee('active', ['customers.read']);

        $updated = app(EmployeeResolver::class)->update(null, [
            'id' => $employee->id,
            'name' => 'Updated Employee',
            'email' => $employee->email,
            'role_id' => $employee->role_id,
            'phone' => '0987654321',
            'address' => 'Hà Nội',
            'birthday' => '1994-08-12',
            'gender' => 'male',
            'note' => 'Ghi chú nhân viên',
            'department' => 'sales',
            'joined_at' => '2023-06-15',
            'manager_id' => $manager->id,
            'status' => 'active',
        ]);

        $this->assertSame($manager->id, $updated->manager_id);
        $this->assertSame('1994-08-12', $updated->birthday->format('Y-m-d'));
        $this->assertSame('Ghi chú nhân viên', $updated->note);

        $this->expectException(ValidationException::class);
        app(EmployeeResolver::class)->update(null, [
            'id' => $employee->id,
            'name' => $employee->name,
            'email' => $employee->email,
            'role_id' => $employee->role_id,
            'department' => 'sales',
            'manager_id' => $employee->id,
            'status' => 'active',
        ]);
    }

    public function test_employee_can_be_locked_and_unlocked_without_changing_profile(): void
    {
        $employee = $this->employee('active', ['customers.read']);
        $input = [
            'id' => $employee->id,
            'name' => $employee->name,
            'email' => $employee->email,
            'role_id' => $employee->role_id,
            'department' => 'sales',
        ];

        app(EmployeeResolver::class)->update(null, [...$input, 'status' => 'locked']);

        try {
            app(LoginResolver::class)->login(null, ['email' => $employee->email, 'password' => 'password']);
            $this->fail('Expected locked employee login to be rejected.');
        } catch (\Exception $exception) {
            $this->assertSame('Tài khoản của bạn đang tạm khóa.', $exception->getMessage());
        }

        app(EmployeeResolver::class)->update(null, [...$input, 'status' => 'active']);
        $payload = app(LoginResolver::class)->login(null, ['email' => $employee->email, 'password' => 'password']);

        $this->assertSame($employee->id, $payload['user']->id);
        $this->assertNotEmpty($payload['access_token']);
    }

    private function employee(string $status, array $permissions): User
    {
        $role = Role::query()->where('key', 'sales_staff')->firstOrFail();
        $role->update(['permissions' => $permissions]);

        return User::create([
            'name' => 'Test Employee',
            'email' => uniqid('employee_', true).'@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'department' => 'sales',
            'status' => $status,
        ]);
    }
}
