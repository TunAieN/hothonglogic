<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__, 3).'/vendor/autoload.php';

$app = require dirname(__DIR__, 3).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$identity = DB::selectOne('SELECT CURRENT_USER() AS account, DATABASE() AS db, @@port AS port, @@version AS version');
$tlsRow = DB::selectOne("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
$counts = [];
foreach ([
    'customers',
    'orders',
    'payment_vouchers',
    'payment_transactions',
    'customer_balance_ledgers',
    'sepay_webhook_events',
    'order_deposit_policy_snapshots',
    'vip_tiers',
    'risk_deposit_policies',
] as $table) {
    $counts[$table] = (int) DB::table($table)->count();
}

$payload = [
    'runtime' => [
        'environment' => app()->environment(),
        'debug' => (bool) config('app.debug'),
        'config_cached' => app()->configurationIsCached(),
        'driver' => DB::connection()->getDriverName(),
        'configured_host' => config('database.connections.mysql.host'),
        'configured_port' => (int) config('database.connections.mysql.port'),
        'configured_database' => config('database.connections.mysql.database'),
        'configured_username' => config('database.connections.mysql.username'),
    ],
    'connection' => [
        'account' => $identity->account,
        'database' => $identity->db,
        'port' => (int) $identity->port,
        'version' => $identity->version,
        'tls' => (string) ($tlsRow->Value ?? $tlsRow->value ?? ''),
    ],
    'counts' => $counts,
    'migrations' => DB::table('migrations')
        ->whereIn('migration', [
            '2026_11_25_000051_create_vip_and_order_deposit_policy_domain',
            '2026_11_26_000052_add_risk_surcharge_policy',
        ])->orderBy('migration')->pluck('batch', 'migration')->all(),
    'enabled_vip_tiers' => (int) DB::table('vip_tiers')->where('deposit_policy_enabled', true)->count(),
];

echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR).PHP_EOL;
