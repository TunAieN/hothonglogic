<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

define('LARAVEL_START', microtime(true));

require dirname(__DIR__, 3).'/vendor/autoload.php';
$app = require dirname(__DIR__, 3).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$pdo = DB::connection()->getPdo();
$status = collect(DB::select('SHOW STATUS WHERE Variable_name IN (?, ?)', ['Ssl_cipher', 'Ssl_version']))
    ->mapWithKeys(fn ($row) => [$row->Variable_name => $row->Value]);

echo json_encode([
    'user' => DB::scalar('SELECT CURRENT_USER()'),
    'database' => DB::scalar('SELECT DATABASE()'),
    'port' => (int) DB::scalar("SELECT @@port"),
    'mysql' => DB::scalar('SELECT VERSION()'),
    'tls_cipher' => $status->get('Ssl_cipher'),
    'tls_version' => $status->get('Ssl_version'),
    'migration_056' => (int) DB::table('migrations')
        ->where('migration', '2026_11_27_000056_add_receiver_user_to_cn_packages')
        ->count(),
    'receiver_column' => Schema::hasColumn('cn_packages', 'receiver_user_id'),
], JSON_THROW_ON_ERROR);
