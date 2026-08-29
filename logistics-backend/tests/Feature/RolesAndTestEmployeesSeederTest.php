<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndTestEmployeesSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RolesAndTestEmployeesSeederTest extends TestCase
{
    use DatabaseTransactions;

    private const ACTIVE_ACCOUNTS = [
        'admin@test.com' => 'admin',
        'sales@test.com' => 'sales_staff',
        'cskh@test.com' => 'customer_service',
        'khotq@test.com' => 'china_warehouse_staff',
        'khovn@test.com' => 'vietnam_warehouse_staff',
        'ketoan@test.com' => 'accountant',
        'xuathang@test.com' => 'shipping_staff',
    ];

    public function test_seeder_is_idempotent_and_assigns_hashed_credentials(): void
    {
        $seeder = app(RolesAndTestEmployeesSeeder::class);
        $seeder->run();
        $seeder->run();

        $emails = [...array_keys(self::ACTIVE_ACCOUNTS), 'locked@test.com', 'inactive@test.com'];
        $users = User::query()->with('role')->whereIn('email', $emails)->get()->keyBy('email');

        $this->assertCount(9, $users);

        foreach (self::ACTIVE_ACCOUNTS as $email => $roleKey) {
            $this->assertSame($roleKey, $users[$email]->role?->key);
            $this->assertSame('active', $users[$email]->status);
            $this->assertTrue(Hash::check('123456', $users[$email]->password));
            $this->assertNotSame('123456', $users[$email]->password);
        }

        $this->assertSame('locked', $users['locked@test.com']->status);
        $this->assertSame('inactive', $users['inactive@test.com']->status);
    }

    public function test_all_active_test_accounts_can_login(): void
    {
        app(RolesAndTestEmployeesSeeder::class)->run();

        foreach (array_keys(self::ACTIVE_ACCOUNTS) as $email) {
            $response = $this->postJson('/graphql', [
                'query' => <<<'GRAPHQL'
                    mutation Login($email: String!, $password: String!) {
                      login(email: $email, password: $password) { access_token user { email } }
                    }
                    GRAPHQL,
                'variables' => ['email' => $email, 'password' => '123456'],
            ]);

            $response->assertJsonMissingPath('errors');
            $response->assertJsonPath('data.login.user.email', $email);
            $this->assertNotEmpty($response->json('data.login.access_token'));
        }
    }

    public function test_locked_and_inactive_test_accounts_return_expected_login_messages(): void
    {
        app(RolesAndTestEmployeesSeeder::class)->run();

        foreach ([
            'locked@test.com' => 'Tài khoản của bạn đang tạm khóa.',
            'inactive@test.com' => 'Tài khoản này đã ngừng hoạt động.',
        ] as $email => $message) {
            $response = $this->postJson('/graphql', [
                'query' => 'mutation { login(email: "'.$email.'", password: "123456") { access_token } }',
            ]);

            $response->assertJsonPath('errors.0.message', $message);
        }
    }

    public function test_each_role_can_query_its_module_and_non_admin_cannot_query_employees(): void
    {
        app(RolesAndTestEmployeesSeeder::class)->run();

        $queries = [
            'admin@test.com' => '{ employees(first: 1) { paginatorInfo { total } } }',
            'sales@test.com' => '{ customers(first: 1) { paginatorInfo { total } } }',
            'cskh@test.com' => '{ orders(first: 1) { paginatorInfo { total } } }',
            'khotq@test.com' => '{ cnPackages(first: 1) { paginatorInfo { total } } }',
            'khovn@test.com' => '{ vietnamWarehousePackages(first: 1) { paginatorInfo { total } } }',
            'ketoan@test.com' => '{ paymentVouchers(first: 1) { paginatorInfo { total } } }',
            'xuathang@test.com' => '{ shippingTasks(page: 1, first: 1) { paginatorInfo { total } } }',
        ];

        foreach ($queries as $email => $query) {
            $user = User::query()->where('email', $email)->firstOrFail();
            Sanctum::actingAs($user, ['*'], 'api');

            $this->postJson('/graphql', ['query' => $query])->assertJsonMissingPath('errors');

            if ($email !== 'admin@test.com') {
                $this->postJson('/graphql', [
                    'query' => '{ employees(first: 1) { paginatorInfo { total } } }',
                ])->assertJsonPath('errors.0.message', 'Bạn không có quyền thực hiện thao tác này.');
            }
        }
    }
}
