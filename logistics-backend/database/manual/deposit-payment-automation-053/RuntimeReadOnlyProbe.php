<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__, 3).'/vendor/autoload.php';
$app = require dirname(__DIR__, 3).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$identity = DB::selectOne('SELECT CURRENT_USER() AS user, DATABASE() AS db, @@port AS port, @@version AS version');
$tls = DB::selectOne("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
$payload = [
    'database' => $identity->db ?? null,
    'port' => (int) ($identity->port ?? 0),
    'user' => $identity->user ?? null,
    'mysql' => $identity->version ?? null,
    'tls' => $tls->Value ?? $tls->value ?? null,
    'sepay_enabled' => config('sepay.enabled') === true,
    'webhook_enabled' => config('sepay.webhook_enabled') === true,
    'deposit_auto_confirmation_enabled' => config('sepay.deposit_auto_confirmation_enabled') === true,
    'direct_voucher_payment_enabled' => config('sepay.direct_voucher_payment_enabled') === true,
    'notification_table' => DB::selectOne("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='customer_notifications'")->n ?? 0,
];

echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), PHP_EOL;
