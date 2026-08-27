<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\VnPackageEvidenceController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/vietnam-warehouse/packages/{vnPackage}/evidences', [VnPackageEvidenceController::class, 'store']);
    Route::delete('/vietnam-warehouse/packages/{vnPackage}/evidences/{evidence}', [VnPackageEvidenceController::class, 'destroy']);
});
