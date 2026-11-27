<?php

use App\Http\Controllers\CustomerAuthController;
use App\Http\Controllers\CustomerAddressController;
use App\Http\Controllers\CustomerFinanceController;
use App\Http\Controllers\CustomerLogisticsController;
use App\Http\Controllers\CustomerProductLookupController;
use App\Http\Controllers\CustomerProductMetadataController;
use App\Http\Controllers\CustomerPurchaseController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/

Route::get('/', function () {
    return view('welcome');
});

Route::prefix('customer-portal')->middleware(['auth:customer', 'customer.session.current', 'throttle:120,1'])->group(function () {
    Route::get('product-metadata', CustomerProductMetadataController::class)->middleware('throttle:20,1');
    Route::get('product-lookups', [CustomerProductLookupController::class, 'index']);
    Route::get('product-lookups/{lookup}', [CustomerProductLookupController::class, 'show'])->whereNumber('lookup');
    Route::get('orders', [CustomerPurchaseController::class, 'orders']);
    Route::get('dashboard-analytics', [CustomerPurchaseController::class, 'dashboardAnalytics']);
    Route::get('warehouse-packages', [CustomerLogisticsController::class, 'index']);
    Route::get('warehouse-packages/{package}', [CustomerLogisticsController::class, 'show'])->whereNumber('package');
    Route::get('tracking', [CustomerLogisticsController::class, 'tracking']);
    Route::get('finance/summary', [CustomerFinanceController::class, 'summary']);
    Route::get('finance/ledger', [CustomerFinanceController::class, 'ledger']);
    Route::get('finance/payment-vouchers', [CustomerFinanceController::class, 'vouchers']);
    Route::get('finance/payment-intents', [CustomerFinanceController::class, 'intents']);
    Route::get('notifications', [CustomerFinanceController::class, 'notifications']);
    Route::get('finance/payment-intents/{reference}', [CustomerFinanceController::class, 'intentStatus'])->where('reference', '[A-Z0-9]+');
    Route::get('pricing', [CustomerFinanceController::class, 'pricing']);
    Route::post('pricing/estimate', [CustomerFinanceController::class, 'estimate'])->middleware('throttle:30,1');
    Route::get('orders/{order}/shipments', [CustomerLogisticsController::class, 'orderShipments'])->whereNumber('order');
    Route::get('orders/{order}', [CustomerPurchaseController::class, 'showOrder'])->whereNumber('order');
    Route::get('orders/{order}/history', [CustomerPurchaseController::class, 'orderHistory'])->whereNumber('order');
    Route::get('addresses', [CustomerAddressController::class, 'index']);
    Route::get('address-locations/provinces', [CustomerAddressController::class, 'provinces']);
    Route::get('address-locations/districts', [CustomerAddressController::class, 'districts']);
    Route::get('address-locations/wards', [CustomerAddressController::class, 'wards']);

    Route::middleware('business.writes')->group(function () {
        Route::post('purchase-requests', [CustomerPurchaseController::class, 'submitPurchaseRequest']);
        Route::post('addresses', [CustomerAddressController::class, 'store']);
        Route::put('addresses/{address}', [CustomerAddressController::class, 'update'])->whereNumber('address');
        Route::delete('addresses/{address}', [CustomerAddressController::class, 'destroy'])->whereNumber('address');
        Route::post('addresses/{address}/default', [CustomerAddressController::class, 'setDefault'])->whereNumber('address');
        Route::post('product-lookups', [CustomerProductLookupController::class, 'store'])->middleware('throttle:10,1');
        Route::post('finance/top-up-intents', [CustomerFinanceController::class, 'createTopupIntent'])->middleware('throttle:10,1,customer-finance-write:');
        Route::post('finance/payment-vouchers/wallet-checkout', [CustomerFinanceController::class, 'payVouchersFromWallet'])->middleware('throttle:10,1,customer-finance-write:');
        Route::post('finance/payment-vouchers/{voucher}/sepay-intents', [CustomerFinanceController::class, 'createVoucherSepayIntent'])->whereNumber('voucher')->middleware('throttle:10,1,customer-finance-write:');
        Route::post('finance/payment-vouchers/{voucher}/wallet-payments', [CustomerFinanceController::class, 'payVoucherFromWallet'])->whereNumber('voucher')->middleware('throttle:10,1,customer-finance-write:');
        Route::post('notifications/read-all', [CustomerFinanceController::class, 'markAllNotificationsRead'])->middleware('throttle:30,1');
        Route::post('notifications/{notification}/read', [CustomerFinanceController::class, 'markNotificationRead'])->whereNumber('notification')->middleware('throttle:60,1');
    });
});

Route::get('/health', fn () => response()
    ->json(['status' => 'ok'])
    ->header('Cache-Control', 'no-store'));

Route::prefix('customer-auth')->middleware('throttle:60,1')->group(function () {
    Route::post('register', [CustomerAuthController::class, 'register']);
    Route::post('login', [CustomerAuthController::class, 'login']);
    Route::post('resend-verification', [CustomerAuthController::class, 'resendVerification']);
    Route::get('verify/{token}', [CustomerAuthController::class, 'verify'])->name('customer-auth.verify');
    Route::post('forgot-password', [CustomerAuthController::class, 'forgotPassword']);
    Route::post('reset-password', [CustomerAuthController::class, 'resetPassword']);
    Route::middleware(['auth:customer', 'customer.session.current'])->group(function () {
        Route::get('me', [CustomerAuthController::class, 'me']);
        Route::post('logout', [CustomerAuthController::class, 'logout']);
        Route::post('change-password', [CustomerAuthController::class, 'changePassword']);
    });
});
