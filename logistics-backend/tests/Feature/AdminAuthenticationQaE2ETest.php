<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\CustomerAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminAuthenticationQaE2ETest extends TestCase
{
    use DatabaseTransactions;

    public function test_admin_login_token_principal_and_permission_are_isolated_to_qa(): void
    {
        $this->assertSame(3311, (int) DB::selectOne('SELECT @@port AS port')->port);
        $role = Role::create([
            'key' => 'qa-reader',
            'name' => 'QA Reader',
            'permissions' => ['employees.read'],
        ]);
        $user = User::create([
            'name' => 'Synthetic QA Admin',
            'email' => 'admin.qa@example.invalid',
            'password' => 'SyntheticQaAdminPassword123',
            'role_id' => $role->id,
            'status' => 'active',
        ]);

        $login = $this->postJson('/graphql', [
            'query' => 'mutation($email: String!, $password: String!) { login(email: $email, password: $password) { access_token user { id email } } }',
            'variables' => ['email' => $user->email, 'password' => 'SyntheticQaAdminPassword123'],
        ])->assertOk()->assertJsonPath('data.login.user.id', (string) $user->id);

        $token = $login->json('data.login.access_token');
        $this->assertIsString($token);
        $this->assertDatabaseCount('personal_access_tokens', 1);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/graphql', ['query' => '{ me { id email } users(first: 5) { data { id } } }'])
            ->assertOk()
            ->assertJsonPath('data.me.email', $user->email)
            ->assertJsonMissingPath('errors');
    }

    public function test_logout_revokes_only_the_current_token_and_works_while_business_writes_are_locked(): void
    {
        config()->set('business.writes_enabled', false);
        $role = Role::create(['key' => 'qa-logout', 'name' => 'QA Logout', 'permissions' => ['employees.read']]);
        $user = User::create([
            'name' => 'Synthetic QA Logout Admin',
            'email' => 'logout.qa@example.invalid',
            'password' => 'SyntheticQaAdminPassword123',
            'role_id' => $role->id,
            'status' => 'active',
        ]);

        $firstToken = $this->loginToken($user);
        $secondToken = $this->loginToken($user);
        $firstTokenId = (int) strtok($firstToken, '|');
        $secondTokenId = (int) strtok($secondToken, '|');
        $this->assertDatabaseCount('personal_access_tokens', 2);

        $this->withToken($firstToken)
            ->postJson('/graphql', ['query' => '{ me { id } }'])
            ->assertJsonPath('data.me.id', (string) $user->id);
        $logoutResponse = $this->withToken($firstToken)
            ->postJson('/graphql', ['query' => 'mutation { logout }'])
            ->assertOk();
        $this->assertNull(
            $logoutResponse->json('errors'),
            json_encode($logoutResponse->json('errors'), JSON_UNESCAPED_UNICODE),
        );
        $logoutResponse->assertJsonPath('data.logout', true);

        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $firstTokenId]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $secondTokenId]);
        Auth::forgetGuards();
        $this->withToken($firstToken)
            ->postJson('/graphql', ['query' => '{ me { id } }'])
            ->assertJsonPath('data.me', null)
            ->assertJsonStructure(['errors']);
        Auth::forgetGuards();
        $this->withToken($secondToken)
            ->postJson('/graphql', ['query' => '{ me { id } }'])
            ->assertJsonPath('data.me.id', (string) $user->id);
    }

    public function test_admin_without_permission_cannot_query_employee_data(): void
    {
        $role = Role::create(['key' => 'qa-no-access', 'name' => 'QA No Access', 'permissions' => []]);
        $user = User::create([
            'name' => 'Synthetic QA Restricted',
            'email' => 'restricted.qa@example.invalid',
            'password' => 'SyntheticQaAdminPassword123',
            'role_id' => $role->id,
            'status' => 'active',
        ]);
        $token = $this->postJson('/graphql', [
            'query' => 'mutation($email: String!, $password: String!) { login(email: $email, password: $password) { access_token } }',
            'variables' => ['email' => $user->email, 'password' => 'SyntheticQaAdminPassword123'],
        ])->json('data.login.access_token');

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/graphql', ['query' => '{ users(first: 5) { data { id } } }'])
            ->assertOk()
            ->assertJsonPath('data.users', null)
            ->assertJsonStructure(['errors']);
    }

    public function test_customer_principal_cannot_revoke_an_admin_token(): void
    {
        config()->set('business.writes_enabled', false);
        $role = Role::create(['key' => 'qa-token-owner', 'name' => 'QA Token Owner', 'permissions' => []]);
        $admin = User::create([
            'name' => 'Synthetic QA Token Owner',
            'email' => 'token-owner.qa@example.invalid',
            'password' => 'SyntheticQaAdminPassword123',
            'role_id' => $role->id,
            'status' => 'active',
        ]);
        $adminToken = $admin->createToken('qa-admin-token')->accessToken;
        $customer = new CustomerAccount(['email' => 'customer-principal.qa@example.invalid']);
        $customer->id = 999999;

        $this->actingAs($customer, 'customer')
            ->postJson('/graphql', ['query' => 'mutation { logout }'])
            ->assertOk()
            ->assertJsonPath('data.logout', null)
            ->assertJsonStructure(['errors']);

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $adminToken->id]);
    }

    private function loginToken(User $user): string
    {
        return (string) $this->postJson('/graphql', [
            'query' => 'mutation($email: String!, $password: String!) { login(email: $email, password: $password) { access_token } }',
            'variables' => ['email' => $user->email, 'password' => 'SyntheticQaAdminPassword123'],
        ])->assertOk()->json('data.login.access_token');
    }
}
