<?php

use App\GraphQL\Resolvers\CnPackageResolver;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

define('LARAVEL_START', microtime(true));

require dirname(__DIR__, 3).'/vendor/autoload.php';
$app = require dirname(__DIR__, 3).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

/** @var CnPackageResolver $resolver */
$resolver = $app->make(CnPackageResolver::class);
$knownOrderCode = 'REQ-6854E6C503560102433A';
$storedTracking = DB::table('order_trackings')
    ->whereNotNull('tracking_number')
    ->where('tracking_number', '!=', '')
    ->value('tracking_number');
$duplicateTracking = DB::table('cn_packages')
    ->whereNotNull('tracking_number')
    ->where('tracking_number', '!=', '')
    ->value('tracking_number');

$orderCodeResult = $resolver->trackingInputValidation(null, ['tracking_number' => $knownOrderCode]);
$storedTrackingResult = $storedTracking
    ? $resolver->trackingInputValidation(null, ['tracking_number' => $storedTracking])
    : null;
$duplicateResult = $duplicateTracking
    ? $resolver->trackingInputValidation(null, ['tracking_number' => $duplicateTracking])
    : null;

echo json_encode([
    'database' => DB::scalar('SELECT DATABASE()'),
    'port' => (int) DB::scalar('SELECT @@port'),
    'packages' => (int) DB::table('cn_packages')->count(),
    'failed_request_rows' => (int) DB::table('cn_packages')->where('tracking_number', $knownOrderCode)->count(),
    'order_code_validation' => $orderCodeResult,
    'stored_tracking_available' => $storedTracking !== null,
    'stored_tracking_validation' => $storedTrackingResult,
    'duplicate_tracking_available' => $duplicateTracking !== null,
    'duplicate_tracking_validation' => $duplicateResult,
], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
