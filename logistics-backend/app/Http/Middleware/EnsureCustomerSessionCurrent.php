<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureCustomerSessionCurrent
{
    public function handle(Request $request, Closure $next): Response
    {
        $account = $request->user('customer');
        $fingerprint = $request->session()->get('customer_password_fingerprint');
        if (! $account || ! is_string($fingerprint) || ! hash_equals($fingerprint, hash('sha256', $account->password))) {
            Auth::guard('customer')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json(['code' => 'SESSION_REVOKED', 'message' => 'Phiên đăng nhập đã hết hiệu lực.'], 401);
        }

        return $next($request);
    }
}
