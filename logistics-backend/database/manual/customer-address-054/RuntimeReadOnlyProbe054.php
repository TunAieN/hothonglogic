<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__, 3).'/vendor/autoload.php';
$app = require dirname(__DIR__, 3).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$identity = DB::selectOne('SELECT CURRENT_USER() AS user, DATABASE() AS db, @@port AS port, @@version AS version');
$tls = DB::selectOne("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
$migration = DB::selectOne(
    "SELECT batch FROM migrations WHERE migration = '2026_11_27_000054_add_customer_order_delivery_address_support'"
);
$countryMigration = DB::selectOne(
    "SELECT batch FROM migrations WHERE migration = '2026_11_27_000055_add_country_to_customer_delivery_addresses'"
);

echo json_encode([
    'database' => $identity->db ?? null,
    'port' => (int) ($identity->port ?? 0),
    'user' => $identity->user ?? null,
    'mysql' => $identity->version ?? null,
    'tls' => $tls->Value ?? $tls->value ?? null,
    'migration_054' => (int) (DB::selectOne(
        "SELECT COUNT(*) AS n FROM migrations WHERE migration = '2026_11_27_000054_add_customer_order_delivery_address_support'"
    )->n ?? 0),
    'migration_054_batch' => isset($migration->batch) ? (int) $migration->batch : null,
    'migration_055_batch' => isset($countryMigration->batch) ? (int) $countryMigration->batch : null,
    'duplicate_defaults' => (int) (DB::selectOne(
        'SELECT COUNT(*) AS n FROM (SELECT customer_id FROM customer_addresses WHERE is_default = 1 GROUP BY customer_id HAVING COUNT(*) > 1) duplicates'
    )->n ?? 0),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), PHP_EOL;
