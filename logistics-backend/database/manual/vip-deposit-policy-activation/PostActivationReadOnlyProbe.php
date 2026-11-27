<?php

use App\Models\Order;
use App\Services\Orders\OrderDepositPolicyService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__, 3).'/vendor/autoload.php';

$app = require dirname(__DIR__, 3).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$order = Order::query()
    ->where('status', 'pending')
    ->whereHas('customer.vipTier', fn ($query) => $query->where('code', 'bronze'))
    ->whereDoesntHave('depositPolicySnapshot')
    ->with(['items', 'customer.vipTier'])
    ->orderByDesc('id')
    ->firstOrFail();

$preview = app(OrderDepositPolicyService::class)->preview($order, 'low');

echo json_encode([
    'order' => [
        'id' => $order->id,
        'code' => $order->order_code,
        'status' => $order->status,
        'has_deposit_voucher' => $order->depositVoucher()->exists(),
        'has_policy_snapshot' => $order->depositPolicySnapshot()->exists(),
    ],
    'preview' => [
        'vip_code' => $preview['vip_code'],
        'vip_policy_enabled' => $preview['vip_policy_enabled'],
        'vip_effective_percent' => $preview['vip_effective_percent'],
        'risk_code' => $preview['risk_code'],
        'risk_surcharge_percent' => $preview['risk_surcharge_percent'],
        'recommended_percent' => $preview['recommended_percent'],
        'fallback_applied' => $preview['fallback_applied'],
        'policy_formula' => $preview['policy_formula'],
        'deposit_amount_vnd' => $preview['deposit_amount_vnd'],
    ],
    'counts' => [
        'orders' => (int) DB::table('orders')->count(),
        'payment_vouchers' => (int) DB::table('payment_vouchers')->count(),
        'payment_transactions' => (int) DB::table('payment_transactions')->count(),
        'customer_balance_ledgers' => (int) DB::table('customer_balance_ledgers')->count(),
        'sepay_webhook_events' => (int) DB::table('sepay_webhook_events')->count(),
        'order_deposit_policy_snapshots' => (int) DB::table('order_deposit_policy_snapshots')->count(),
    ],
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR).PHP_EOL;
