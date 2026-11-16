<?php

use App\Http\Controllers\CustomerAuthController;
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
    Route::get('workspace', [CustomerPurchaseController::class, 'workspace']);
    Route::get('orders', [CustomerPurchaseController::class, 'orders']);
    Route::get('orders/{order}', [CustomerPurchaseController::class, 'showOrder'])->whereNumber('order');
    Route::get('orders/{order}/history', [CustomerPurchaseController::class, 'orderHistory'])->whereNumber('order');

    Route::middleware('business.writes')->group(function () {
        Route::post('drafts', [CustomerPurchaseController::class, 'storeDraft']);
        Route::patch('drafts/{draft}', [CustomerPurchaseController::class, 'updateDraft'])->whereNumber('draft');
        Route::delete('drafts/{draft}', [CustomerPurchaseController::class, 'destroyDraft'])->whereNumber('draft');
        Route::post('drafts/{draft}/submit', [CustomerPurchaseController::class, 'submitDraft'])->whereNumber('draft');
        Route::post('cart/items', [CustomerPurchaseController::class, 'addCartItem']);
        Route::patch('cart/items/{item}', [CustomerPurchaseController::class, 'updateCartItem'])->whereNumber('item');
        Route::delete('cart/items/{item}', [CustomerPurchaseController::class, 'destroyCartItem'])->whereNumber('item');
        Route::post('cart/submit', [CustomerPurchaseController::class, 'submitCart']);
        Route::post('cart/save-draft', [CustomerPurchaseController::class, 'saveCartAsDraft']);
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
