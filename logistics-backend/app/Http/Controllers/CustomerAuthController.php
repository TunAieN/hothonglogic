<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerAccount;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class CustomerAuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $emailVerificationRequired = $this->emailVerificationRequired();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email:rfc', 'max:191'],
            'phone' => ['required', 'string', 'max:30'],
            'password' => ['required', 'confirmed', Password::min(12)->letters()->numbers()],
            'accepted_terms' => ['accepted'],
        ]);

        $email = Str::lower(trim($data['email']));
        $phone = $this->normalizeVietnamPhone($data['phone']);
        if (! $phone) {
            return response()->json(['code' => 'VALIDATION_ERROR', 'message' => 'Số điện thoại không hợp lệ.', 'errors' => ['phone' => ['Số điện thoại không hợp lệ.']]], 422);
        }

        if (CustomerAccount::where('email', $email)->orWhere('phone_e164', $phone)->exists()) {
            return response()->json(['code' => 'ACCOUNT_EXISTS', 'message' => 'Email hoặc số điện thoại đã được sử dụng.'], 422);
        }

        $localPhone = '0'.substr($phone, 3);
        $phoneDigits = preg_replace('/\D+/', '', $phone);
        $possibleExistingCustomer = Customer::whereRaw('LOWER(email) = ?', [$email])
            ->orWhereIn(DB::raw("REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '')"), [$phone, $phoneDigits, $localPhone])
            ->exists();
        if ($possibleExistingCustomer) {
            $this->audit(null, null, 'existing_customer_link_review_requested', $request, ['email_hash' => hash('sha256', $email)]);

            return response()->json([
                'code' => 'LINK_REVIEW_REQUIRED',
                'message' => 'Thông tin có thể trùng hồ sơ đã có. Vui lòng liên hệ hỗ trợ để xác minh và liên kết an toàn.',
            ], 409);
        }

        try {
            $account = DB::transaction(function () use ($data, $email, $phone, $request, $emailVerificationRequired) {
                $customer = Customer::create([
                    'code' => $this->newCustomerCode(),
                    'name' => trim($data['name']),
                    'phone' => $phone,
                    'email' => $email,
                    'status' => 'active',
                ]);
                $account = CustomerAccount::create([
                    'customer_id' => $customer->id,
                    'email' => $email,
                    'phone_e164' => $phone,
                    'password' => $data['password'],
                    'status' => $emailVerificationRequired ? 'pending' : 'active',
                ]);
                $this->audit($account->id, $customer->id, 'registered', $request);

                return $account;
            }, 3);
        } catch (QueryException $exception) {
            if ((string) $exception->getCode() === '23000') {
                return response()->json(['code' => 'ACCOUNT_EXISTS', 'message' => 'Email hoặc số điện thoại đã được sử dụng.'], 422);
            }
            throw $exception;
        }

        $sent = $emailVerificationRequired
            ? $this->sendVerification($account, $request)
            : false;

        return response()->json([
            'message' => $emailVerificationRequired
                ? 'Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.'
                : 'Đăng ký tài khoản thành công. Bạn có thể đăng nhập ngay.',
            'email_verification_required' => $emailVerificationRequired,
            'verification_email_sent' => $sent,
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $email = Str::lower(trim($data['email']));
        $key = 'customer-login:'.hash('sha256', $email).'|'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json(['code' => 'TOO_MANY_ATTEMPTS', 'message' => 'Không thể đăng nhập. Vui lòng thử lại sau.'], 429);
        }

        $account = CustomerAccount::with('customer')->where('email', $email)->first();
        if (! $account || ! Hash::check($data['password'], $account->password)) {
            RateLimiter::hit($key, 60);

            return response()->json(['code' => 'INVALID_CREDENTIALS', 'message' => 'Email hoặc mật khẩu không chính xác.'], 422);
        }
        if ($account->status === 'locked') {
            return response()->json(['code' => 'ACCOUNT_UNAVAILABLE', 'message' => 'Tài khoản hiện không thể đăng nhập.'], 403);
        }
        $emailVerificationRequired = $this->emailVerificationRequired();
        if ($emailVerificationRequired && ! $account->email_verified_at) {
            return response()->json(['code' => 'EMAIL_NOT_VERIFIED', 'message' => 'Vui lòng xác minh email trước khi đăng nhập.'], 403);
        }
        $pendingOnlyForEmailVerification = ! $emailVerificationRequired
            && $account->status === 'pending'
            && ! $account->email_verified_at;
        if (($account->status !== 'active' && ! $pendingOnlyForEmailVerification) || $account->customer?->status !== 'active') {
            return response()->json(['code' => 'ACCOUNT_UNAVAILABLE', 'message' => 'Tài khoản hiện không thể đăng nhập.'], 403);
        }

        RateLimiter::clear($key);
        Auth::guard('customer')->login($account, false);
        $request->session()->regenerate();
        $request->session()->put('customer_password_fingerprint', hash('sha256', $account->password));
        $account->forceFill(['last_login_at' => now()])->save();
        $this->audit($account->id, $account->customer_id, 'login', $request);

        return response()->json(['account' => $this->accountPayload($account)]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['account' => $this->accountPayload($request->user('customer')->load('customer'))]);
    }

    public function logout(Request $request): JsonResponse
    {
        $account = $request->user('customer');
        Auth::guard('customer')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        $this->audit($account?->id, $account?->customer_id, 'logout', $request);

        return response()->json(['message' => 'Đã đăng xuất.']);
    }

    public function verify(Request $request, string $token): JsonResponse
    {
        $row = DB::table('customer_email_verification_tokens')->where('token_hash', hash('sha256', $token))->whereNull('used_at')->first();
        if (! $row || now()->greaterThan($row->expires_at)) {
            return response()->json(['code' => 'INVALID_TOKEN', 'message' => 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.'], 422);
        }
        $account = CustomerAccount::findOrFail($row->customer_account_id);
        DB::transaction(function () use ($row, $account) {
            $account->forceFill(['email_verified_at' => now(), 'status' => 'active'])->save();
            DB::table('customer_email_verification_tokens')->where('id', $row->id)->update(['used_at' => now(), 'updated_at' => now()]);
        });
        $this->audit($account->id, $account->customer_id, 'email_verified', $request);

        return response()->json(['message' => 'Email đã được xác minh. Bạn có thể đăng nhập.']);
    }

    public function resendVerification(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        if (! $this->emailVerificationRequired()) {
            return response()->json([
                'message' => 'Tính năng xác minh email hiện đang tạm tắt.',
                'email_verification_required' => false,
                'verification_email_sent' => false,
            ]);
        }
        $account = CustomerAccount::where('email', Str::lower(trim($data['email'])))->whereNull('email_verified_at')->first();
        if ($account) {
            $this->sendVerification($account, $request);
        }

        return response()->json([
            'message' => 'Nếu tài khoản phù hợp tồn tại, email xác minh sẽ được gửi.',
            'email_verification_required' => true,
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        $account = CustomerAccount::where('email', Str::lower(trim($data['email'])))->first();
        if ($account) {
            $token = Str::random(64);
            DB::table('customer_password_reset_tokens')->where('customer_account_id', $account->id)->delete();
            DB::table('customer_password_reset_tokens')->insert([
                'customer_account_id' => $account->id, 'token_hash' => hash('sha256', $token),
                'expires_at' => now()->addMinutes(60), 'created_at' => now(), 'updated_at' => now(),
            ]);
            $url = rtrim(config('app.customer_web_url', config('app.url')), '/').'/dat-lai-mat-khau?token='.urlencode($token).'&email='.urlencode($account->email);
            try {
                Mail::raw("Đặt lại mật khẩu VietTrung Order (hiệu lực 60 phút): {$url}", fn ($mail) => $mail->to($account->email)->subject('Đặt lại mật khẩu VietTrung Order'));
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return response()->json(['message' => 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'], 'token' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(12)->letters()->numbers()],
        ]);
        $account = CustomerAccount::where('email', Str::lower(trim($data['email'])))->first();
        $row = $account ? DB::table('customer_password_reset_tokens')->where('customer_account_id', $account->id)->where('token_hash', hash('sha256', $data['token']))->whereNull('used_at')->first() : null;
        if (! $row || now()->greaterThan($row->expires_at)) {
            return response()->json(['code' => 'INVALID_TOKEN', 'message' => 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'], 422);
        }
        DB::transaction(function () use ($account, $row, $data) {
            $account->update(['password' => $data['password']]);
            DB::table('customer_password_reset_tokens')->where('id', $row->id)->update(['used_at' => now(), 'updated_at' => now()]);
        });

        return response()->json(['message' => 'Mật khẩu đã được đặt lại.']);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(12)->letters()->numbers()],
        ]);
        $account = $request->user('customer');
        if (! Hash::check($data['current_password'], $account->password)) {
            return response()->json(['code' => 'INVALID_CURRENT_PASSWORD', 'message' => 'Mật khẩu hiện tại không chính xác.'], 422);
        }
        $account->update(['password' => $data['password']]);
        $request->session()->regenerate();
        $request->session()->put('customer_password_fingerprint', hash('sha256', $account->fresh()->password));
        $this->audit($account->id, $account->customer_id, 'password_changed', $request);

        return response()->json(['message' => 'Mật khẩu đã được thay đổi.']);
    }

    private function sendVerification(CustomerAccount $account, Request $request): bool
    {
        $token = Str::random(64);
        DB::table('customer_email_verification_tokens')->where('customer_account_id', $account->id)->delete();
        DB::table('customer_email_verification_tokens')->insert([
            'customer_account_id' => $account->id, 'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addHours(24), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $url = route('customer-auth.verify', ['token' => $token]);
        try {
            Mail::raw("Xác minh tài khoản VietTrung Order (hiệu lực 24 giờ): {$url}", fn ($mail) => $mail->to($account->email)->subject('Xác minh tài khoản VietTrung Order'));
            $this->audit($account->id, $account->customer_id, 'verification_sent', $request);

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }

    private function accountPayload(CustomerAccount $account): array
    {
        return [
            'id' => $account->id, 'customer_id' => $account->customer_id,
            'customer_code' => $account->customer->code, 'name' => $account->customer->name,
            'email' => $account->email, 'phone' => $account->phone_e164, 'status' => $account->status,
            'email_verified' => (bool) $account->email_verified_at,
            'email_verification_required' => $this->emailVerificationRequired(),
            'created_at' => $account->created_at?->toISOString(),
        ];
    }

    private function emailVerificationRequired(): bool
    {
        return config('customer_auth.email_verification_required', true) === true;
    }

    private function normalizeVietnamPhone(string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', $phone);
        if (str_starts_with($digits, '84')) {
            $digits = '0'.substr($digits, 2);
        }

        return preg_match('/^0(3|5|7|8|9)\d{8}$/', $digits) ? '+84'.substr($digits, 1) : null;
    }

    private function newCustomerCode(): string
    {
        do {
            $code = 'KH'.strtoupper(Str::random(8));
        } while (Customer::where('code', $code)->exists());

        return $code;
    }

    private function audit(?int $accountId, ?int $customerId, string $event, Request $request, array $metadata = []): void
    {
        DB::table('customer_account_audit_logs')->insert([
            'customer_account_id' => $accountId, 'customer_id' => $customerId, 'event' => $event,
            'metadata' => $metadata ? json_encode($metadata) : null, 'ip_address' => $request->ip(), 'created_at' => now(),
        ]);
    }
}
