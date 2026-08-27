<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vn_packages', function (Blueprint $table) {
            $table->string('error_resolution_status', 30)->nullable()->after('exception_reason');
            $table->text('resolution_note')->nullable()->after('error_resolution_status');
            $table->foreignId('resolved_by')->nullable()->after('resolution_note')->constrained('users')->nullOnDelete();
            $table->dateTime('error_detected_at')->nullable()->after('resolved_by');
            $table->dateTime('error_resolved_at')->nullable()->after('error_detected_at');

            $table->index(['received_at', 'inspection_status'], 'vn_packages_receipt_workflow_index');
            $table->index('error_resolution_status', 'vn_packages_error_resolution_index');
        });

        DB::table('vn_packages')
            ->whereNull('received_at')
            ->where(function ($query) {
                $query->whereIn('inspection_status', ['damaged', 'mismatched', 'extra'])
                    ->orWhere('requires_item_inspection', true);
            })
            ->update([
                'error_resolution_status' => 'pending',
                'error_detected_at' => DB::raw('COALESCE(scanned_at, created_at)'),
            ]);
    }

    public function down(): void
    {
        Schema::table('vn_packages', function (Blueprint $table) {
            $table->dropIndex('vn_packages_receipt_workflow_index');
            $table->dropIndex('vn_packages_error_resolution_index');
            $table->dropConstrainedForeignId('resolved_by');
            $table->dropColumn(['error_resolution_status', 'resolution_note', 'error_detected_at', 'error_resolved_at']);
        });
    }
};
