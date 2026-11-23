<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sepay_webhook_events', function (Blueprint $table) {
            if (! Schema::hasColumn('sepay_webhook_events', 'bank_code')) {
                $table->string('bank_code', 40)->nullable()->after('transfer_type');
            }
            if (! Schema::hasColumn('sepay_webhook_events', 'attempt_count')) {
                $table->unsignedInteger('attempt_count')->default(0)->after('reconciliation_reason');
            }
            if (! Schema::hasColumn('sepay_webhook_events', 'last_attempt_at')) {
                $table->timestamp('last_attempt_at')->nullable()->after('attempt_count');
            }
            if (! Schema::hasColumn('sepay_webhook_events', 'next_retry_at')) {
                $table->timestamp('next_retry_at')->nullable()->after('last_attempt_at');
            }
            if (! Schema::hasColumn('sepay_webhook_events', 'last_error_code')) {
                $table->string('last_error_code', 100)->nullable()->after('next_retry_at');
            }
            if (! Schema::hasColumn('sepay_webhook_events', 'last_error_message')) {
                $table->text('last_error_message')->nullable()->after('last_error_code');
            }
            if (! Schema::hasColumn('sepay_webhook_events', 'processing_history')) {
                $table->json('processing_history')->nullable()->after('last_error_message');
            }
            if (! Schema::hasColumn('sepay_webhook_events', 'payload_conflict_count')) {
                $table->unsignedInteger('payload_conflict_count')->default(0)->after('processing_history');
            }
        });

        if (! Schema::hasIndex('sepay_webhook_events', 'sepay_events_retry_idx')) {
            Schema::table('sepay_webhook_events', function (Blueprint $table) {
                $table->index(['status', 'next_retry_at'], 'sepay_events_retry_idx');
            });
        }
        if (! Schema::hasIndex('sepay_webhook_events', 'sepay_events_reference_time_idx')) {
            Schema::table('sepay_webhook_events', function (Blueprint $table) {
                $table->index(['reference', 'occurred_at'], 'sepay_events_reference_time_idx');
            });
        }
    }

    public function down(): void
    {
        // Financial event history is deliberately retained.
    }
};
