<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAccount;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class CustomerAuthenticationQaE2ETest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertApprovedMysqlTestConnection();
        Config::set('customer_auth.email_verification_required', true);
        Mail::fake();
    }

    public function test_customer_registration_verification_login_session_logout_and_reset(): void
    {
        $password = 'SyntheticQaPassword123';
        $newPassword = 'SyntheticQaPassword456';
        $email = 'customer.qa@example.invalid';

        $this->postJson('/customer-auth/register', [
            'name' => 'Synthetic QA Customer',
            'email' => $email,
            'phone' => '0912345678',
            'password' => $password,
            'password_confirmation' => $password,
            'accepted_terms' => true,
        ])->assertCreated()
            ->assertJsonPath('email_verification_required', true)
            ->assertJsonPath('verification_email_sent', true);

        $account = CustomerAccount::where('email', $email)->firstOrFail();
        $this->assertNull($account->email_verified_at);
        $this->getJson('/customer-auth/me')->assertUnauthorized();

        $verificationToken = 'synthetic-qa-verification-token';
        DB::table('customer_email_verification_tokens')->where('customer_account_id', $account->id)->delete();
        DB::table('customer_email_verification_tokens')->insert([
            'customer_account_id' => $account->id,
            'token_hash' => hash('sha256', $verificationToken),
            'expires_at' => now()->addHour(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->getJson('/customer-auth/verify/'.$verificationToken)->assertOk();
        $this->getJson('/customer-auth/verify/'.$verificationToken)->assertUnprocessable();

        $this->postJson('/customer-auth/login', ['email' => $email, 'password' => $password])
            ->assertOk()
            ->assertJsonPath('account.customer_id', $account->customer_id);
        $this->getJson('/customer-auth/me')
            ->assertOk()
            ->assertJsonPath('account.id', $account->id)
            ->assertJsonMissingPath('account.password');
        $this->postJson('/graphql', ['query' => '{ me { id email } }'])
            ->assertOk()
            ->assertJsonPath('data.me', null);
        $this->postJson('/customer-auth/logout')->assertOk();
        $this->getJson('/customer-auth/me')->assertUnauthorized();

        $this->postJson('/customer-auth/forgot-password', ['email' => $email])->assertOk();
        $resetToken = 'synthetic-qa-reset-token';
        DB::table('customer_password_reset_tokens')->where('customer_account_id', $account->id)->delete();
        DB::table('customer_password_reset_tokens')->insert([
            'customer_account_id' => $account->id,
            'token_hash' => hash('sha256', $resetToken),
            'expires_at' => now()->addHour(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $resetPayload = [
            'email' => $email,
            'token' => $resetToken,
            'password' => $newPassword,
            'password_confirmation' => $newPassword,
        ];
        $this->postJson('/customer-auth/reset-password', $resetPayload)->assertOk();
        $this->assertTrue(Hash::check($newPassword, $account->fresh()->password));
        $this->postJson('/customer-auth/reset-password', $resetPayload)->assertUnprocessable();
        $this->postJson('/customer-auth/login', ['email' => $email, 'password' => $newPassword])->assertOk();
    }

    public function test_existing_customer_requires_link_review_and_principals_stay_isolated(): void
    {
        Customer::create([
            'code' => 'QA-EXISTING',
            'name' => 'Synthetic Existing Customer',
            'phone' => '+84987654321',
            'email' => 'existing.qa@example.invalid',
            'status' => 'active',
        ]);

        $this->postJson('/customer-auth/register', [
            'name' => 'Synthetic Link Review',
            'email' => 'existing.qa@example.invalid',
            'phone' => '0911111111',
            'password' => 'SyntheticQaPassword123',
            'password_confirmation' => 'SyntheticQaPassword123',
            'accepted_terms' => true,
        ])->assertConflict()->assertJsonPath('code', 'LINK_REVIEW_REQUIRED');

        $this->assertDatabaseMissing('customer_accounts', ['email' => 'existing.qa@example.invalid']);
    }

    public function test_registration_without_email_verification_can_login_immediately_without_sending_mail(): void
    {
        Config::set('customer_auth.email_verification_required', false);
        $password = 'SyntheticQaPassword123';
        $email = 'customer.no-verify.qa@example.invalid';

        $this->postJson('/customer-auth/register', [
            'name' => 'Synthetic QA No Verification',
            'email' => $email,
            'phone' => '0934567890',
            'password' => $password,
            'password_confirmation' => $password,
            'accepted_terms' => true,
        ])->assertCreated()
            ->assertJsonPath('message', 'Đăng ký tài khoản thành công. Bạn có thể đăng nhập ngay.')
            ->assertJsonPath('email_verification_required', false)
            ->assertJsonPath('verification_email_sent', false);

        $account = CustomerAccount::where('email', $email)->firstOrFail();
        $this->assertSame('active', $account->status);
        $this->assertNull($account->email_verified_at);
        $this->assertDatabaseMissing('customer_email_verification_tokens', ['customer_account_id' => $account->id]);
        Mail::assertNothingSent();

        $this->postJson('/customer-auth/login', ['email' => $email, 'password' => 'WrongPassword123'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'INVALID_CREDENTIALS');
        $this->postJson('/customer-auth/login', ['email' => $email, 'password' => $password])
            ->assertOk()
            ->assertJsonPath('account.email_verified', false)
            ->assertJsonPath('account.email_verification_required', false);
        $this->getJson('/customer-auth/me')
            ->assertOk()
            ->assertJsonPath('account.id', $account->id);
        $this->postJson('/graphql', ['query' => '{ me { id email } }'])
            ->assertOk()
            ->assertJsonPath('data.me', null);
        $this->postJson('/customer-auth/logout')->assertOk();
        $this->getJson('/customer-auth/me')->assertUnauthorized();
    }

    public function test_existing_pending_account_can_login_when_verification_is_disabled(): void
    {
        Config::set('customer_auth.email_verification_required', false);
        $customer = Customer::create([
            'code' => 'QA-PENDING-NO-VERIFY',
            'name' => 'Synthetic Pending Customer',
            'phone' => '+84934567891',
            'email' => 'pending.no-verify.qa@example.invalid',
            'status' => 'active',
        ]);
        $account = CustomerAccount::create([
            'customer_id' => $customer->id,
            'email' => 'pending.no-verify.qa@example.invalid',
            'phone_e164' => '+84934567891',
            'password' => 'SyntheticQaPassword123',
            'status' => 'pending',
        ]);

        $this->postJson('/customer-auth/login', [
            'email' => $account->email,
            'password' => 'SyntheticQaPassword123',
        ])->assertOk()->assertJsonPath('account.id', $account->id);

        $this->assertSame('pending', $account->fresh()->status);
        $this->assertNull($account->fresh()->email_verified_at);
    }

    public function test_locked_or_inactive_account_stays_blocked_when_verification_is_disabled(): void
    {
        Config::set('customer_auth.email_verification_required', false);
        $customer = Customer::create([
            'code' => 'QA-LOCKED-NO-VERIFY',
            'name' => 'Synthetic Locked Customer',
            'phone' => '+84934567892',
            'email' => 'locked.no-verify.qa@example.invalid',
            'status' => 'active',
        ]);
        $account = CustomerAccount::create([
            'customer_id' => $customer->id,
            'email' => 'locked.no-verify.qa@example.invalid',
            'phone_e164' => '+84934567892',
            'password' => 'SyntheticQaPassword123',
            'status' => 'locked',
        ]);

        $payload = ['email' => $account->email, 'password' => 'SyntheticQaPassword123'];
        $this->postJson('/customer-auth/login', $payload)
            ->assertForbidden()
            ->assertJsonPath('code', 'ACCOUNT_UNAVAILABLE');

        $account->update(['status' => 'pending']);
        $customer->update(['status' => 'inactive']);
        $this->postJson('/customer-auth/login', $payload)
            ->assertForbidden()
            ->assertJsonPath('code', 'ACCOUNT_UNAVAILABLE');
    }

    public function test_resend_is_side_effect_free_when_verification_is_disabled(): void
    {
        Config::set('customer_auth.email_verification_required', false);

        $this->postJson('/customer-auth/resend-verification', [
            'email' => 'not-used.qa@example.invalid',
        ])->assertOk()
            ->assertJsonPath('email_verification_required', false)
            ->assertJsonPath('verification_email_sent', false);

        $this->assertSame(0, DB::table('customer_email_verification_tokens')->count());
        Mail::assertNothingSent();
    }

    public function test_csrf_cookie_is_available_in_qa(): void
    {
        $this->get('/sanctum/csrf-cookie')->assertNoContent();
    }
}
