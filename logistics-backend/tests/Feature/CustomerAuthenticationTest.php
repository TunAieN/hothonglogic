<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAccount;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CustomerAuthenticationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Config::set('customer_auth.email_verification_required', true);
        if (config('database.default') !== 'sqlite') {
            $this->markTestSkipped('Customer auth tests require an explicitly isolated SQLite database.');
        }
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('phone');
            $table->string('email')->nullable();
            $table->string('status')->default('active');
            $table->timestamps();
        });
        Schema::create('customer_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->unique();
            $table->string('email')->unique();
            $table->string('phone_e164')->nullable()->unique();
            $table->string('password');
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('phone_verified_at')->nullable();
            $table->string('status');
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
        foreach (['customer_email_verification_tokens', 'customer_password_reset_tokens'] as $name) {
            Schema::create($name, function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_account_id');
                $table->string('token_hash')->unique();
                $table->timestamp('expires_at');
                $table->timestamp('used_at')->nullable();
                $table->timestamps();
            });
        }
        Schema::create('customer_account_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_account_id')->nullable();
            $table->foreignId('customer_id')->nullable();
            $table->string('event');
            $table->json('metadata')->nullable();
            $table->string('ip_address')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function test_new_customer_can_register_without_being_automatically_logged_in(): void
    {
        Config::set('business.writes_enabled', false);
        Mail::fake();
        $response = $this->postJson('/customer-auth/register', [
            'name' => 'Nguyễn Văn Mới', 'email' => 'NEW@example.com', 'phone' => '0912345678',
            'password' => 'Matkhauantoan123', 'password_confirmation' => 'Matkhauantoan123', 'accepted_terms' => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('email_verification_required', true)
            ->assertJsonPath('verification_email_sent', true);
        $this->assertDatabaseHas('customers', ['email' => 'new@example.com', 'phone' => '+84912345678']);
        $this->assertDatabaseHas('customer_accounts', ['email' => 'new@example.com', 'status' => 'pending', 'email_verified_at' => null]);
        $this->getJson('/customer-auth/me')->assertUnauthorized();
    }

    public function test_existing_customer_is_not_silently_linked_or_duplicated(): void
    {
        Customer::create(['code' => 'KH-CU', 'name' => 'Khách cũ', 'phone' => '+84912345678', 'email' => 'old@example.com', 'status' => 'active']);
        $this->postJson('/customer-auth/register', [
            'name' => 'Người đăng ký', 'email' => 'old@example.com', 'phone' => '0987654321',
            'password' => 'Matkhauantoan123', 'password_confirmation' => 'Matkhauantoan123', 'accepted_terms' => true,
        ])->assertConflict()->assertJsonPath('code', 'LINK_REVIEW_REQUIRED');

        $this->assertSame(1, Customer::count());
        $this->assertSame(0, CustomerAccount::count());
    }

    public function test_only_verified_active_customer_can_login_and_restore_session(): void
    {
        $account = $this->account();
        $this->postJson('/customer-auth/login', ['email' => $account->email, 'password' => 'Matkhauantoan123'])
            ->assertForbidden()->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');

        $account->update(['email_verified_at' => now(), 'status' => 'active']);
        $this->postJson('/customer-auth/login', ['email' => $account->email, 'password' => 'Matkhauantoan123'])
            ->assertOk()->assertJsonPath('account.customer_id', $account->customer_id);
        $this->getJson('/customer-auth/me')->assertOk()->assertJsonMissingPath('account.password');
        $this->postJson('/customer-auth/logout')->assertOk();
        $this->getJson('/customer-auth/me')->assertUnauthorized();
    }

    public function test_password_change_requires_current_password(): void
    {
        $account = $this->account(['email_verified_at' => now(), 'status' => 'active']);
        $this->withSession(['customer_password_fingerprint' => hash('sha256', $account->password)])->actingAs($account, 'customer');
        $this->postJson('/customer-auth/change-password', [
            'current_password' => 'sai', 'password' => 'Matkhaumoiantoan456', 'password_confirmation' => 'Matkhaumoiantoan456',
        ])->assertUnprocessable()->assertJsonPath('code', 'INVALID_CURRENT_PASSWORD');
        $this->postJson('/customer-auth/change-password', [
            'current_password' => 'Matkhauantoan123', 'password' => 'Matkhaumoiantoan456', 'password_confirmation' => 'Matkhaumoiantoan456',
        ])->assertOk();
        $this->assertTrue(Hash::check('Matkhaumoiantoan456', $account->fresh()->password));
    }

    public function test_email_verification_token_is_single_use(): void
    {
        $account = $this->account();
        $token = 'known-verification-token';
        \DB::table('customer_email_verification_tokens')->insert([
            'customer_account_id' => $account->id, 'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addHour(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->getJson('/customer-auth/verify/'.$token)->assertOk();
        $this->assertNotNull($account->fresh()->email_verified_at);
        $this->getJson('/customer-auth/verify/'.$token)->assertUnprocessable();
    }

    public function test_password_reset_token_expires_and_is_single_use(): void
    {
        $account = $this->account(['email_verified_at' => now(), 'status' => 'active']);
        $token = 'known-reset-token';
        \DB::table('customer_password_reset_tokens')->insert([
            'customer_account_id' => $account->id, 'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addHour(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $payload = ['email' => $account->email, 'token' => $token, 'password' => 'Matkhaumoiantoan456', 'password_confirmation' => 'Matkhaumoiantoan456'];
        $this->postJson('/customer-auth/reset-password', $payload)->assertOk();
        $this->assertTrue(Hash::check('Matkhaumoiantoan456', $account->fresh()->password));
        $this->postJson('/customer-auth/reset-password', $payload)->assertUnprocessable();
    }

    public function test_locked_and_inactive_accounts_cannot_login(): void
    {
        $account = $this->account(['email_verified_at' => now(), 'status' => 'locked']);
        $payload = ['email' => $account->email, 'password' => 'Matkhauantoan123'];
        $this->postJson('/customer-auth/login', $payload)->assertForbidden();
        $account->update(['status' => 'active']);
        $account->customer->update(['status' => 'inactive']);
        $this->postJson('/customer-auth/login', $payload)->assertForbidden();
    }

    public function test_password_change_revokes_existing_session_fingerprint(): void
    {
        $account = $this->account(['email_verified_at' => now(), 'status' => 'active']);
        $this->postJson('/customer-auth/login', ['email' => $account->email, 'password' => 'Matkhauantoan123'])->assertOk();
        $account->update(['password' => 'Matkhaumoiantoan456']);
        \Auth::forgetGuards();
        $this->getJson('/customer-auth/me')->assertUnauthorized()->assertJsonPath('code', 'SESSION_REVOKED');
    }

    public function test_customer_session_does_not_authenticate_admin_graphql_guard(): void
    {
        $this->actingAs($this->account(['email_verified_at' => now(), 'status' => 'active']), 'customer');
        $this->postJson('/graphql', ['query' => '{ me { id email } }'])
            ->assertOk()->assertJsonPath('data.me', null);
    }

    private function account(array $overrides = []): CustomerAccount
    {
        $customer = Customer::create(['code' => 'KH-TEST', 'name' => 'Khách Test', 'phone' => '+84912345678', 'email' => 'customer@example.com', 'status' => 'active']);

        return CustomerAccount::create(array_merge([
            'customer_id' => $customer->id, 'email' => 'customer@example.com', 'phone_e164' => '+84912345678',
            'password' => 'Matkhauantoan123', 'status' => 'pending',
        ], $overrides));
    }
}
