<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$root = dirname(__DIR__, 3);
require $root.'/vendor/autoload.php';
$app = require $root.'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$identity = DB::selectOne('SELECT CURRENT_USER() AS account, DATABASE() AS db, @@port AS port, @@version AS version');
$cipher = DB::selectOne("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
$tables = DB::selectOne("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('taobao_purchase_orders','taobao_purchase_order_items','taobao_purchase_order_trackings')");
$migration = DB::table('migrations')->where('migration', '2026_11_27_000057_create_taobao_purchase_order_domain')->count();

echo json_encode([
    'account' => $identity->account,
    'database' => $identity->db,
    'port' => (int) $identity->port,
    'mysql' => $identity->version,
    'tls' => $cipher->Value,
    'tables_057' => (int) $tables->count,
    'migration_057' => (int) $migration,
], JSON_UNESCAPED_SLASHES);
