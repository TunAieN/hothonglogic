<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$root = dirname(__DIR__, 3);

require $root.'/vendor/autoload.php';
$app = require $root.'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$identity = DB::selectOne('SELECT CURRENT_USER() AS account, DATABASE() AS db, @@port AS port');
$cipher = DB::selectOne("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
$surcharges = DB::getSchemaBuilder()->hasColumn('risk_deposit_policies', 'surcharge_percent')
    ? DB::table('risk_deposit_policies')->orderBy('priority')->pluck('surcharge_percent')->all()
    : null;

echo json_encode([
    'account' => $identity->account,
    'database' => $identity->db,
    'port' => (int) $identity->port,
    'tls' => $cipher->Value,
    'surcharges' => $surcharges,
], JSON_UNESCAPED_SLASHES);
