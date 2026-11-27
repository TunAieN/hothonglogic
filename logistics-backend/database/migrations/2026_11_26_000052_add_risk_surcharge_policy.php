<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('risk_deposit_policies', function (Blueprint $table) {
            $table->decimal('surcharge_percent', 5, 2)->nullable()->after('minimum_deposit_percent');
            $table->unique('surcharge_percent', 'risk_deposit_surcharge_unique');
        });

        // Configuration only. It remains financially inactive while the customer's
        // VIP tier has deposit_policy_enabled = false.
        foreach (['low' => 5, 'medium' => 10, 'high' => 20, 'special' => 30] as $code => $surcharge) {
            DB::table('risk_deposit_policies')->where('code', $code)->update([
                'surcharge_percent' => $surcharge,
                'updated_at' => now(),
            ]);
        }

        Schema::table('order_deposit_policy_snapshots', function (Blueprint $table) {
            $table->decimal('risk_surcharge_percent', 5, 2)->nullable()->after('risk_minimum_percent');
            $table->decimal('additive_percent', 5, 2)->nullable()->after('risk_surcharge_percent');
            $table->string('policy_formula', 60)->nullable()->after('additive_percent');
            $table->string('policy_version', 30)->nullable()->after('policy_formula');
            $table->string('automatic_risk_code', 30)->nullable()->after('risk_reason');
            $table->text('automatic_risk_reason')->nullable()->after('automatic_risk_code');
            $table->string('risk_selection_source', 20)->default('manual')->after('automatic_risk_reason');
            $table->json('risk_evidence')->nullable()->after('risk_selection_source');
        });
    }

    public function down(): void
    {
        // Intentionally non-destructive. Snapshot columns are financial audit data.
        // Reverting activation is done by disabling deposit_policy_enabled, not by
        // dropping historical policy evidence.
    }
};
